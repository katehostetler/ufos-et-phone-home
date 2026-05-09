import { useEffect, useState } from "react";
import Portal from "./Portal";
import type { FeaturedRecord } from "@/lib/featured";

interface Props {
  featured: FeaturedRecord[];
}

export default function HallOfFameOverlay({ featured }: Props) {
  const [open, setOpen] = useState(false);

  // Reduced-motion check — evaluated once on mount and cached.
  // We read it at render time so tests can override matchMedia before rendering.
  const reduce = typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("open-hall-of-fame", onOpen);
    return () => window.removeEventListener("open-hall-of-fame", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const validFeatured = featured.filter(Boolean);

  function handleCardClick(id: string) {
    window.dispatchEvent(new CustomEvent("open-record", { detail: id }));
    setOpen(false);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only close when clicking the backdrop itself, not child elements.
    if (e.target === e.currentTarget) setOpen(false);
  }

  const BADGE_LABELS: Record<string, string> = {
    vid: "VIDEO",
    img: "PHOTO",
    pdf: "DOC",
  };

  return (
    <Portal>
    <div
      className="hof-overlay"
      role="dialog"
      aria-label="Hall of Fame"
      onClick={handleBackdropClick}
    >
      <div className="hof-inner">
        <div className="hof-header">
          <span className="hof-header-title">▣ HALL OF FAME · {validFeatured.length} RECORDS</span>
          <p className="hof-header-sub">THE WILDEST FILES IN THE RELEASE</p>
        </div>

        <button
          className="hof-close"
          onClick={() => setOpen(false)}
          aria-label="Close Hall of Fame"
        >
          ✕
        </button>

        <ul className={`hof-rail${!reduce ? " is-staggered" : ""}`} role="list">
          {validFeatured.map((r, i) => (
            <li
              key={r.id}
              className="hof-card"
              style={!reduce ? { "--hof-delay": `${i * 50}ms` } as React.CSSProperties : undefined}
            >
              <button
                className="hof-card-btn"
                data-id={r.id}
                onClick={() => handleCardClick(r.id)}
                title={`Open: ${r.title}`}
              >
                <div className="hof-thumb-wrap">
                  {r.thumbnailUrl ? (
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      className="hof-thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="hof-thumb hof-thumb-empty">NO PREVIEW</div>
                  )}
                  <span className={`type-badge ${r.mediaType}`}>
                    {BADGE_LABELS[r.mediaType] ?? r.mediaType.toUpperCase()}
                  </span>
                </div>
                <div className="hof-card-body">
                  <div className="hof-card-title">{r.title}</div>
                  {r.year && <div className="hof-card-year">{r.year}</div>}
                  <div className="hof-hook">{r.hook}</div>
                  {r.blurb && <p className="hof-blurb">{r.blurb}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
    </Portal>
  );
}
