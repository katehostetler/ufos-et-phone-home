import { describe, it, expect } from "vitest";
import { pickSnapState, translateForState, FLICK_VELOCITY } from "@/lib/bottomSheet";

// A representative geometry: ~800px viewport, sheet ~92% tall, "peek" parked so
// the sheet covers roughly the bottom 46% of the screen.
const PEEK = 368; // peekTranslateY (px)
const DISMISS = 736; // dismissTranslateY (px) — fully off the bottom

function snap(translateY: number, velocityY: number, from: "peek" | "full") {
  return pickSnapState({ translateY, velocityY, peekTranslateY: PEEK, dismissTranslateY: DISMISS, from });
}

describe("translateForState", () => {
  it("full = 0, peek = peekTranslateY", () => {
    expect(translateForState("full", PEEK)).toBe(0);
    expect(translateForState("peek", PEEK)).toBe(PEEK);
  });
});

describe("pickSnapState — slow settle (negligible velocity)", () => {
  it("near the top settles to full", () => {
    expect(snap(20, 0, "full")).toBe("full");
    expect(snap(120, 0, "peek")).toBe("full");
  });

  it("near the peek line settles to peek", () => {
    expect(snap(PEEK - 30, 0, "full")).toBe("peek");
    expect(snap(PEEK + 40, 0, "peek")).toBe("peek");
  });

  it("dragged most of the way down settles to dismiss", () => {
    expect(snap(DISMISS - 60, 0, "peek")).toBe("dismiss");
    expect(snap(DISMISS, 0, "peek")).toBe("dismiss");
  });

  it("exact midpoint between full and peek rounds toward full (closer)", () => {
    // midpoint is PEEK/2 = 184; slightly below it -> peek, slightly above -> full
    expect(snap(PEEK / 2 - 1, 0, "full")).toBe("full");
    expect(snap(PEEK / 2 + 1, 0, "full")).toBe("peek");
  });
});

describe("pickSnapState — flicks", () => {
  it("a hard upward flick always expands to full, wherever it is", () => {
    expect(snap(PEEK, -FLICK_VELOCITY, "peek")).toBe("full");
    expect(snap(PEEK + 100, -1.5, "peek")).toBe("full");
    expect(snap(40, -2, "full")).toBe("full");
  });

  it("a hard downward flick from full goes to peek (one notch)", () => {
    expect(snap(30, FLICK_VELOCITY, "full")).toBe("peek");
    expect(snap(80, 2, "full")).toBe("peek");
  });

  it("a hard downward flick from peek dismisses (one notch)", () => {
    expect(snap(PEEK, FLICK_VELOCITY, "peek")).toBe("dismiss");
    expect(snap(PEEK + 20, 1.2, "peek")).toBe("dismiss");
  });

  it("velocity just under the flick threshold is treated as a settle, not a flick", () => {
    // tiny downward velocity near the top -> still settles to full, not peek
    expect(snap(20, FLICK_VELOCITY - 0.01, "full")).toBe("full");
  });
});
