import { useEffect, useState } from "react";
import type { Record } from "@/types/record";

interface Props {
  records: Record[];
  onClose: () => void;
}

const TYPE_LABEL = { vid: "VIDEO", img: "PHOTO", pdf: "DOCUMENT" } as const;

export default function RecordModal({ records, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);
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

  // Stop TTS whenever the active record changes or the modal closes.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
    };
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
    setSpeaking(false);
  }, [idx]);

  function speakBlurb() {
    if (typeof window === "undefined" || !window.speechSynthesis || !rec.blurb) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(rec.blurb);
    utt.rate = 0.95;
    utt.pitch = 0.92;
    const voices = window.speechSynthesis.getVoices();
    // pick the most natural-sounding English voice we can find
    const preferred =
      voices.find((v) => /en-(US|GB)/.test(v.lang) && /enhanced|premium|natural/i.test(v.name)) ||
      voices.find((v) => /en-(US|GB)/.test(v.lang) && /alex|daniel|david|samantha|karen/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utt.voice = preferred;
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
    setSpeaking(true);
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
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
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
              <button
                className={`tts-btn ${speaking ? "playing" : ""}`}
                onClick={speakBlurb}
                aria-label={speaking ? "Stop reading" : "Read aloud"}
                title={speaking ? "Stop reading" : "Read aloud"}
              >
                <span className="tts-icon">{speaking ? "■" : "▶"}</span>
                <span className="tts-label">{speaking ? "STOP" : "LISTEN"}</span>
              </button>
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
          background: transparent; border: 1px solid rgba(255,255,255,.15);
          color: rgba(255,255,255,.7);
          width: 28px; height: 28px;
          border-radius: 2px;
          cursor: pointer;
          font-size: 14px;
          font-family: var(--font-mono);
        }
        .close-btn:hover { color: var(--color-hud); border-color: var(--color-hud); }

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
        .tts-btn {
          float: right;
          margin: 0 0 6px 12px;
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
          .modal-hero {
            aspect-ratio: 16/9;
            max-height: 45vh;
            min-height: 180px;
          }
          .modal-body {
            padding: 16px 16px 18px;
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
