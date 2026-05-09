import { useEffect, useMemo, useRef, useState } from "react";
import type { Record, MediaType } from "@/types/record";

type QueueType = MediaType | "noloc";

interface Props {
  type: QueueType;
  allRecords: Record[];
  onClose: () => void;
  onActiveChange?: (record: Record) => void;
}

const TYPE_LABEL: { [K in QueueType]: string } = {
  vid: "VIDEOS",
  img: "PHOTOS",
  pdf: "DOCUMENTS",
  noloc: "LOCATION UNKNOWN",
};

const TYPE_TINT: { [K in QueueType]: string } = {
  vid: "var(--color-vid)",
  img: "var(--color-img)",
  pdf: "var(--color-pdf)",
  noloc: "var(--color-hud)",
};

/**
 * Full-screen-ish overlay that lets the user cycle through every record of a
 * given media type. Active record is featured large; thumbnail strip shows
 * the queue. Globe behind stays visible (low opacity) and flies its camera
 * to the active record's pin via onActiveChange.
 */
export default function QueuePanel({ type, allRecords, onClose, onActiveChange }: Props) {
  const items = useMemo(() => {
    const filtered =
      type === "noloc"
        ? allRecords.filter((r) => !r.hasLocation)
        : allRecords.filter((r) => r.mediaType === type);
    return filtered
      .slice()
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [allRecords, type]);

  const [idx, setIdx] = useState(0);
  const active = items[idx];
  const stripRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(items.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  // keep the active thumbnail centered in the strip
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [idx]);

  if (!active) {
    return (
      <div className="queue-backdrop" onClick={onClose}>
        <div className="queue queue-empty" onClick={(e) => e.stopPropagation()}>
          <p>No records to browse.</p>
          <button className="queue-close-btn" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    );
  }

  return (
    <div className="queue-backdrop" onClick={onClose}>
      <div className="queue" onClick={(e) => e.stopPropagation()} style={{ ["--queue-tint" as any]: TYPE_TINT[type] }}>
        <header className="queue-head">
          <span className="queue-type-badge">{TYPE_LABEL[type]}</span>
          <span className="queue-counter">
            {idx + 1} / {items.length}
          </span>
          <button className="queue-close-btn" onClick={onClose} aria-label="Back to globe" title="Back to globe">
            <span className="qc-x">✕</span>
            <span className="qc-label">BACK TO GLOBE</span>
          </button>
        </header>

        <div className="queue-detail">
          <div className="queue-hero">
            {active.mediaType === "vid" && active.videoMp4Url ? (
              <video
                key={active.id}
                controls
                playsInline
                preload="metadata"
                poster={active.thumbnailUrl ?? undefined}
                src={active.videoMp4Url}
              />
            ) : active.mediaType === "vid" && active.dvidsVideoId ? (
              <iframe
                src={`https://www.dvidshub.net/video/embed/${active.dvidsVideoId}`}
                allowFullScreen
                title={active.title}
              />
            ) : active.mediaType === "img" && active.assetUrl ? (
              <img src={active.assetUrl} alt={active.title} />
            ) : active.thumbnailUrl ? (
              <img src={active.thumbnailUrl} alt={`${active.title} thumbnail`} />
            ) : (
              <div className="queue-hero-placeholder">No preview available</div>
            )}
          </div>

          <div className="queue-info">
            <h2 className="queue-title">{active.title}</h2>
            <div className="queue-meta">
              <span><em>AGENCY</em> {active.agency}</span>
              {active.date && <span><em>DATE</em> {active.date}</span>}
              {active.location && <span><em>LOCATION</em> {active.location.name}</span>}
            </div>
            {active.blurb && <p className="queue-blurb">{active.blurb}</p>}
            <div className="queue-actions">
              {active.assetUrl && (
                <a className="queue-action primary" href={active.assetUrl} target="_blank" rel="noopener">
                  {active.mediaType === "vid"
                    ? "OPEN ON DVIDS →"
                    : active.mediaType === "img"
                    ? "OPEN FULL IMAGE →"
                    : "VIEW SOURCE PDF →"}
                </a>
              )}
            </div>
          </div>
        </div>

        <nav className="queue-nav">
          <button
            className="queue-nav-btn"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="Previous record"
          >
            ←
          </button>

          <div className="queue-strip" ref={stripRef}>
            {items.map((rec, i) => (
              <button
                key={rec.id}
                ref={i === idx ? activeThumbRef : undefined}
                className={`queue-thumb ${i === idx ? "active" : ""} ${rec.mediaType}`}
                onClick={() => setIdx(i)}
                aria-label={`${i + 1}: ${rec.title}`}
                title={rec.title}
              >
                {rec.thumbnailUrl ? (
                  <img src={rec.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="queue-thumb-placeholder">▣</div>
                )}
                <span className="queue-thumb-year">{rec.year ?? "—"}</span>
              </button>
            ))}
          </div>

          <button
            className="queue-nav-btn"
            onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
            disabled={idx === items.length - 1}
            aria-label="Next record"
          >
            →
          </button>
        </nav>
      </div>

      <style>{`
        .queue-backdrop {
          position: fixed; inset: 0;
          background: rgba(2,4,8,.78);
          backdrop-filter: blur(6px);
          z-index: 100;  /* above Hud (z-index 7) and dock (z-index 7) */
          display: flex; flex-direction: column;
          /* top padding clears the 56px Hud */
          padding: 70px 16px 16px;
        }
        .queue {
          --queue-tint: var(--color-hud);
          flex: 1;
          background: linear-gradient(180deg, rgba(8,12,20,.96) 0%, rgba(4,6,11,.96) 100%);
          border: 1px solid color-mix(in srgb, var(--queue-tint) 38%, transparent);
          border-radius: 4px;
          color: #e8edf3;
          font-family: var(--font-mono);
          display: grid;
          grid-template-rows: auto 1fr auto;
          overflow: hidden;
          box-shadow:
            0 0 30px rgba(0,0,0,.7),
            0 0 80px color-mix(in srgb, var(--queue-tint) 18%, transparent);
          animation: queue-slide-in .25s ease-out;
        }
        @keyframes queue-slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* HEAD */
        .queue-head {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-line);
        }
        .queue-type-badge {
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .25em;
          color: var(--queue-tint);
          text-shadow: 0 0 12px color-mix(in srgb, var(--queue-tint) 50%, transparent);
        }
        .queue-counter {
          margin-left: auto;
          font-size: 11px;
          letter-spacing: .15em;
          opacity: .55;
          font-variant-numeric: tabular-nums;
        }
        .queue-close-btn {
          background: rgba(106,255,200,.08);
          border: 1px solid rgba(106,255,200,.4);
          color: var(--color-hud);
          height: 32px;
          padding: 0 12px;
          border-radius: 2px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: .15em;
          cursor: pointer;
          transition: all .15s;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .queue-close-btn:hover {
          background: rgba(106,255,200,.18);
          border-color: var(--color-hud);
        }
        .qc-x { font-size: 13px; line-height: 1; }
        .qc-label { font-weight: 700; }

        /* DETAIL */
        .queue-detail {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          gap: 0;
          overflow: hidden;
        }
        .queue-hero {
          background: #04060b;
          border-right: 1px solid var(--color-line);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          position: relative;
        }
        .queue-hero iframe,
        .queue-hero video { width: 100%; height: 100%; border: 0; display: block; background: #04060b; }
        .queue-hero video { object-fit: contain; }
        .queue-hero img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
        }
        .queue-hero-placeholder {
          color: rgba(255,255,255,.4);
          font-size: 11px;
          letter-spacing: .15em;
        }
        .queue-info {
          padding: 24px 26px;
          overflow-y: auto;
          display: flex; flex-direction: column; gap: 14px;
        }
        .queue-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          line-height: 1.25;
          margin: 0;
        }
        .queue-meta {
          display: flex; flex-wrap: wrap;
          gap: 10px 18px;
          font-size: 10px;
          letter-spacing: .12em;
          color: rgba(232,237,243,.85);
          text-transform: uppercase;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-line);
        }
        .queue-meta em {
          font-style: normal;
          color: var(--queue-tint);
          margin-right: 5px;
          font-size: 9px;
        }
        .queue-blurb {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.6;
          color: #d8dde6;
          flex: 1;
          min-height: 0;
        }
        .queue-actions {
          display: flex; gap: 10px; flex-wrap: wrap;
        }
        .queue-action {
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
        .queue-action:hover { border-color: var(--queue-tint); color: var(--queue-tint); }
        .queue-action.primary {
          background: var(--queue-tint);
          color: #04060b;
          border-color: var(--queue-tint);
        }

        /* NAV / STRIP */
        .queue-nav {
          display: flex; align-items: stretch; gap: 6px;
          padding: 12px 14px;
          border-top: 1px solid var(--color-line);
          background: rgba(0,0,0,.35);
        }
        .queue-nav-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,.12);
          color: rgba(255,255,255,.75);
          width: 38px;
          flex-shrink: 0;
          border-radius: 2px;
          font-family: var(--font-mono);
          font-size: 14px;
          cursor: pointer;
          transition: all .15s;
        }
        .queue-nav-btn:hover:not(:disabled) {
          color: var(--queue-tint);
          border-color: var(--queue-tint);
        }
        .queue-nav-btn:disabled {
          opacity: .25; cursor: not-allowed;
        }

        .queue-strip {
          flex: 1;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,.15) transparent;
        }
        .queue-strip::-webkit-scrollbar { height: 6px; }
        .queue-strip::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,.15);
          border-radius: 3px;
        }

        .queue-thumb {
          all: unset;
          flex: 0 0 80px;
          aspect-ratio: 3/4;
          background: #06080d;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 2px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all .2s;
        }
        .queue-thumb:hover {
          border-color: rgba(255,255,255,.3);
          transform: translateY(-2px);
        }
        .queue-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          filter: brightness(.65) saturate(.7);
          transition: filter .2s;
          display: block;
        }
        .queue-thumb-placeholder {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          color: rgba(255,255,255,.2);
        }
        .queue-thumb.active {
          flex-basis: 110px;
          border-color: var(--queue-tint);
          box-shadow:
            0 0 14px color-mix(in srgb, var(--queue-tint) 35%, transparent),
            inset 0 0 0 1px var(--queue-tint);
          transform: translateY(-3px);
        }
        .queue-thumb.active img {
          filter: brightness(1) saturate(1);
        }
        .queue-thumb-year {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.85) 100%);
          color: rgba(255,255,255,.9);
          font-size: 9px;
          letter-spacing: .12em;
          text-align: center;
          padding: 10px 4px 4px;
          font-variant-numeric: tabular-nums;
        }
        .queue-thumb.active .queue-thumb-year {
          color: var(--queue-tint);
          font-weight: 700;
        }

        .queue-empty {
          padding: 60px;
          display: flex; flex-direction: column; align-items: center; gap: 16px;
          text-align: center;
        }

        /* MOBILE: stack hero + info, smaller padding */
        @media (max-width: 767px) {
          .queue-backdrop { padding: 0; }
          .queue { border-radius: 0; border-left: none; border-right: none; }
          .queue-detail {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
          }
          .queue-hero {
            border-right: none;
            border-bottom: 1px solid var(--color-line);
            aspect-ratio: 16/9;
            max-height: 38vh;
          }
          .queue-info {
            padding: 16px 18px 0;
            gap: 10px;
          }
          .queue-title { font-size: 15px; }
          .queue-meta { font-size: 9px; gap: 6px 12px; padding-bottom: 8px; }
          .queue-blurb { font-size: 12px; line-height: 1.55; }
          /* Pin the action bar to the bottom of the scroll box so the (often
             red) "OPEN ON DVIDS" button never floats over content. */
          .queue-actions {
            position: sticky;
            bottom: 0;
            margin: 6px -18px 0;
            padding: 10px 18px 12px;
            background: linear-gradient(180deg, rgba(8,12,20,0) 0%, rgba(4,6,11,.96) 30%);
            backdrop-filter: blur(6px);
            border-top: 1px solid var(--color-line);
            z-index: 1;
          }
          .queue-action { font-size: 10px; padding: 9px 14px; flex: 1 1 auto; justify-content: center; }
          .queue-head {
            padding: 12px 14px;
          }
          /* Compact the BACK TO GLOBE label slightly on mobile so it fits */
          .queue-close-btn { padding: 0 10px; font-size: 10px; letter-spacing: .12em; height: 30px; }
          .qc-label { display: inline; }
          .queue-type-badge { font-size: 12px; letter-spacing: .2em; }
          .queue-nav { padding: 10px; gap: 4px; }
          .queue-nav-btn { width: 34px; }
          .queue-thumb { flex-basis: 64px; }
          .queue-thumb.active { flex-basis: 84px; }
        }
      `}</style>
    </div>
  );
}
