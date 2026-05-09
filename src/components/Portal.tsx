import { createPortal } from "react-dom";

/**
 * Renders its children into <body> via a React portal.
 *
 * Why: several overlays (RecordModal, QueuePanel, TransmissionModal,
 * HallOfFameOverlay) are mounted deep inside `.globe-page` / GlobeApp, which is
 * `position: fixed` and therefore its own stacking context — one that paints
 * *below* the Hud (z-index 7). A child with z-index 100 inside that context
 * still loses to the Hud. Portalling to <body> puts the overlay in the root
 * stacking context so its z-index actually wins.
 *
 * Astro renders these components as client-only islands, so `document` exists
 * by the time this runs — the guard is just belt-and-braces.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
