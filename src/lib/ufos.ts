/**
 * src/lib/ufos.ts
 *
 * Pure data + logic for the floating-UFO easter egg.
 * No DOM / Three.js imports — unit-testable in isolation.
 *
 * Craft colors are desaturated metallic silver / steel / chrome tones —
 * "futuristic spacecraft", and well clear of the media-type pin palette:
 *   vid: #ff3b3b  |  img: #5ad7ff  |  pdf: #ffc870
 */

// ─── UFO pool ────────────────────────────────────────────────────────────────

/**
 * Two iconic UFO silhouettes:
 *  - "saucer": classic flying saucer (thin disc + prominent dome + rim lights)
 *  - "tictac": Navy-style tic-tac (smooth elongated metallic capsule)
 *
 * Abstract glowing orbs were removed — at small sizes they read as smudges,
 * not spaceships. These two shapes are unmistakable at a glance, and each
 * pool entry is a slightly different metal tone / size so two on screen at
 * once never look identical.
 */
export type UfoKind = "saucer" | "tictac";

export interface UfoSpec {
  kind: UfoKind;
  /** body color hex (metallic silver / steel / chrome) */
  color: string;
  /** 0-1 base opacity of the emissive rim/glow accents */
  glowIntensity: number;
  /** overall scale multiplier so individuals differ a bit in size */
  scale: number;
  /** lat range for spawning: [min, max] */
  latRange: [number, number];
  /** lng range for spawning: [min, max] */
  lngRange: [number, number];
  /** altitude above globe surface (0 = surface) */
  altitude: number;
  /** seconds the UFO stays alive before despawning */
  lifespan: number;
  /** radians per second for saucer spin / tic-tac wobble */
  spinSpeed: number;
  /** drift speed in degrees/second */
  driftSpeed: number;
}

export const UFO_POOL: UfoSpec[] = [
  // All flying saucers, in dark-silver / gunmetal tones — the "pill" tic-tac
  // didn't read as a spaceship, and pale near-white bodies wash out on small
  // screens. `driftSpeed` is the baseline cruise speed; the renderer makes
  // them wander sporadically and jet away if the cursor gets near.
  {
    kind: "saucer",
    color: "#a9b3c0", // brushed silver
    glowIntensity: 0.55,
    scale: 1.0,
    latRange: [-45, 45],
    lngRange: [-180, 180],
    altitude: 0.22,
    lifespan: 15,
    spinSpeed: 0.9,
    driftSpeed: 3.0,
  },
  {
    kind: "saucer",
    color: "#8a94a2", // gunmetal / titanium
    glowIntensity: 0.5,
    scale: 1.12,
    latRange: [-42, 42],
    lngRange: [-180, 180],
    altitude: 0.21,
    lifespan: 16,
    spinSpeed: 0.7,
    driftSpeed: 2.7,
  },
  {
    kind: "saucer",
    color: "#6f7884", // dark steel
    glowIntensity: 0.45,
    scale: 0.92,
    latRange: [-50, 50],
    lngRange: [-180, 180],
    altitude: 0.24,
    lifespan: 13,
    spinSpeed: 1.15,
    driftSpeed: 3.4,
  },
  {
    kind: "saucer",
    color: "#9ba5b2", // pewter-silver
    glowIntensity: 0.5,
    scale: 1.0,
    latRange: [-38, 38],
    lngRange: [-180, 180],
    altitude: 0.26,
    lifespan: 14,
    spinSpeed: 0.85,
    driftSpeed: 3.1,
  },
  {
    kind: "saucer",
    color: "#5f6874", // charcoal silver
    glowIntensity: 0.4,
    scale: 1.06,
    latRange: [-35, 35],
    lngRange: [-180, 180],
    altitude: 0.23,
    lifespan: 13,
    spinSpeed: 1.0,
    driftSpeed: 3.6,
  },
  {
    kind: "saucer",
    color: "#b4bcc6", // light brushed aluminum
    glowIntensity: 0.55,
    scale: 0.96,
    latRange: [-48, 48],
    lngRange: [-180, 180],
    altitude: 0.25,
    lifespan: 15,
    spinSpeed: 0.95,
    driftSpeed: 3.2,
  },
  {
    kind: "saucer",
    color: "#7e8893", // slate steel
    glowIntensity: 0.48,
    scale: 1.08,
    latRange: [-40, 40],
    lngRange: [-180, 180],
    altitude: 0.22,
    lifespan: 14,
    spinSpeed: 0.8,
    driftSpeed: 2.9,
  },
  {
    kind: "saucer",
    color: "#646c78", // graphite
    glowIntensity: 0.42,
    scale: 0.9,
    latRange: [-46, 46],
    lngRange: [-180, 180],
    altitude: 0.27,
    lifespan: 12,
    spinSpeed: 1.2,
    driftSpeed: 3.5,
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
 * Original creative fiction — eerie, cryptic, deliberately untethered from any
 * real names, dates, or events. Flavor text, explicitly framed as such.
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

export interface UfoSpawnSnapshot {
  spec: UfoSpec;
  lat: number;
  lng: number;
  /** drift direction in degrees — lat heading */
  driftLat: number;
  /** drift direction in degrees — lng heading */
  driftLng: number;
}

/**
 * Pick a random UfoSpec, optionally excluding specs whose `color` is already
 * in use (so two craft on screen at once never look identical), and return a
 * spawn-time snapshot with randomized initial lat/lng + drift heading.
 */
export function randomUfoSpec(
  rnd: RndFn = Math.random,
  excludeColors: ReadonlySet<string> = new Set(),
): UfoSpawnSnapshot {
  const candidates =
    excludeColors.size > 0
      ? UFO_POOL.filter((s) => !excludeColors.has(s.color))
      : UFO_POOL;
  const pool = candidates.length > 0 ? candidates : UFO_POOL;
  const spec = pool[Math.floor(rnd() * pool.length)];
  const lat = spec.latRange[0] + rnd() * (spec.latRange[1] - spec.latRange[0]);
  const lng = spec.lngRange[0] + rnd() * (spec.lngRange[1] - spec.lngRange[0]);
  const angle = rnd() * Math.PI * 2;
  return { spec, lat, lng, driftLat: Math.sin(angle), driftLng: Math.cos(angle) };
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
  /** Maximum concurrent UFOs (hard cap). Defaults to 4. */
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
  cap = 4,
  now,
  rnd = Math.random,
  spawnIntervalMs = 8000,
}: SpawnManagerOptions): SpawnManager {
  const active = new Map<number, ActiveUfo>();
  let lastSpawnAttempt = now - spawnIntervalMs; // allow immediate first spawn

  function tick(nowMs: number): SpawnDelta {
    const spawned: ActiveUfo[] = [];
    const despawned: number[] = [];

    for (const [id, ufo] of active) {
      if (nowMs - ufo.spawnedAt >= ufo.spec.lifespan * 1000) {
        active.delete(id);
        despawned.push(id);
      }
    }

    if (active.size < cap && nowMs - lastSpawnAttempt >= spawnIntervalMs) {
      lastSpawnAttempt = nowMs;
      const inUse = new Set<string>();
      for (const u of active.values()) inUse.add(u.spec.color);
      const { spec, lat, lng, driftLat, driftLng } = randomUfoSpec(rnd, inUse);
      const ufo: ActiveUfo = { id: _nextId++, spec, lat, lng, driftLat, driftLng, spawnedAt: nowMs };
      active.set(ufo.id, ufo);
      spawned.push(ufo);
    }

    return { spawned, despawned };
  }

  return { tick, getActive: () => active };
}
