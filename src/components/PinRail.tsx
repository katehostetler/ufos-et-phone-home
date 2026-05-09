import { useEffect, useMemo, useRef, useState } from "react";
import type { Record, MediaType } from "@/types/record";

interface Props {
  /** which media type's pins to list, or null when the rail is closed */
  type: MediaType | null;
  allRecords: Record[];
  onClose: () => void;
  /** called as the user scrolls past a card — fly the globe to that record's pin */
  onActiveChange: (rec: Record) => void;
  /** called when the user clicks a card — open the full record modal */
  onSelect: (rec: Record) => void;
}

const TYPE_LABEL: { [K in MediaType]: string } = {
  vid: "VIDEO",
  img: "PHOTO",
  pdf: "DOCUMENT",
};

/**
 * A slim left-docked rail of mini record cards for one media type. The globe
 * stays visible (and keeps auto-rotating) to the right. As the user scrolls,
 * the card nearest the rail's vertical centre becomes "active" and the globe
 * flies to that record's pin. Clicking a card opens the full RecordModal.
 *
 * Only records that have a location are listed (the rail is fundamentally a
 * "where on the map" browser).
 */
export default function PinRail({ type, allRecords, onClose, onActiveChange, onSelect }: Props) {
  const items = useMemo(() => {
    if (!type) return [];
    return allRecords
      .filter((r) => r.mediaType === type && r.hasLocation && r.location)
      .slice()
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [allRecords, type]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  // throttle fly-to so fast scrolling doesn't spam pointOfView
  const lastFlyRef = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  // Reset + fly to the first card whenever the rail opens (or the type changes).
  useEffect(() => {
    if (!type || items.length === 0) {
      setActiveId(null);
      return;
    }
    const first = items[0];
    setActiveId(first.id);
    onActiveChange(first);
    // scroll the list back to the top
    if (listRef.current) listRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, items]);

  // Esc closes
  useEffect(() => {
    if (!type) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [type, onClose]);

  // IntersectionObserver — the card crossing a thin band near the vertical
  // centre of the rail becomes active.
  useEffect(() => {
    if (!type || !listRef.current || items.length === 0) return;
    const root = listRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        // pick the entry whose centre is closest to the root's centre
        const rootRect = root.getBoundingClientRect();
        const rootMid = rootRect.top + rootRect.height / 2;
        let best: { id: string; dist: number } | null = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.id;
          if (!id) continue;
          const r = e.boundingClientRect;
          const mid = r.top + r.height / 2;
          const dist = Math.abs(mid - rootMid);
          if (!best || dist < best.dist) best = { id, dist };
        }
        if (!best) return;
        if (best.id === activeId) return;
        setActiveId(best.id);
        const rec = items.find((it) => it.id === best!.id);
        if (rec) {
          const now = performance.now();
          if (rec.id !== lastFlyRef.current.id || now - lastFlyRef.current.t > 250) {
            lastFlyRef.current = { id: rec.id, t: now };
            onActiveChange(rec);
          }
        }
      },
      { root, rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const el of cardRefs.current.values()) obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, items, activeId]);

  if (!type) return null;

  return (
    <aside className="pin-rail" role="dialog" aria-label={`${TYPE_LABEL[type]} pins`}>
      <header className={`pin-rail-head ${type}`}>
        <span className="pin-rail-title">▸ {TYPE_LABEL[type]} PINS</span>
        <span className="pin-rail-count">{items.length}</span>
        <button className="pin-rail-close" onClick={onClose} aria-label="Close pin list">✕</button>
      </header>
      <p className="pin-rail-hint">SCROLL TO FLY · TAP TO OPEN</p>
      <ul className="pin-rail-list" ref={listRef}>
        {items.map((rec) => (
          <li
            key={rec.id}
            data-id={rec.id}
            ref={(el) => {
              if (el) cardRefs.current.set(rec.id, el);
              else cardRefs.current.delete(rec.id);
            }}
            className={`pin-rail-card ${type} ${rec.id === activeId ? "active" : ""}`}
          >
            <button className="pin-rail-card-btn" onClick={() => onSelect(rec)}>
              <span className="pin-rail-thumb">
                {rec.thumbnailUrl ? (
                  <img src={rec.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span className="pin-rail-thumb-empty">▣</span>
                )}
              </span>
              <span className="pin-rail-meta">
                <span className="pin-rail-card-title">{rec.title}</span>
                <span className="pin-rail-card-sub">
                  {rec.location?.name}
                  {rec.year ? ` · ${rec.year}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="pin-rail-empty">No {TYPE_LABEL[type].toLowerCase()} records have a location.</li>
        )}
      </ul>
    </aside>
  );
}
