import { useEffect, useRef, useState } from "react";
import type { Record } from "@/types/record";

interface Props {
  records: Record[];
  onClose: () => void;
  /** Label on the close button. "BACK TO GLOBE" when opened from the globe homepage,
   *  "BACK TO GALLERY" when opened from a gallery page, "CLOSE" if unspecified. */
  closeLabel?: string;
}

const TYPE_LABEL = { vid: "VIDEO", img: "PHOTO", pdf: "DOCUMENT" } as const;

// Once we learn /api/tts isn't available (404 on a static deploy, or quota
// exhausted, etc.) stop hammering it and just use the browser voice for the
// rest of the session. `null` = not yet probed.
let elevenLabsAvailable: boolean | null = null;

export default function RecordModal({ records, onClose, closeLabel = "CLOSE" }: Props) {
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  // Tracks which engine narrated last so we can show a small credit line.
  const [ttsEngine, setTtsEngine] = useState<"elevenlabs" | "browser" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  // Bumped on every play start AND every stop, so an in-flight TTS request that
  // resolves after the user hit STOP (or changed record) becomes a no-op.
  const playTokenRef = useRef(0);
  const rec = records[idx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(records.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [records.length, onClose]);

  function stopSpeech() {
    playTokenRef.current++;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
  }

  // Stop TTS whenever the active record changes or the modal closes.
  useEffect(() => stopSpeech, []);
  useEffect(() => {
    stopSpeech();
    setTtsEngine(null);
  }, [idx]);

  // Pick the best available English voice. Priority — top is best:
  //   1. Google's cloud voices (Chrome bundles "Google US English" / "Google UK English Female";
  //      these stream from Google's servers, very natural)
  //   2. Microsoft "Natural"/"Online" voices (Edge bundles e.g. "Microsoft Aria Online (Natural)")
  //   3. Apple Premium / Enhanced voices on macOS / iOS Safari ("(Premium)" / "(Enhanced)")
  //   4. Named macOS voices that don't carry the suffix but are still better than default
  //   5. Any en-US / en-GB voice
  //   6. Any en-* voice
  // The browser may return an empty list on first call — voices load async.
  function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
    const en = voices.filter((v) => v.lang?.startsWith("en"));
    const enGoodLangs = en.filter((v) => /^en-(US|GB|AU|CA|IE)$/i.test(v.lang));
    return (
      enGoodLangs.find((v) => /^Google\s+(US|UK)\s+English/i.test(v.name)) ||
      enGoodLangs.find((v) => /Online.*Natural/i.test(v.name) || /Microsoft.*Natural/i.test(v.name)) ||
      enGoodLangs.find((v) => /\((Premium|Enhanced|Neural|Natural)\)/i.test(v.name)) ||
      enGoodLangs.find((v) => /^(Samantha|Daniel|Karen|Moira|Tessa|Allison|Ava|Evan|Joelle|Noelle|Susan|Tom|Zoe)$/i.test(v.name)) ||
      enGoodLangs[0] ||
      en[0]
    );
  }

  // Voices populate asynchronously — return what's there, else wait for `voiceschanged`.
  function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const initial = synth.getVoices();
      if (initial.length) return resolve(initial);
      const onChange = () => {
        synth.removeEventListener("voiceschanged", onChange);
        resolve(synth.getVoices());
      };
      synth.addEventListener("voiceschanged", onChange);
      // Safety timeout — if voiceschanged never fires, resolve with whatever we have.
      setTimeout(() => {
        synth.removeEventListener("voiceschanged", onChange);
        resolve(synth.getVoices());
      }, 1500);
    });
  }

  // Browser speechSynthesis fallback.
  async function speakViaBrowser() {
    if (typeof window === "undefined" || !window.speechSynthesis || !rec.blurb) {
      setSpeaking(false);
      return;
    }
    const voices = await getVoicesAsync();
    const utt = new SpeechSynthesisUtterance(rec.blurb);
    // Natural defaults — slowing/lowering the rate+pitch on already-bad voices
    // makes them sound *worse*. Trust good voices to sound good at 1.0.
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    const preferred = pickVoice(voices);
    if (preferred) {
      utt.voice = preferred;
      // Lock the lang to the chosen voice's lang, otherwise some browsers silently
      // re-pick a default voice for the utterance's lang field.
      utt.lang = preferred.lang;
    }
    utt.onend = () => { setSpeaking(false); };
    utt.onerror = () => { setSpeaking(false); };
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
    setTtsEngine("browser");
  }

  // Try the ElevenLabs proxy. Returns "played" on success, "fallback" if the
  // service is unavailable (so the caller falls back to the browser voice), or
  // "cancelled" if the user stopped / changed record while the request was in
  // flight (the caller should do nothing).
  async function speakViaElevenLabs(token: number): Promise<"played" | "fallback" | "cancelled"> {
    if (elevenLabsAvailable === false) return "fallback";
    let res: Response;
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: rec.blurb }),
      });
    } catch {
      elevenLabsAvailable = false;
      return "fallback";
    }
    if (token !== playTokenRef.current) return "cancelled";
    if (!res.ok || !(res.headers.get("content-type") || "").includes("audio")) {
      // 503 (not configured) / 404 (static deploy) / 429 (quota) — stop trying.
      // A transient 5xx (502) we'll allow to retry next time.
      if (res.status !== 502) elevenLabsAvailable = false;
      return "fallback";
    }
    elevenLabsAvailable = true;
    const buf = await res.arrayBuffer();
    if (token !== playTokenRef.current) return "cancelled";
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
    const audio = new Audio(url);
    audio.onended = () => stopSpeech();
    audio.onerror = () => stopSpeech();
    try {
      await audio.play();
    } catch {
      URL.revokeObjectURL(url);
      return "fallback";
    }
    if (token !== playTokenRef.current) {
      audio.pause();
      URL.revokeObjectURL(url);
      return "cancelled";
    }
    audioRef.current = audio;
    audioUrlRef.current = url;
    setSpeaking(true);
    setTtsEngine("elevenlabs");
    return "played";
  }

  async function speakBlurb() {
    if (!rec.blurb) return;
    if (speaking) {
      stopSpeech();
      return;
    }
    const token = ++playTokenRef.current;
    setSpeaking(true); // optimistic — button flips while the request is in flight
    const result = await speakViaElevenLabs(token);
    if (result === "cancelled") return;
    if (result === "played") return;
    // ElevenLabs unavailable — make sure the optimistic state is still ours,
    // then fall back to the browser voice.
    if (token !== playTokenRef.current) return;
    await speakViaBrowser();
  }

  if (!rec) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-enter" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span className="loc">
            <span className="dot" />
            {rec.location?.name || "UNLOCATED"}
          </span>
          <span className={`type-badge ${rec.mediaType}`}>{TYPE_LABEL[rec.mediaType]}</span>
          {records.length > 1 && (
            <span className="counter">
              {idx + 1} / {records.length}
            </span>
          )}
          <button className="close-btn" onClick={onClose} aria-label={closeLabel}>
            <span className="close-x">✕</span>
            <span className="close-label">{closeLabel}</span>
          </button>
        </header>

        <div className="modal-hero">
          {rec.mediaType === "vid" && rec.videoMp4Url ? (
            <video
              key={rec.id}
              controls
              playsInline
              preload="metadata"
              poster={rec.thumbnailUrl ?? undefined}
              src={rec.videoMp4Url}
            />
          ) : rec.mediaType === "vid" && rec.dvidsVideoId ? (
            <iframe
              src={`https://www.dvidshub.net/video/embed/${rec.dvidsVideoId}`}
              allowFullScreen
              title={rec.title}
            />
          ) : rec.mediaType === "img" && rec.assetUrl ? (
            <img src={rec.assetUrl} alt={rec.title} />
          ) : rec.thumbnailUrl ? (
            <img src={rec.thumbnailUrl} alt={`${rec.title} thumbnail`} />
          ) : (
            <div className="modal-hero-placeholder">No preview available</div>
          )}
        </div>

        <div className="modal-body">
          <h2 className="modal-title">{rec.title}</h2>
          <div className="modal-meta">
            <span>
              <em>AGENCY</em> {rec.agency}
            </span>
            {rec.date && (
              <span>
                <em>DATE</em> {rec.date}
              </span>
            )}
            {rec.location && (
              <span>
                <em>LOCATION</em> {rec.location.name}
              </span>
            )}
            {rec.redaction === "TRUE" && <span className="redacted">REDACTED</span>}
          </div>

          {rec.blurb && (
            <div className="modal-blurb-block">
              <div className="tts-controls">
                <button
                  className={`tts-btn ${speaking ? "playing" : ""}`}
                  onClick={speakBlurb}
                  aria-label={speaking ? "Stop reading" : "Read aloud"}
                  title={speaking ? "Stop reading" : "Read aloud"}
                >
                  <span className="tts-icon">{speaking ? "■" : "▶"}</span>
                  <span className="tts-label">{speaking ? "STOP" : "LISTEN"}</span>
                </button>
                {ttsEngine === "elevenlabs" && (
                  <a
                    className="tts-credit"
                    href="https://elevenlabs.io/text-to-speech"
                    target="_blank"
                    rel="noopener"
                    title="Narration generated with ElevenLabs"
                  >
                    voice · ElevenLabs
                  </a>
                )}
              </div>
              <p className="modal-blurb">{rec.blurb}</p>
            </div>
          )}

          <div className="modal-actions">
            {rec.assetUrl && (
              <a className="action primary" href={rec.assetUrl} target="_blank" rel="noopener">
                {rec.mediaType === "vid"
                  ? "OPEN ON DVIDS →"
                  : rec.mediaType === "img"
                  ? "OPEN FULL IMAGE →"
                  : "VIEW SOURCE PDF →"}
              </a>
            )}
            <a className="action" href={rec.sourcePage} target="_blank" rel="noopener">
              WAR.GOV/UFO →
            </a>
          </div>
        </div>

        {records.length > 1 && (
          <nav className="modal-nav">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
              ← PREV
            </button>
            <button
              onClick={() => setIdx((i) => Math.min(records.length - 1, i + 1))}
              disabled={idx === records.length - 1}
            >
              NEXT →
            </button>
          </nav>
        )}
      </div>

      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.7);
          backdrop-filter: blur(4px);
          z-index: 100;  /* above Hud (z-index 7) and dock (7) */
          display: flex; align-items: center; justify-content: center;
          /* top padding clears the 56px Hud + buffer; bottom clears the 56px dock */
          padding: 80px 24px 80px;
          overflow-y: auto;
        }
        .modal {
          width: 100%; max-width: 760px;
          background: linear-gradient(180deg, rgba(20,8,12,.96) 0%, rgba(8,12,20,.96) 100%);
          border: 1px solid rgba(106,255,200,.3);
          border-radius: 4px;
          color: #e8edf3;
          box-shadow: 0 0 30px rgba(0,0,0,.7), 0 0 60px rgba(106,255,200,.1);
          font-family: var(--font-mono);
          display: flex; flex-direction: column;
          max-height: calc(100vh - 160px);
          overflow: hidden;
        }
        .modal-head {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-line);
          flex-shrink: 0;
        }
        .loc {
          color: var(--color-hud);
          font-size: 10px;
          letter-spacing: .25em;
          text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--color-vid);
          box-shadow: 0 0 8px var(--color-vid);
        }
        .type-badge {
          font-size: 9px;
          letter-spacing: .2em;
          padding: 3px 8px;
          border-radius: 2px;
          font-weight: 700;
        }
        .type-badge.vid { background: rgba(255,59,59,.15);  border: 1px solid rgba(255,59,59,.4);  color: #ff8a8a; }
        .type-badge.img { background: rgba(90,215,255,.15); border: 1px solid rgba(90,215,255,.4); color: #8de3ff; }
        .type-badge.pdf { background: rgba(255,200,112,.15); border: 1px solid rgba(255,200,112,.4); color: #ffd690; }
        .counter {
          font-size: 10px;
          letter-spacing: .15em;
          opacity: .55;
          font-variant-numeric: tabular-nums;
        }
        .close-btn {
          margin-left: auto;
          background: rgba(106,255,200,.08);
          border: 1px solid rgba(106,255,200,.3);
          color: var(--color-hud);
          height: 30px;
          padding: 0 12px;
          border-radius: 2px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: .15em;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .close-btn:hover {
          background: rgba(106,255,200,.18);
          border-color: var(--color-hud);
        }
        .close-x { font-size: 14px; line-height: 1; }
        .close-label { display: inline; }

        .modal-hero {
          background: #04060b;
          border-bottom: 1px solid var(--color-line);
          width: 100%;
          /* video plays at 16/9, but never taller than 50% of viewport so the
             blurb has room. on extra-tall windows we cap at 480px. */
          aspect-ratio: 16/9;
          max-height: min(50vh, 480px);
          min-height: 200px;
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .modal-hero iframe {
          width: 100%; height: 100%;
          border: 0;
          display: block;
        }
        .modal-hero img,
        .modal-hero video {
          width: 100%; height: 100%;
          object-fit: contain;
          object-position: center;
          background: #06080d;
          display: block;
        }
        .modal-hero video::-webkit-media-controls-panel {
          background: rgba(8,12,20,.6);
        }
        .modal-hero-placeholder {
          color: rgba(255,255,255,.4);
          font-size: 11px;
          letter-spacing: .15em;
        }

        .modal-body {
          padding: 20px 22px 22px;
          overflow-y: auto;
          flex: 1 1 auto;
          min-height: 0;
        }
        .modal-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          line-height: 1.25;
          margin: 0 0 12px;
        }
        .modal-meta {
          display: flex; flex-wrap: wrap;
          gap: 12px 18px;
          font-size: 10px;
          letter-spacing: .12em;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--color-line);
          color: rgba(232,237,243,.85);
          text-transform: uppercase;
        }
        .modal-meta em {
          font-style: normal;
          color: var(--color-hud);
          margin-right: 6px;
          font-size: 9px;
        }
        .modal-meta .redacted {
          color: var(--color-vid);
          border: 1px solid rgba(255,59,59,.4);
          padding: 2px 6px;
          border-radius: 2px;
          background: rgba(255,59,59,.06);
        }
        .modal-blurb-block {
          margin: 14px 0 18px;
          position: relative;
        }
        .modal-blurb {
          margin: 0;
          font-size: 13px;
          line-height: 1.65;
          color: #d8dde6;
        }
        .tts-controls {
          float: right;
          margin: 0 0 6px 12px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .tts-credit {
          font-family: var(--font-mono);
          font-size: 7.5px;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgba(106,255,200,.45);
          text-decoration: none;
        }
        .tts-credit:hover { color: var(--color-hud); }
        .tts-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: .18em;
          background: rgba(106,255,200,.05);
          border: 1px solid rgba(106,255,200,.4);
          color: var(--color-hud);
          border-radius: 2px;
          cursor: pointer;
          transition: all .15s;
        }
        .tts-btn:hover {
          background: rgba(106,255,200,.12);
          border-color: var(--color-hud);
        }
        .tts-btn.playing {
          background: rgba(255,59,59,.08);
          border-color: rgba(255,59,59,.5);
          color: var(--color-vid);
          animation: tts-pulse 1.4s ease-in-out infinite;
        }
        .tts-icon { font-size: 8px; }
        @keyframes tts-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(255,59,59,0); }
          50%      { box-shadow: 0 0 14px rgba(255,59,59,.4); }
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .action {
          display: inline-flex; align-items: center;
          padding: 8px 14px;
          font-size: 10px;
          letter-spacing: .2em;
          text-decoration: none;
          color: #cdd3dc;
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 2px;
          font-family: var(--font-mono);
          transition: all .15s;
        }
        .action:hover { border-color: var(--color-hud); color: var(--color-hud); }
        .action.primary {
          color: var(--color-bg);
          background: var(--color-hud);
          border-color: var(--color-hud);
        }
        .action.primary:hover {
          background: #8affe0;
        }

        .modal-nav {
          display: flex;
          justify-content: space-between;
          padding: 10px 18px;
          border-top: 1px solid var(--color-line);
          flex-shrink: 0;
        }
        .modal-nav button {
          background: transparent;
          border: 1px solid rgba(255,255,255,.15);
          color: #cdd3dc;
          padding: 6px 14px;
          font-size: 10px;
          letter-spacing: .2em;
          font-family: var(--font-mono);
          border-radius: 2px;
          cursor: pointer;
        }
        .modal-nav button:hover:not(:disabled) {
          border-color: var(--color-hud); color: var(--color-hud);
        }
        .modal-nav button:disabled {
          opacity: .25; cursor: not-allowed;
        }

        /* MOBILE: full-screen modal with stacking layout */
        @media (max-width: 768px) {
          .modal-backdrop {
            padding: 0;
            align-items: stretch;
            /* keep z-index 100 set above */
          }
          .modal {
            max-width: none;
            max-height: none;
            min-height: 100vh;
            border-radius: 0;
            border: none;
            border-top: 1px solid rgba(106,255,200,.3);
          }
          .modal-head {
            padding: 12px 14px;
            gap: 8px;
            flex-wrap: wrap;
          }
          .modal-head .loc {
            font-size: 9px;
            letter-spacing: .18em;
          }
          .modal-head .counter {
            font-size: 9px;
          }
          /* Beef up the close button on mobile so users always know how to
             get back to the globe */
          .close-btn {
            height: 36px;
            padding: 0 14px;
            background: rgba(106,255,200,.14);
            border-color: var(--color-hud);
            font-weight: 600;
          }
          .close-x { font-size: 15px; }
          .modal-hero {
            aspect-ratio: 16/9;
            max-height: 45vh;
            min-height: 180px;
          }
          .modal-body {
            padding: 16px 16px 0;
          }
          /* Pin the action bar to the bottom of the scroll box on mobile so
             the (sometimes red) primary button never floats over content. */
          .modal-actions {
            position: sticky;
            bottom: 0;
            margin: 8px -16px 0;
            padding: 12px 16px 14px;
            background: linear-gradient(180deg, rgba(8,12,20,0) 0%, rgba(4,6,11,.96) 30%);
            backdrop-filter: blur(6px);
            border-top: 1px solid var(--color-line);
            z-index: 1;
          }
          .modal-title {
            font-size: 15px;
          }
          .modal-meta {
            gap: 8px 14px;
            font-size: 9px;
          }
          .modal-blurb {
            font-size: 12.5px;
            line-height: 1.6;
          }
          .modal-actions {
            gap: 8px;
          }
          .action {
            padding: 10px 14px;
            font-size: 10px;
            flex: 1 1 auto;
            justify-content: center;
            text-align: center;
          }
          .modal-nav {
            padding: 10px 14px;
          }
          .modal-nav button {
            padding: 8px 16px;
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  );
}
