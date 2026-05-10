/**
 * src/lib/bottomSheet.ts
 *
 * Pure geometry/decision logic for the mobile RecordModal bottom sheet.
 * No DOM imports — unit-testable in isolation.
 *
 * The sheet has two rest positions:
 *   - "peek": parked partway up the screen (globe still visible/interactive above)
 *   - "full": pulled (near) all the way up for reading
 * Dragging the grabber past "peek" toward the bottom dismisses it.
 *
 * `translateY` is the sheet's downward offset in px: 0 = "full" (top), larger
 * numbers = lower on screen. `peekTranslateY` is the rest offset for "peek";
 * `dismissTranslateY` is the offset at which the sheet has slid fully off-screen.
 */

export type SheetState = "peek" | "full";
export type SheetSnapResult = SheetState | "dismiss";

export interface SnapInput {
  /** current translateY of the sheet at release, in px (0 = full/top) */
  translateY: number;
  /** vertical velocity in px/ms at release; positive = moving downward */
  velocityY: number;
  /** translateY value that corresponds to the "peek" rest position */
  peekTranslateY: number;
  /** translateY value at which the sheet is fully off the bottom of the screen */
  dismissTranslateY: number;
  /** which rest state the drag started from */
  from: SheetState;
}

/** px/ms — above this, treat a release as an intentional flick rather than a settle. */
export const FLICK_VELOCITY = 0.5;

/**
 * Given where a drag ended (position + velocity), decide which rest state the
 * sheet should snap to — or "dismiss" if it should close.
 */
export function pickSnapState(input: SnapInput): SheetSnapResult {
  const { translateY, velocityY, peekTranslateY, dismissTranslateY, from } = input;

  // Fast flick: jump one notch in the flick direction.
  if (Math.abs(velocityY) >= FLICK_VELOCITY) {
    if (velocityY > 0) {
      // downward flick:  full ➜ peek ➜ dismiss
      return from === "full" ? "peek" : "dismiss";
    }
    // upward flick: always expand to full
    return "full";
  }

  // Slow drag: settle to the nearest of the three rest positions.
  const points: Array<{ y: number; state: SheetSnapResult }> = [
    { y: 0, state: "full" },
    { y: peekTranslateY, state: "peek" },
    { y: dismissTranslateY, state: "dismiss" },
  ];
  let best = points[0];
  for (const p of points) {
    if (Math.abs(p.y - translateY) < Math.abs(best.y - translateY)) best = p;
  }
  return best.state;
}

/** translateY (px) for a given rest state. */
export function translateForState(state: SheetState, peekTranslateY: number): number {
  return state === "full" ? 0 : peekTranslateY;
}
