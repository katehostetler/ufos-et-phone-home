import { describe, it, expect } from "vitest";
import {
  UFO_POOL,
  TRANSMISSIONS,
  TRANSMISSION_HEADER,
  randomUfoSpec,
  makeSpawnManager,
} from "@/lib/ufos";

// Deterministic RNG — simple LCG seeded at 42
function makeLcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Pool ─────────────────────────────────────────────────────────────────────

describe("UFO_POOL", () => {
  it("contains at least 6 entries", () => {
    expect(UFO_POOL.length).toBeGreaterThanOrEqual(6);
  });

  it("contains both 'orb' and 'saucer' kinds", () => {
    const kinds = new Set(UFO_POOL.map((u) => u.kind));
    expect(kinds.has("orb")).toBe(true);
    expect(kinds.has("saucer")).toBe(true);
  });

  it("all entries have valid structure", () => {
    for (const spec of UFO_POOL) {
      expect(["orb", "saucer"]).toContain(spec.kind);
      expect(spec.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(spec.glowIntensity).toBeGreaterThan(0);
      expect(spec.glowIntensity).toBeLessThanOrEqual(1);
      expect(spec.latRange[0]).toBeLessThan(spec.latRange[1]);
      expect(spec.lngRange[0]).toBeLessThan(spec.lngRange[1]);
      expect(spec.altitude).toBeGreaterThan(0);
      expect(spec.lifespan).toBeGreaterThan(0);
    }
  });

  it("colors do not exactly match the pin palette", () => {
    const pinColors = ["#ff3b3b", "#5ad7ff", "#ffc870"];
    for (const spec of UFO_POOL) {
      expect(pinColors).not.toContain(spec.color.toLowerCase());
    }
  });
});

// ── Transmissions ─────────────────────────────────────────────────────────────

describe("TRANSMISSIONS", () => {
  it("is non-empty", () => {
    expect(TRANSMISSIONS.length).toBeGreaterThan(0);
  });

  it("all entries are non-empty strings", () => {
    for (const t of TRANSMISSIONS) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("TRANSMISSION_HEADER is a non-empty string", () => {
    expect(typeof TRANSMISSION_HEADER).toBe("string");
    expect(TRANSMISSION_HEADER.length).toBeGreaterThan(0);
  });

  it("header communicates fictional nature", () => {
    // Should contain words that frame this as fiction / unverified
    expect(TRANSMISSION_HEADER.toLowerCase()).toMatch(
      /fictional|unverified|intercepted/
    );
  });
});

// ── randomUfoSpec ─────────────────────────────────────────────────────────────

describe("randomUfoSpec", () => {
  it("returns a valid spec, lat, lng, and drift values", () => {
    const rnd = makeLcg(1);
    const result = randomUfoSpec(rnd);
    expect(UFO_POOL).toContain(result.spec);
    expect(result.lat).toBeGreaterThanOrEqual(result.spec.latRange[0]);
    expect(result.lat).toBeLessThanOrEqual(result.spec.latRange[1]);
    expect(result.lng).toBeGreaterThanOrEqual(result.spec.lngRange[0]);
    expect(result.lng).toBeLessThanOrEqual(result.spec.lngRange[1]);
    // drift is a unit-ish vector component in [-1, 1]
    expect(Math.abs(result.driftLat)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.driftLng)).toBeLessThanOrEqual(1);
  });

  it("is deterministic given the same rnd", () => {
    const a = randomUfoSpec(makeLcg(99));
    const b = randomUfoSpec(makeLcg(99));
    expect(a.spec).toBe(b.spec);
    expect(a.lat).toBeCloseTo(b.lat, 10);
    expect(a.lng).toBeCloseTo(b.lng, 10);
    expect(a.driftLat).toBeCloseTo(b.driftLat, 10);
    expect(a.driftLng).toBeCloseTo(b.driftLng, 10);
  });

  it("produces varied specs across many calls", () => {
    const rnd = makeLcg(7);
    const kinds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      kinds.add(randomUfoSpec(rnd).spec.kind);
    }
    // Should have seen both kinds in 50 calls
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});

// ── Spawn manager ─────────────────────────────────────────────────────────────

describe("makeSpawnManager", () => {
  const CAP = 3;

  it("starts with no active UFOs", () => {
    const mgr = makeSpawnManager({ cap: CAP, now: 0 });
    expect(mgr.getActive().size).toBe(0);
  });

  it("spawns on the first tick", () => {
    const rnd = makeLcg(5);
    const mgr = makeSpawnManager({ cap: CAP, now: 0, rnd });
    const delta = mgr.tick(0);
    expect(delta.spawned.length).toBe(1);
    expect(mgr.getActive().size).toBe(1);
  });

  it("NEVER exceeds cap of 3 over a simulated 10 seconds of frames", () => {
    const rnd = makeLcg(42);
    const mgr = makeSpawnManager({ cap: CAP, now: 0, rnd, spawnIntervalMs: 500 });

    const frameMs = 16; // ~60fps
    const totalMs = 10_000;
    let maxSeen = 0;

    for (let t = 0; t <= totalMs; t += frameMs) {
      mgr.tick(t);
      const count = mgr.getActive().size;
      if (count > maxSeen) maxSeen = count;
      // Hard assertion every frame
      expect(count).toBeLessThanOrEqual(CAP);
    }

    // Sanity: we should have seen some UFOs alive
    expect(maxSeen).toBeGreaterThan(0);
  });

  it("despawns UFOs when their lifespan expires", () => {
    const rnd = makeLcg(11);
    // Use a short lifespan spec by overriding — we'll drive time past it
    const mgr = makeSpawnManager({ cap: 3, now: 0, rnd, spawnIntervalMs: 0 });

    // Spawn one
    const delta0 = mgr.tick(0);
    expect(delta0.spawned.length).toBeGreaterThanOrEqual(1);

    const spawned = delta0.spawned[0];
    const lifespanMs = spawned.spec.lifespan * 1000;

    // Just before expiry — should still be alive
    mgr.tick(lifespanMs - 1);
    expect(mgr.getActive().has(spawned.id)).toBe(true);

    // At or after expiry — should be gone
    const delta = mgr.tick(lifespanMs);
    expect(delta.despawned).toContain(spawned.id);
    expect(mgr.getActive().has(spawned.id)).toBe(false);
  });

  it("does not spawn faster than spawnIntervalMs", () => {
    const rnd = makeLcg(77);
    const mgr = makeSpawnManager({ cap: 3, now: 0, rnd, spawnIntervalMs: 3000 });

    // Tick at t=0 (should spawn)
    const d1 = mgr.tick(0);
    expect(d1.spawned.length).toBe(1);

    // Tick at t=1000 — too soon, no new spawn
    const d2 = mgr.tick(1000);
    expect(d2.spawned.length).toBe(0);

    // Tick at t=2999 — still too soon
    const d3 = mgr.tick(2999);
    expect(d3.spawned.length).toBe(0);

    // Tick at t=3000 — now eligible
    const d4 = mgr.tick(3000);
    expect(d4.spawned.length).toBe(1);
  });

  it("reports spawned UFO ids in delta", () => {
    const rnd = makeLcg(3);
    const mgr = makeSpawnManager({ cap: 3, now: 0, rnd });
    const delta = mgr.tick(0);
    expect(delta.spawned.length).toBeGreaterThan(0);
    for (const ufo of delta.spawned) {
      expect(typeof ufo.id).toBe("number");
      expect(ufo.id).toBeGreaterThan(0);
    }
  });
});
