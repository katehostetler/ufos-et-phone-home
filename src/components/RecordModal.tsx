import { useCallback, useEffect, useRef, useState } from "react";
import Portal from "./Portal";
import { pickSnapState, translateForState, type SheetState } from "@/lib/bottomSheet";
import type { Record } from "@/types/record";

interface Props {
  records: Record[];
  onClose: () => void;
  /** Label on the close button. "BACK TO GLOBE" when opened from the globe homepage,
   *  "BACK TO GALLERY" when opened from a gallery page, "CLOSE" if unspecified. */
  closeLabel?: string;
}

const TYPE_LABEL = { vid: "VIDEO", img: "PHOTO", pdf: "DOCUMENT" } as const;

/** Below this width the modal becomes a draggable bottom sheet. */
const SHEET_MAX_WIDTH = 767;
/** Fraction of the screen height left uncovered (globe visible) in the "peek" rest state. */
const PEEK_UNCOVERED = 0.54;

// Once we learn /api/tts isn't available (404 on a static deploy, or quota
// exhausted, etc.) stop hammering it and just use the browser voice for the
// rest of the session. `null` = not yet probed.
let elevenLabsAvailable: boolean | null = null;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export default function RecordModal({ records, onClose, closeLabel = "CLOSE" }: Props) {
  const isSheet = useMediaQuery(`(max-width: ${SHEET_MAX_WIDTH}px)`);
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  // Tracks which engine narrated last so we can show a small credit line.
  const [ttsEngine, setTtsEngine] = useState<"elevenlabs" | "browser" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  // Bumped on every play start AND every stop, so an in-flight TTS request that
  // resolves after the user hit STOP (or changed record) becomes a no-op.
  const playTokenRef = useRef(0);

  // ── bottom-sheet machinery (mobile only) ───────────────────────────────────
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const sheetStateRef = useRef<SheetState>("peek");
  useEffect(() => { sheetStateRef.current = sheetState; }, [sheetState]);
  // Sheet's downward offset in px. Starts well off-screen; an effect measures
  // the real geometry on mount and animates it up to "peek".
  const [translateY, setTranslateY] = useState<number>(() =>
    typeof window !== "undefined" ? Math.round(window.innerHeight * 1.15) : 900,
  );
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startClientY: number;
    startTranslate: number;
    cur: number;
    lastY: number;
    lastT: number;
    vel: number;
  } | null>(null);

  const rec = records[idx];

  /** Measure the sheet geometry (independent of the current transform). */
  const measure = useCallback(() => {
    const screenH =
      backdropRef.current?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 800);
    const sheetH = sheetRef.current?.offsetHeight || Math.round(screenH * 0.92);
    // Sheet is bottom-anchored; translateY(0) puts its top at (screenH - sheetH).
    // In "peek" we want the top ~PEEK_UNCOVERED of the screen to stay uncovered.
    const peekTopWanted = screenH * PEEK_UNCOVERED;
    const peekTranslateY = Math.max(0, peekTopWanted - (screenH - sheetH));
    const dismissTranslateY = sheetH; // fully off the bottom of the screen
    return { screenH, sheetH, peekTranslateY, dismissTranslateY };
  }, []);

  const applyState = useCallback(
    (s: SheetState) => {
      setSheetState(s);
      setTranslateY(translateForState(s, measure().peekTranslateY));
    },
    [measure],
  );

  // On mount in sheet mode (or when we cross into it): slide up from off-screen
  // to the "peek" rest position. The double-rAF lets the initial off-screen
  // position paint first so the transition actually plays.
  useEffect(() => {
    if (!isSheet) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const g = measure();
        setSheetState("peek");
        setTranslateY(g.peekTranslateY);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [isSheet, measure]);

  // Keep the sheet pinned to its current rest state across viewport resizes.
  useEffect(() => {
    if (!isSheet) return;
    const onResize = () => {
      if (dragRef.current) return;
      setTranslateY(translateForState(sheetStateRef.current, measure().peekTranslateY));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isSheet, measure]);

  // ── drag handlers ──────────────────────────────────────────────────────────
  const onDragMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { sheetH } = measure();
      const delta = e.clientY - d.startClientY;
      const next = Math.max(0, Math.min(sheetH, d.startTranslate + delta));
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.vel = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = now;
      d.cur = next;
      setTranslateY(next);
    },
    [measure],
  );

  const onDragEnd = useCallback(() => {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    const { peekTranslateY, dismissTranslateY } = measure();
    const fromState: SheetState = d.startTranslate <= peekTranslateY * 0.5 ? "full" : "peek";
    const result = pickSnapState({
      translateY: d.cur,
      velocityY: d.vel,
      peekTranslateY,
      dismissTranslateY,
      from: fromState,
    });
    if (result === "dismiss") {
      onClose();
      return;
    }
    applyState(result);
  }, [measure, onDragMove, applyState, onClose]);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (!isSheet) return;
      // Don't start a drag from an interactive control inside the header (the
      // close button) — let it receive its click.
      if ((e.target as HTMLElement).closest("button, a")) return;
      const start = translateForState(sheetStateRef.current, measure().peekTranslateY);
      dragRef.current = {
        startClientY: e.clientY,
        startTranslate: start,
        cur: start,
        lastY: e.clientY,
        lastT: performance.now(),
        vel: 0,
      };
      setDragging(true);
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
      window.addEventListener("pointercancel", onDragEnd);
    },
    [isSheet, measure, onDragMove, onDragEnd],
  );

  // Tidy up window listeners if we unmount mid-drag.
  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
    },
    [onDragMove, onDragEnd],
  );

  // ── keyboard ───────────────────────────────────────────────────────────────
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

  // Reset per-record state when the record set changes (e.g. tapping a different
  // pin while the sheet is open swaps the content). Keep the sheet's open/peek
  // state so the user can keep browsing.
  const recordsKey = records.map((r) => r.id).join("|");
  useEffect(() => {
    setIdx(0);
  }, [recordsKey]);

  // Stop TTS whenever the active record changes or the modal closes.
  useEffect(() => stopSpeech, []);
  useEffect(() => {
    stopSpeech();
    setTtsEngine(null);
  }, [idx, recordsKey]);

  // Pick the best available English voice. Priority — top is best:
  //   1. Google's cloud voices (Chrome bundles "Google US English" / "Google UK English Female")
  //   2. Microsoft "Natural"/"Online" voices (Edge bundles e.g. "Microsoft Aria Online (Natural)")
  //   3. Apple Premium / Enhanced voices on macOS / iOS Safari ("(Premium)" / "(Enhanced)")
  //   4. Named macOS voices that don't carry the suffix but are still better than default
  //   5. Any en-US / en-GB voice
  //   6. Any en-* voice
  function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
    const en = voices.filter((v) => v.lang?.startsWith("en"));
    const enGoodLangs = en.filter((v) => /^en-(US|GB|AU|CA|IE)$/i.test(v.lang));
    return (
      enGoodLangs.find((v) => /^Google\s+(US|UK)\s+English/i.test(v.name)) ||
      enGoodLangs.find((v) => /Online.*Natural/i.test(v.name) || /Microsoft.*Natural/i.test(v.name)) ||
      enGoodLangs.find((v) => /\((Premium|Enhanced|Neural|Natural)\)/i.test(v.name)) ||
      enGoodLangs.find((v) =>
        /^(Samantha|Daniel|Karen|Moira|Tessa|Allison|Ava|Evan|Joelle|Noelle|Susan|Tom|Zoe)$/i.test(v.name),
      ) ||
      enGoodLangs[0] ||
      en[0]
    );
  }

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
      setTimeout(() => {
        synth.removeEventListener("voiceschanged", onChange);
        resolve(synth.getVoices());
      }, 1500);
    });
  }

  async function speakViaBrowser() {
    if (typeof window === "undefined" || !window.speechSynthesis || !rec.blurb) {
      setSpeaking(false);
      return;
    }
    const voices = await getVoicesAsync();
    const utt = new SpeechSynthesisUtterance(rec.blurb);
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    const preferred = pickVoice(voices);
    if (preferred) {
      utt.voice = preferred;
      utt.lang = preferred.lang;
    }
    utt.onend = () => {
      setSpeaking(false);
    };
    utt.onerror = () => {
      setSpeaking(false);
    };
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
    setTtsEngine("browser");
  }

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
    setSpeaking(true);
    const result = await speakViaElevenLabs(token);
    if (result === "cancelled") return;
    if (result === "played") return;
    if (token !== playTokenRef.current) return;
    await speakViaBrowser();
  }

  if (!rec) return null;

  // The Moon opens as a collection of all the Apollo lunar reports — label it
  // "THE MOON" rather than the per-record location.
  const isLunarSet = records.length > 0 && records.every((r) => r.location?.name === "Moon");
  const locLabel = isLunarSet ? "THE MOON" : rec.location?.name || "LOCATION UNKNOWN";

  const headerEl = (
    <header className="modal-head">
      <span className="loc">
        <span className={`dot ${rec.mediaType}`} />
        {locLabel}
      </span>
      {!isSheet && <span className={`type-badge ${rec.mediaType}`}>{TYPE_LABEL[rec.mediaType]}</span>}
      {!isSheet && records.length > 1 && (
        <span className="counter">
          {idx + 1} / {records.length}
        </span>
      )}
      <button className="close-btn" onClick={onClose} aria-label={closeLabel}>
        <span className="close-x">✕</span>
        <span className="close-label">{closeLabel}</span>
      </button>
    </header>
  );

  const heroEl = (
    <div className={`modal-hero ${rec.mediaType === "vid" ? "is-video" : "is-still"}`}>
      {rec.mediaType === "vid" && rec.videoMp4Url ? (
        <video
          key={rec.id}
          controls
          autoPlay
          playsInline
          preload="metadata"
          poster={rec.thumbnailUrl ?? undefined}
          src={rec.videoMp4Url}
        />
      ) : rec.mediaType === "vid" && rec.dvidsVideoId ? (
        <iframe
          src={`https://www.dvidshub.net/video/embed/${rec.dvidsVideoId}`}
          allow="autoplay; fullscreen"
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
  );

  const bodyEl = (
    <div className="modal-body">
      {!isSheet && <h2 className="modal-title">{rec.title}</h2>}
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
  );

  const navEl = records.length > 1 && (
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
  );

  return (
    <Portal>
      <div
        ref={backdropRef}
        className={`modal-backdrop ${isSheet ? "modal-backdrop--sheet" : ""}`}
        onClick={isSheet ? undefined : onClose}
      >
        {isSheet ? (
          <div
            ref={sheetRef}
            className={`modal modal--sheet modal--${sheetState}${dragging ? " is-dragging" : ""}`}
            style={{ transform: `translateY(${Math.round(translateY)}px)` }}
          >
            <div className="sheet-handle" onPointerDown={onDragStart}>
              <div className="sheet-grabber" aria-hidden="true" />
              {headerEl}
            </div>
            <div className={`sheet-scroll${sheetState === "full" ? " is-scrollable" : ""}`}>
              <div className="sheet-titlebar">
                <h2 className="sheet-title">{rec.title}</h2>
                <div className="sheet-sub">
                  <span className={`type-badge ${rec.mediaType}`}>{TYPE_LABEL[rec.mediaType]}</span>
                  <span className="sheet-sub-text">
                    {rec.agency}
                    {rec.year ? ` · ${rec.year}` : ""}
                  </span>
                </div>
                {records.length > 1 && (
                  <div className="sheet-cycle">
                    <button
                      type="button"
                      onClick={() => setIdx((i) => Math.max(0, i - 1))}
                      disabled={idx === 0}
                      aria-label="Previous record at this location"
                    >
                      ‹ PREV
                    </button>
                    <span className="sheet-cycle-count">
                      RECORD {idx + 1} OF {records.length} HERE
                    </span>
                    <button
                      type="button"
                      onClick={() => setIdx((i) => Math.min(records.length - 1, i + 1))}
                      disabled={idx === records.length - 1}
                      aria-label="Next record at this location"
                    >
                      NEXT ›
                    </button>
                  </div>
                )}
              </div>
              {sheetState === "peek" && (
                <button type="button" className="sheet-readmore" onClick={() => applyState("full")}>
                  ↑&nbsp;&nbsp;SWIPE UP FOR THE FULL REPORT
                </button>
              )}
              {heroEl}
              {bodyEl}
              {navEl}
            </div>
          </div>
        ) : (
          <div className="modal modal-slide-in" onClick={(e) => e.stopPropagation()}>
            {headerEl}
            {heroEl}
            {bodyEl}
            {navEl}
          </div>
        )}
      </div>

      <style>{`
        /* Backdrop is only lightly darkened so the auto-rotating globe stays
           visible behind the panel. Clicking the visible globe area closes. */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(2,4,8,.42);
          backdrop-filter: blur(2px);
          z-index: 100;  /* above Hud (z-index 7) and dock (7) */
          display: flex; align-items: stretch; justify-content: flex-start;
        }
        /* The record panel — docked to the left, ~60vw, full height. The WHOLE
           panel scrolls as one unit; no skinny inner scroll box. */
        .modal {
          width: clamp(420px, 60vw, 780px);
          height: 100%;
          background: linear-gradient(180deg, rgba(16,8,12,.985) 0%, rgba(6,10,16,.985) 100%);
          border-right: 1px solid rgba(106,255,200,.35);
          box-shadow: 8px 0 40px rgba(0,0,0,.6), 0 0 80px rgba(106,255,200,.08) inset;
          color: #e8edf3;
          font-family: var(--font-mono);
          overflow-y: auto;
          overflow-x: hidden;
        }
        .modal-slide-in { animation: modal-slide-in .25s ease-out; }
        @keyframes modal-slide-in {
          from { transform: translateX(-24px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .modal-slide-in { animation: none; }
        }
        /* Header sticks to the top of the scrolling panel so BACK TO GLOBE is
           always reachable. */
        .modal-head {
          position: sticky; top: 0; z-index: 3;
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-line);
          background: rgba(8,11,17,.96);
          backdrop-filter: blur(6px);
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
          background: var(--color-hud);
          box-shadow: 0 0 8px currentColor;
          flex-shrink: 0;
        }
        .dot.vid { background: var(--color-vid); color: var(--color-vid); }
        .dot.img { background: var(--color-img); color: var(--color-img); }
        .dot.pdf { background: var(--color-pdf); color: var(--color-pdf); }
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
          white-space: nowrap;
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
          overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-hero.is-video {
          aspect-ratio: 16/9;
          max-height: min(56vh, 480px);
          min-height: 200px;
        }
        .modal-hero.is-video iframe,
        .modal-hero.is-video video {
          width: 100%; height: 100%;
          border: 0;
          object-fit: contain;
          background: #06080d;
          display: block;
        }
        .modal-hero.is-still img {
          width: 100%;
          height: auto;
          max-height: min(64vh, 620px);
          object-fit: contain;
          object-position: top center;
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
          padding: 48px 0;
        }

        .modal-body {
          padding: 22px 24px 26px;
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
          margin-top: 18px;
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
          padding: 14px 24px 18px;
          border-top: 1px solid var(--color-line);
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

        /* ============================================================ */
        /* MOBILE (≤767px) — the panel becomes a draggable bottom sheet   */
        /* ============================================================ */
        @media (max-width: ${SHEET_MAX_WIDTH}px) {
          .modal-backdrop.modal-backdrop--sheet {
            /* Click-through: the globe behind the sheet stays interactive — only
               the sheet itself catches pointer events. */
            background: transparent;
            backdrop-filter: none;
            pointer-events: none;
            display: block;
          }
          .modal--sheet {
            pointer-events: auto;
            position: absolute;
            left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 92vh;
            height: 92dvh;
            max-height: 92dvh;
            border-right: none;
            border-top: 1px solid rgba(106,255,200,.4);
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -8px 40px rgba(0,0,0,.6), 0 0 60px rgba(106,255,200,.06) inset;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transform: translateY(110%);
            transition: transform .34s cubic-bezier(.16, 1, .3, 1);
            animation: none;
          }
          .modal--sheet.is-dragging { transition: none; }
          @media (prefers-reduced-motion: reduce) { .modal--sheet { transition: none; } }

          /* drag zone: the grabber bar + header, pinned to the top of the sheet */
          .sheet-handle {
            flex-shrink: 0;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            cursor: grab;
            background: rgba(8,11,17,.97);
            backdrop-filter: blur(6px);
            border-bottom: 1px solid var(--color-line);
            padding-top: env(safe-area-inset-top, 0px);
          }
          .sheet-handle:active { cursor: grabbing; }
          .sheet-grabber {
            width: 40px; height: 4px;
            border-radius: 2px;
            background: rgba(106,255,200,.5);
            margin: 8px auto 2px;
          }
          .modal--sheet .modal-head {
            position: static;
            background: transparent;
            backdrop-filter: none;
            border-bottom: none;
            padding: 4px 12px 10px;
            gap: 10px;
            flex-wrap: nowrap;
          }
          .modal--sheet .modal-head .loc {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 9.5px;
            letter-spacing: .14em;
          }
          .modal--sheet .close-btn {
            flex-shrink: 0;
            margin-left: 4px;
            height: 32px;
            padding: 0 11px;
            background: rgba(106,255,200,.16);
            border-color: var(--color-hud);
            font-weight: 700;
            font-size: 9.5px;
            letter-spacing: .1em;
            gap: 6px;
          }
          .modal--sheet .close-x { font-size: 13px; }

          /* scrollable content region (everything below the drag zone) */
          .sheet-scroll {
            flex: 1 1 auto;
            overflow-y: hidden;
            overflow-x: hidden;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }
          .sheet-scroll.is-scrollable { overflow-y: auto; }

          .sheet-titlebar {
            padding: 12px 16px 11px;
            border-bottom: 1px solid var(--color-line);
          }
          .sheet-title {
            font-family: var(--font-display);
            font-size: 15px;
            font-weight: 700;
            line-height: 1.32;
            margin: 0 0 7px;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .sheet-sub {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 9px;
            letter-spacing: .12em;
            text-transform: uppercase;
            color: rgba(255,255,255,.55);
          }
          .sheet-sub .type-badge { flex-shrink: 0; }
          .sheet-sub-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .sheet-counter { color: var(--color-hud); }

          /* multi-record location: a clear PREV / "RECORD n OF m HERE" / NEXT row,
             visible in the peek state so you don't have to expand to flip records */
          .sheet-cycle {
            display: flex;
            align-items: stretch;
            gap: 6px;
            margin-top: 9px;
          }
          .sheet-cycle button {
            flex: 0 0 auto;
            background: rgba(106,255,200,.08);
            border: 1px solid rgba(106,255,200,.4);
            color: var(--color-hud);
            font-family: var(--font-mono);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .14em;
            padding: 7px 12px;
            border-radius: 3px;
            cursor: pointer;
          }
          .sheet-cycle button:disabled { opacity: .3; cursor: not-allowed; }
          .sheet-cycle button:not(:disabled):active { background: rgba(106,255,200,.2); }
          .sheet-cycle-count {
            flex: 1 1 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-size: 9.5px;
            letter-spacing: .14em;
            text-transform: uppercase;
            color: var(--color-hud);
            background: rgba(106,255,200,.05);
            border: 1px dashed rgba(106,255,200,.3);
            border-radius: 3px;
            padding: 4px 6px;
            line-height: 1.2;
          }

          .sheet-readmore {
            display: block;
            width: 100%;
            background: rgba(106,255,200,.06);
            border: 0;
            border-bottom: 1px dashed rgba(106,255,200,.22);
            color: var(--color-hud);
            font-family: var(--font-mono);
            font-size: 9px;
            letter-spacing: .22em;
            text-transform: uppercase;
            padding: 9px 12px;
            cursor: pointer;
            text-align: center;
          }
          .sheet-readmore:hover { background: rgba(106,255,200,.12); }

          /* hero / body / nav tweaks for the sheet */
          .modal--sheet .modal-hero.is-video { aspect-ratio: 16/9; max-height: 38vh; min-height: 150px; }
          .modal--sheet .modal-hero.is-still img { max-height: 52vh; }
          .modal--sheet .modal-hero-placeholder { padding: 36px 0; }
          .modal--sheet .modal-body { padding: 16px 16px 22px; }
          .modal--sheet .modal-title { font-size: 16px; }
          .modal--sheet .modal-meta { gap: 8px 14px; font-size: 9px; }
          .modal--sheet .modal-blurb { font-size: 13px; line-height: 1.6; }
          .modal--sheet .modal-actions { gap: 8px; }
          .modal--sheet .action {
            padding: 11px 14px;
            font-size: 10px;
            flex: 1 1 auto;
            justify-content: center;
            text-align: center;
          }
          .modal--sheet .modal-nav { padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
          .modal--sheet .modal-nav button { padding: 9px 16px; font-size: 10px; }
        }
      `}</style>
    </Portal>
  );
}
