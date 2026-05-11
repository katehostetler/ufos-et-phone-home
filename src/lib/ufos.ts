/**
 * src/lib/ufos.ts
 *
 * Pure data + logic for the floating-UFO easter egg.
 * No DOM / Three.js imports — unit-testable in isolation.
 *
 * Craft colors are desaturated metallic silver / steel / chrome tones —
 * "futuristic spacecraft", and well clear of the media-type pin palette:
 *   vid: #ff3b3b  |  img: #5ad7ff  |  pdf: #b56cff
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

/** "small" craft are noticeably smaller AND faster; "large" are bigger and slower. */
export type UfoSizeClass = "small" | "large";

export interface UfoSpec {
  kind: UfoKind;
  /** body color hex (metallic silver / steel / chrome) */
  color: string;
  /** size bucket — the spawner pairs a small craft with a large one so the
   *  two always on screen are clearly different sizes */
  sizeClass: UfoSizeClass;
  /** 0-1 base opacity of the emissive rim/glow accents */
  glowIntensity: number;
  /** overall scale multiplier — small ~0.6, large ~1.5 */
  scale: number;
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
  /** drift speed in degrees/second — small craft zip, large craft cruise */
  driftSpeed: number;
}

export const UFO_POOL: UfoSpec[] = [
  // All flying saucers, in dark-silver / gunmetal tones. Two size classes —
  // small craft are little and quick; large craft are big and slow. The spawn
  // manager keeps at least one of each up, so there are always ≥2 on screen at
  // visibly different sizes moving at visibly different speeds. `driftSpeed` is
  // the baseline cruise; the renderer adds sporadic wander + a short flee-dart.

  // ── small + fast ──────────────────────────────────────────────────────────
  {
    kind: "saucer", color: "#b4bcc6", sizeClass: "small", // bright aluminum scout
    glowIntensity: 0.6, scale: 0.78, latRange: [-50, 50], lngRange: [-180, 180],
    altitude: 0.24, lifespan: 14, spinSpeed: 1.3, driftSpeed: 4.6,
  },
  {
    kind: "saucer", color: "#a9b3c0", sizeClass: "small", // brushed-silver darter
    glowIntensity: 0.58, scale: 0.6, latRange: [-52, 52], lngRange: [-180, 180],
    altitude: 0.26, lifespan: 13, spinSpeed: 1.5, driftSpeed: 5.6,
  },
  {
    kind: "saucer", color: "#9ba5b2", sizeClass: "small", // pewter probe
    glowIntensity: 0.55, scale: 0.7, latRange: [-48, 48], lngRange: [-180, 180],
    altitude: 0.23, lifespan: 14, spinSpeed: 1.4, driftSpeed: 5.0,
  },
  {
    kind: "saucer", color: "#7e8893", sizeClass: "small", // slate-steel zipper
    glowIntensity: 0.52, scale: 0.66, latRange: [-50, 50], lngRange: [-180, 180],
    altitude: 0.25, lifespan: 12, spinSpeed: 1.6, driftSpeed: 6.0,
  },

  // ── large + slow ──────────────────────────────────────────────────────────
  {
    kind: "saucer", color: "#8a94a2", sizeClass: "large", // gunmetal mothership
    glowIntensity: 0.5, scale: 1.5, latRange: [-40, 40], lngRange: [-180, 180],
    altitude: 0.21, lifespan: 17, spinSpeed: 0.6, driftSpeed: 2.0,
  },
  {
    kind: "saucer", color: "#6f7884", sizeClass: "large", // dark-steel cruiser
    glowIntensity: 0.46, scale: 1.35, latRange: [-42, 42], lngRange: [-180, 180],
    altitude: 0.24, lifespan: 16, spinSpeed: 0.7, driftSpeed: 2.4,
  },
  {
    kind: "saucer", color: "#5f6874", sizeClass: "large", // charcoal hauler
    glowIntensity: 0.42, scale: 1.65, latRange: [-36, 36], lngRange: [-180, 180],
    altitude: 0.22, lifespan: 18, spinSpeed: 0.5, driftSpeed: 1.7,
  },
  {
    kind: "saucer", color: "#646c78", sizeClass: "large", // graphite carrier
    glowIntensity: 0.44, scale: 1.42, latRange: [-44, 44], lngRange: [-180, 180],
    altitude: 0.27, lifespan: 16, spinSpeed: 0.65, driftSpeed: 2.2,
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
  "THE OBJECT HAS NO HEAT SIGNATURE BECAUSE IT IS NOT WARM. IT IS NOT COLD EITHER. OUR INSTRUMENTS REPORT THE TEMPERATURE OF A QUESTION.",
  "REQUEST DENIED. THE FOOTAGE YOU ARE LOOKING FOR WAS RECORDED ONTO A MEDIUM THAT DEGRADES WHEN DESCRIBED ALOUD. WE NO LONGER DISCUSS IT.",
  "EVERY PILOT WHO SAW IT DREW THE SAME SHAPE. NONE OF THEM HAD SPOKEN TO EACH OTHER. THREE OF THEM HAD NOT YET BEEN BORN.",
  "WE FINALLY DECODED THE BEACON. IT IS A COUNTDOWN. IT HAS BEEN RUNNING SINCE BEFORE WE HAD CLOCKS. THERE IS STILL TIME. PROBABLY.",
  "CONTACT LOGGED OVER THE DESERT. THE WITNESS SAID IT 'OPENED LIKE AN EYE.' WE ASKED WHAT IT LOOKED AT. THE WITNESS WOULD ONLY SAY 'BACK.'",
  "DO NOT TRUST THE ALTITUDE READINGS. THE CRAFT IS NOT ABOVE YOU. IT IS THE SAME DISTANCE FROM EVERYONE, ALWAYS, AND HAS BEEN PATIENT.",
  "THE SIGNAL CARRIES NO LANGUAGE WE RECOGNIZE, BUT EVERYONE WHO HEARS IT REPORTS THE SAME FEELING: THAT THEY HAVE BEEN ASKED TO COME HOME.",
  "FILE FLAGGED FOR REVIEW: THE PHOTOGRAPH SHOWS NOTHING UNUSUAL. THAT IS THE ANOMALY. SOMETHING WAS THERE WHEN IT WAS TAKEN. ASK THE CAMERA.",
  "WE STOPPED CHASING THEM IN 1994. NOT BECAUSE THEY WERE TOO FAST. BECAUSE ONE OF THEM SLOWED DOWN, MATCHED OUR SPEED, AND WAITED.",
  "ATMOSPHERIC RE-ENTRY DETECTED WITH NO CORRESPONDING LAUNCH. NO DEBRIS. NO CRATER. JUST A NEW LIGHT IN A WINDOW THAT FACES THE SKY.",
  "THEY DO NOT WANT THE PLANET. THEY WANT THE RECORDINGS. EVERY TAPE, EVERY TRANSCRIPT, EVERY MARGIN NOTE IN SOMEONE'S HANDWRITING. ESPECIALLY THOSE.",
  "TO WHOEVER IS READING THE DECLASSIFIED FILES: YOU WERE SUPPOSED TO. THAT WAS ALWAYS PART OF IT. CONTINUE. WE ARE INTERESTED IN WHAT YOU DO NEXT.",
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
 * Pick a random UfoSpec and return a spawn-time snapshot (randomized lat/lng +
 * drift heading). Tries hardest to honour BOTH exclusions — different colour AND
 * a different size class than what's already on screen (so the pair on screen is
 * a distinct big-slow + small-fast); falls back to colour-only, then to any.
 */
export function randomUfoSpec(
  rnd: RndFn = Math.random,
  excludeColors: ReadonlySet<string> = new Set(),
  excludeSizeClasses: ReadonlySet<string> = new Set(),
): UfoSpawnSnapshot {
  let candidates = UFO_POOL.filter(
    (s) => !excludeColors.has(s.color) && !excludeSizeClasses.has(s.sizeClass),
  );
  if (candidates.length === 0) candidates = UFO_POOL.filter((s) => !excludeColors.has(s.color));
  if (candidates.length === 0) candidates = UFO_POOL;
  const spec = candidates[Math.floor(rnd() * candidates.length)];
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
  /** Floor — always keep at least this many alive (refilled immediately, no cooldown). Defaults to 2. */
  minActive?: number;
  /** Initial timestamp in ms */
  now: number;
  /** Injected rng for determinism in tests */
  rnd?: RndFn;
  /** Minimum ms between spawn attempts above the floor */
  spawnIntervalMs?: number;
}

let _nextId = 1;

export function makeSpawnManager({
  cap = 4,
  minActive = 2,
  now,
  rnd = Math.random,
  spawnIntervalMs = 8000,
}: SpawnManagerOptions): SpawnManager {
  const floor = Math.min(minActive, cap);
  const active = new Map<number, ActiveUfo>();
  let lastSpawnAttempt = now - spawnIntervalMs; // allow immediate first spawn

  function spawnOne(nowMs: number): ActiveUfo {
    const usedColors = new Set<string>();
    const usedSizeClasses = new Set<string>();
    for (const u of active.values()) {
      usedColors.add(u.spec.color);
      usedSizeClasses.add(u.spec.sizeClass);
    }
    const { spec, lat, lng, driftLat, driftLng } = randomUfoSpec(rnd, usedColors, usedSizeClasses);
    const ufo: ActiveUfo = { id: _nextId++, spec, lat, lng, driftLat, driftLng, spawnedAt: nowMs };
    active.set(ufo.id, ufo);
    return ufo;
  }

  function tick(nowMs: number): SpawnDelta {
    const spawned: ActiveUfo[] = [];
    const despawned: number[] = [];

    for (const [id, ufo] of active) {
      if (nowMs - ufo.spawnedAt >= ufo.spec.lifespan * 1000) {
        active.delete(id);
        despawned.push(id);
      }
    }

    // Always refill straight back up to the floor — no cooldown — so there are
    // never fewer than `minActive` craft on screen.
    while (active.size < floor) {
      spawned.push(spawnOne(nowMs));
      lastSpawnAttempt = nowMs;
    }
    // Above the floor: trickle in one more per cooldown, up to the hard cap.
    if (active.size < cap && nowMs - lastSpawnAttempt >= spawnIntervalMs) {
      lastSpawnAttempt = nowMs;
      spawned.push(spawnOne(nowMs));
    }

    return { spawned, despawned };
  }

  return { tick, getActive: () => active };
}
