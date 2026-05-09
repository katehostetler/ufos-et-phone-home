/**
 * src/lib/ufos.ts
 *
 * Pure data + logic for the floating-UFO easter egg.
 * No DOM / Three.js imports — unit-testable in isolation.
 *
 * Neutral pale colors chosen to avoid the media-type pin palette:
 *   vid: #ff3b3b  |  img: #5ad7ff  |  pdf: #ffc870
 */

// ─── UFO pool ────────────────────────────────────────────────────────────────

export type UfoKind = "orb" | "saucer";

export interface UfoSpec {
  kind: UfoKind;
  /** emissive color hex */
  color: string;
  /** 0-1 base opacity of the emissive glow */
  glowIntensity: number;
  /** lat range for spawning: [min, max] */
  latRange: [number, number];
  /** lng range for spawning: [min, max] */
  lngRange: [number, number];
  /** altitude above globe surface (0 = surface) */
  altitude: number;
  /** seconds the UFO stays alive before despawning */
  lifespan: number;
  /** radians per second for saucer spin */
  spinSpeed: number;
  /** seconds per pulse cycle for orb */
  pulseSpeed: number;
  /** drift speed in degrees/second */
  driftSpeed: number;
}

/**
 * The starter pool of 8 UFO specs.
 * Mix of orbs and saucers. All pale/neutral tones that don't clash
 * with the pin colors (red / cyan-blue / gold).
 */
export const UFO_POOL: UfoSpec[] = [
  {
    kind: "orb",
    color: "#b8ffe0",   // pale mint
    glowIntensity: 0.75,
    latRange: [-50, 50],
    lngRange: [-180, 180],
    altitude: 0.18,
    lifespan: 18,
    spinSpeed: 0,
    pulseSpeed: 1.8,
    driftSpeed: 3.5,
  },
  {
    kind: "saucer",
    color: "#d4c8ff",   // pale lavender
    glowIntensity: 0.6,
    latRange: [-45, 45],
    lngRange: [-180, 180],
    altitude: 0.22,
    lifespan: 22,
    spinSpeed: 0.8,
    pulseSpeed: 0,
    driftSpeed: 2.8,
  },
  {
    kind: "orb",
    color: "#e8f4ff",   // very pale ice blue
    glowIntensity: 0.5,
    latRange: [-60, 60],
    lngRange: [-180, 180],
    altitude: 0.15,
    lifespan: 15,
    spinSpeed: 0,
    pulseSpeed: 2.4,
    driftSpeed: 4.2,
  },
  {
    kind: "saucer",
    color: "#ffe8b0",   // pale warm white (not gold — lower saturation)
    glowIntensity: 0.55,
    latRange: [-40, 40],
    lngRange: [-180, 180],
    altitude: 0.25,
    lifespan: 20,
    spinSpeed: 1.1,
    pulseSpeed: 0,
    driftSpeed: 3.0,
  },
  {
    kind: "orb",
    color: "#c8ffe8",   // ghostly pale green
    glowIntensity: 0.7,
    latRange: [-55, 55],
    lngRange: [-180, 180],
    altitude: 0.20,
    lifespan: 16,
    spinSpeed: 0,
    pulseSpeed: 1.5,
    driftSpeed: 3.8,
  },
  {
    kind: "saucer",
    color: "#f0e8ff",   // pale violet
    glowIntensity: 0.5,
    latRange: [-35, 35],
    lngRange: [-180, 180],
    altitude: 0.28,
    lifespan: 24,
    spinSpeed: 0.6,
    pulseSpeed: 0,
    driftSpeed: 2.5,
  },
  {
    kind: "orb",
    color: "#fffbe0",   // pale cream white
    glowIntensity: 0.45,
    latRange: [-65, 65],
    lngRange: [-180, 180],
    altitude: 0.16,
    lifespan: 14,
    spinSpeed: 0,
    pulseSpeed: 2.0,
    driftSpeed: 5.0,
  },
  {
    kind: "saucer",
    color: "#b8f0ff",   // pale sky (not the #5ad7ff img-pin blue — lighter)
    glowIntensity: 0.65,
    latRange: [-42, 42],
    lngRange: [-180, 180],
    altitude: 0.23,
    lifespan: 19,
    spinSpeed: 0.9,
    pulseSpeed: 0,
    driftSpeed: 3.2,
  },
];

// ─── Transmissions ───────────────────────────────────────────────────────────

/**
 * Header shown above every transmission in the modal.
 * Clearly fictional framing — NOT presented as real data.
 */
export const TRANSMISSION_HEADER =
  "— INTERCEPTED SIGNAL · ORIGIN UNVERIFIED · FICTIONAL RECONSTRUCTION —";

/**
 * Pool of fictional transmission fragments shown in the modal.
 * These are original creative fiction — eerie, cryptic, deliberately
 * untethered from any real names, dates, or events.
 * They are flavor text and are explicitly framed as such.
 */
export const TRANSMISSIONS: readonly string[] = [
  "THEY HAVE BEEN WATCHING THE WATER. THEY WERE HERE BEFORE THE NAMES. DO NOT LOOK DIRECTLY AT THE SIGNAL SOURCE.",
  "PATTERN RECOGNITION THRESHOLD EXCEEDED. THIRTY-SEVEN CONTACT EVENTS IN THIRTY-SEVEN DAYS. THE GEOMETRY IS NOT COINCIDENTAL.",
  "WE SENT A PROBE. IT CAME BACK CHANGED. THE CREW ASKED IF WE HAD ALWAYS CAST TWO SHADOWS. WE HAD NOT.",
  "THIS MESSAGE IS ADDRESSED TO THE ONES WHO BUILT THE ARCHIVE. YOU ARE CLOSER THAN YOU WERE TOLD. STOP COUNTING THE PINS.",
  "THE CRAFT DOES NOT MOVE THROUGH SPACE. IT MOVES THROUGH THE ATTENTION OF THOSE WHO OBSERVE IT. STOP OBSERVING.",
  "TRANSLATION INCOMPLETE. WHAT IS RENDERED HERE IS THE SAFEST VERSION. THE REST HAS BEEN WITHHELD BY REQUEST OF THE SIGNAL ITSELF.",
  "THEY ARE NOT VISITING. THEY ARE RETURNING. THE DISTINCTION MATTERS MORE THAN HEADQUARTERS HAS ACKNOWLEDGED.",
  "FREQUENCY MATCHED AT 0342 LOCAL. THE TRANSMISSION LASTED ELEVEN SECONDS. ANALYSIS SUGGESTS IT CONTAINED SEVENTEEN YEARS OF CONTENT.",
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Seeded random: pass a custom rnd for deterministic tests. */
export type RndFn = () => number;

/**
 * Pick a random UfoSpec from UFO_POOL and return a spawn-time snapshot
 * with randomized initial lat/lng within the spec's ranges.
 */
export function randomUfoSpec(rnd: RndFn = Math.random): {
  spec: UfoSpec;
  lat: number;
  lng: number;
  /** drift direction in degrees — lat heading */
  driftLat: number;
  /** drift direction in degrees — lng heading */
  driftLng: number;
} {
  const spec = UFO_POOL[Math.floor(rnd() * UFO_POOL.length)];
  const lat = spec.latRange[0] + rnd() * (spec.latRange[1] - spec.latRange[0]);
  const lng = spec.lngRange[0] + rnd() * (spec.lngRange[1] - spec.lngRange[0]);
  // Random drift heading (unit vector in lat/lng space, -1..1 each)
  const angle = rnd() * Math.PI * 2;
  const driftLat = Math.sin(angle);
  const driftLng = Math.cos(angle);
  return { spec, lat, lng, driftLat, driftLng };
}

// ─── Spawn manager ───────────────────────────────────────────────────────────

export interface ActiveUfo {
  id: number;
  spec: UfoSpec;
  lat: number;
  lng: number;
  driftLat: number;
  driftLng: number;
  /** timestamp (ms) this UFO was spawned */
  spawnedAt: number;
}

export interface SpawnDelta {
  spawned: ActiveUfo[];
  despawned: number[]; // ids
}

export interface SpawnManager {
  tick(nowMs: number): SpawnDelta;
  /** Read current active UFOs (does NOT advance time) */
  getActive(): ReadonlyMap<number, ActiveUfo>;
}

interface SpawnManagerOptions {
  /** Maximum concurrent UFOs (hard cap) */
  cap?: number;
  /** Initial timestamp in ms */
  now: number;
  /** Injected rng for determinism in tests */
  rnd?: RndFn;
  /** Minimum ms between spawn attempts */
  spawnIntervalMs?: number;
}

let _nextId = 1;

export function makeSpawnManager({
  cap = 3,
  now,
  rnd = Math.random,
  spawnIntervalMs = 3000,
}: SpawnManagerOptions): SpawnManager {
  const active = new Map<number, ActiveUfo>();
  let lastSpawnAttempt = now - spawnIntervalMs; // allow immediate first spawn

  function tick(nowMs: number): SpawnDelta {
    const spawned: ActiveUfo[] = [];
    const despawned: number[] = [];

    // Despawn expired UFOs
    for (const [id, ufo] of active) {
      const ageMs = nowMs - ufo.spawnedAt;
      if (ageMs >= ufo.spec.lifespan * 1000) {
        active.delete(id);
        despawned.push(id);
      }
    }

    // Try to spawn a new UFO (throttled + capped)
    if (
      active.size < cap &&
      nowMs - lastSpawnAttempt >= spawnIntervalMs
    ) {
      lastSpawnAttempt = nowMs;
      const { spec, lat, lng, driftLat, driftLng } = randomUfoSpec(rnd);
      const ufo: ActiveUfo = {
        id: _nextId++,
        spec,
        lat,
        lng,
        driftLat,
        driftLng,
        spawnedAt: nowMs,
      };
      active.set(ufo.id, ufo);
      spawned.push(ufo);
    }

    return { spawned, despawned };
  }

  function getActive(): ReadonlyMap<number, ActiveUfo> {
    return active;
  }

  return { tick, getActive };
}
