# Homepage Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD where the spec calls for it; pure Three.js scene code is verified visually + with logic-extracted unit tests, not WebGL tests.

**Goal:** Three sequenced upgrades to the globe homepage — glossy 3D pushpin markers, a Hall of Fame chip+overlay of the 10 wildest records, and a floating-UFOs easter egg.

**Architecture:** Astro 6 + React 19 islands + react-globe.gl (Three.js) + Tailwind 4. Part A reworks pin geometry in `GlobeApp.tsx` and adds the project's first test setup (Vitest). Parts B & C add new React islands mounted in `index.astro` and small hooks into `GlobeApp.tsx`, developed in parallel git worktrees off the post-A `main`.

**Tech Stack:** Vitest + @testing-library/react + jsdom (new); existing: Astro, React, react-globe.gl, three, Tailwind.

**Source spec:** `docs/superpowers/specs/2026-05-08-homepage-polish-design.md`

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | add `test` (`vitest run`) + `test:watch` scripts; add devDeps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` |
| `vitest.config.ts` | create | jsdom env, `@` alias matching `tsconfig.json`, setup file |
| `vitest.setup.ts` | create | imports `@testing-library/jest-dom`; jsdom shims (`matchMedia`, `localStorage` no-ops as needed) |
| `src/lib/pushpin.ts` | create | `makePushpinNeedle(opts)` factory → returns the needle (`THREE.Mesh`) + optional base; pure, unit-testable. Also exports geometry constants. |
| `src/components/GlobeApp.tsx` | modify | swap cone body → pushpin needle (use `makePushpinNeedle`); restyle the `pointsData` head material to glossy; **(Part B)** listen for `open-record`; **(Part C)** mount `<FloatingUfos>` with the globe instance |
| `src/data/featured.json` | create | ordered `[{id, hook}]` — the 10 Hall of Fame records (content in spec Part B) |
| `scripts/build-records.mjs` | modify | append a `validateFeatured()` step: load `featured.json`, assert non-empty array, every `id` in `records.json`, every `hook` non-empty; else log + `process.exit(1)` |
| `src/lib/featured.ts` | create | `resolveFeatured(featured, records)` → `(Record & {hook})[]`, dropping unresolved ids; pure, unit-testable; used by `index.astro` |
| `src/components/HallOfFameOverlay.tsx` | create | the overlay island: closed by default, opens on `open-hall-of-fame` window event, card rail, `Esc`/backdrop/`✕` close, card click → dispatch `open-record` + close, reduced-motion aware |
| `src/components/TransmissionModal.tsx` | create | the easter-egg modal: cryptic fragment from a pool, animated UFO border, `Esc`/backdrop/`✕` close, optional `[DECRYPT ANOTHER]` |
| `src/lib/ufos.ts` | create | UFO pool definitions + spawn-manager logic (`nextSpawn`, lifetime/position randomizers, the max-3 rule) + the transmission string pool; pure, unit-testable |
| `src/components/FloatingUfos.tsx` | create | given the globe scene, spawns/animates/despawns UFO meshes per `ufos.ts`, raycasts hover/click, renders/triggers `<TransmissionModal>`; cleans up disposed meshes |
| `src/pages/index.astro` | modify | import + resolve `featured.json`; render `<HallOfFameOverlay>`; add `★ HALL OF FAME` bottom-left chip wired to dispatch `open-hall-of-fame` |
| `src/styles/global.css` | modify | Hall of Fame chip + overlay + card styles; transmission-modal + animated-border styles; UFO `cursor: crosshair` on hover |
| `tests/*` | create | see each part |
| `CHANGELOG.md`, `README.md` | modify | updated in the same commit as each part (project rule) |
| `docs/HANDOFF.md` | modify | refreshed after all three land |

---

## PART A — Glossy 3D pushpin markers (branch `feat/glossy-pushpins`, off `main`)

### Task A1: Set up Vitest

**Files:** Modify `package.json`; Create `vitest.config.ts`, `vitest.setup.ts`; Create `tests/smoke.test.ts`.

- [ ] **Step 1:** Add devDeps and scripts.
  ```bash
  npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
  ```
  In `package.json` `"scripts"`, add:
  ```json
  "test": "vitest run",
  "test:watch": "vitest"
  ```
- [ ] **Step 2:** Create `vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import { fileURLToPath } from "node:url";

  export default defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      globals: true,
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
  });
  ```
- [ ] **Step 3:** Create `vitest.setup.ts`:
  ```ts
  import "@testing-library/jest-dom/vitest";

  // jsdom doesn't implement matchMedia — components read it for reduced-motion.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  ```
- [ ] **Step 4:** Create `tests/smoke.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  describe("vitest", () => {
    it("runs", () => { expect(1 + 1).toBe(2); });
  });
  ```
- [ ] **Step 5:** Run `npm test` — expect 1 passing test. Run `npm run build` — expect clean (Vitest config must not break Astro's build).
- [ ] **Step 6:** Commit: `test: set up Vitest + testing-library`.

### Task A2: Pushpin needle factory (TDD)

**Files:** Create `src/lib/pushpin.ts`, `tests/pushpin.test.ts`.

- [ ] **Step 1:** Write `tests/pushpin.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { makePushpinNeedle, PUSHPIN } from "@/lib/pushpin";
  import * as THREE from "three";

  describe("makePushpinNeedle", () => {
    it("returns a Mesh with a thin cylinder geometry", () => {
      const m = makePushpinNeedle({ color: "#ff3b3b" });
      expect(m).toBeInstanceOf(THREE.Mesh);
      const g = m.geometry as THREE.CylinderGeometry;
      expect(g.type).toBe("CylinderGeometry");
      // thin shaft: both radii at/below the configured needle radius
      expect(g.parameters.radiusTop).toBeLessThanOrEqual(PUSHPIN.needleRadius);
      expect(g.parameters.radiusBottom).toBeLessThanOrEqual(PUSHPIN.needleRadius);
    });
    it("uses a glossy phong material", () => {
      const m = makePushpinNeedle({ color: "#5ad7ff" });
      const mat = m.material as THREE.MeshPhongMaterial;
      expect(mat.type).toBe("MeshPhongMaterial");
      expect(mat.shininess).toBeGreaterThan(50);
    });
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/pushpin.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Create `src/lib/pushpin.ts`:
  ```ts
  import * as THREE from "three";

  export const PUSHPIN = {
    needleRadius: 0.06,      // shaft radius (globe units)
    needleLengthUnit: 1,     // geometry height; scaled to altitude at update time
    headRadius: 1.15,        // bead radius (precise locations)
    headRadiusRegional: 1.35,
    headAltitude: 0.07,      // bead sits this high above the surface
    headAltitudeRegional: 0.085,
    needleColor: 0x9aa3ad,   // chrome shaft
  } as const;

  /** A thin glossy metallic needle (the pushpin shaft). Caller orients/scales it. */
  export function makePushpinNeedle(_opts: { color: string }): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(
      PUSHPIN.needleRadius,
      PUSHPIN.needleRadius,
      PUSHPIN.needleLengthUnit,
      10,
      1,
      false,
    );
    const mat = new THREE.MeshPhongMaterial({
      color: PUSHPIN.needleColor,
      shininess: 90,
      specular: new THREE.Color(0xffffff),
    });
    return new THREE.Mesh(geo, mat);
  }
  ```
  (The `color` opt is accepted for a future colored-collar variant; not used yet — keep the signature so `GlobeApp` call sites are stable. If YAGNI bites, drop it and update the test.)
- [ ] **Step 4:** Run `npx vitest run tests/pushpin.test.ts` — expect PASS.
- [ ] **Step 5:** Commit: `feat: add pushpin needle factory`.

### Task A3: Wire the pushpin into GlobeApp

**Files:** Modify `src/components/GlobeApp.tsx` (the `<Globe>` block, ~lines 312–389).

- [ ] **Step 1:** Import the factory: `import { makePushpinNeedle, PUSHPIN } from "@/lib/pushpin";`
- [ ] **Step 2:** Restyle the head. Replace `pointAltitude` / `pointRadius` to use `PUSHPIN.headAltitude*` / `PUSHPIN.headRadius*` (still `* 1.6` on touch). Add a glossy material via `pointThreeObject` **only if needed** — first try `globeMaterial`-free path: globe.gl points are basic spheres. To get gloss, supply `pointThreeObject={(d) => new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0xffffff, emissive: new THREE.Color(color).multiplyScalar(0.10) }))}` and keep `pointLabel`/`onPointClick` as-is (they still work with a custom point object). If `pointThreeObject` breaks hover/click, revert to default points and accept a flatter head — **do not move the head into `customLayerData`** (handoff gotcha). Document whichever path you took in a one-line comment.
- [ ] **Step 3:** Replace the cone body. In `customThreeObject`, return `makePushpinNeedle({ color: COLORS[d.mediaType] })` instead of the `CylinderGeometry(0.55, 0.08, 1, 14)` cone.
- [ ] **Step 4:** Update `customThreeObjectUpdate`: the needle should span from the surface (altitude 0) up to the bead's altitude (`PUSHPIN.headAltitude*` or its touch-scaled value), positioned at the midpoint, `obj.scale.set(1, length, 1)` (no XZ pumping — the needle is meant to stay thin even on touch; the bigger head reads as the affordance), then `obj.lookAt(0,0,0); obj.rotateX(Math.PI/2);` as today. Optionally add a faint base disc: a second child mesh (`CircleGeometry`) at the surface point — skip if it muddies the look.
- [ ] **Step 5:** `npm run build` — clean. `npm test` — green.
- [ ] **Step 6: Visual verify.** `npm run dev`; with Playwright, screenshot the homepage. Confirm pins read as map pushpins (bead + thin shaft), are visible on the lit *and* dark side of the globe, the pulsing ring still shows on video pins, hover tooltip still appears, clicking a pin still opens the modal + flies the camera. Iterate on `PUSHPIN` constants until it looks right. Save a screenshot to repo root (e.g. `homepage-pushpins.png`) like prior sessions did.
- [ ] **Step 7:** Update `CHANGELOG.md` (dated entry) and `README.md` if structure changed. Commit: `feat: glossy 3D pushpin markers replacing cone pins`.

### Task A4: Ship Part A
- [ ] Push `feat/glossy-pushpins`, open PR, wait for CI (Cloudflare preview build), squash-merge to `main`, delete branch. (Use the `/ship` skill if preferred.) **Parts B & C branch off this updated `main`.**

---

## PART B — Hall of Fame overlay (worktree, branch `feat/hall-of-fame`, off post-A `main`)

> Create the worktree with the `superpowers:using-git-worktrees` skill before starting.

### Task B1: `featured.json` + resolver + build validation (TDD on the pure bits)

**Files:** Create `src/data/featured.json`, `src/lib/featured.ts`, `tests/featured.test.ts`; Modify `scripts/build-records.mjs`.

- [ ] **Step 1:** Create `src/data/featured.json` with the exact 10-entry array from spec Part B (ids + hooks). Keep the hook punctuation (curly quotes, en-dashes) as written.
- [ ] **Step 2:** Write `tests/featured.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import featured from "@/data/featured.json";
  import records from "@/data/records.json";
  import { resolveFeatured } from "@/lib/featured";

  describe("featured.json", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(featured)).toBe(true);
      expect(featured.length).toBeGreaterThan(0);
    });
    it("every id resolves to a record and every hook is non-empty", () => {
      for (const f of featured as { id: string; hook: string }[]) {
        expect(records.find((r: any) => r.id === f.id), `missing record: ${f.id}`).toBeTruthy();
        expect(typeof f.hook === "string" && f.hook.trim().length > 0, `empty hook: ${f.id}`).toBe(true);
      }
    });
  });

  describe("resolveFeatured", () => {
    it("preserves order and attaches the hook", () => {
      const out = resolveFeatured(featured as any, records as any);
      expect(out).toHaveLength((featured as any[]).length);
      expect(out[0].id).toBe((featured as any[])[0].id);
      expect(out[0].hook).toBe((featured as any[])[0].hook);
    });
    it("drops entries whose record is missing", () => {
      const out = resolveFeatured([{ id: "does-not-exist", hook: "x" }] as any, records as any);
      expect(out).toHaveLength(0);
    });
  });
  ```
- [ ] **Step 3:** Run the test — expect FAIL (`resolveFeatured` missing).
- [ ] **Step 4:** Create `src/lib/featured.ts`:
  ```ts
  import type { Record } from "@/types/record";

  export interface FeaturedEntry { id: string; hook: string; }
  export type FeaturedRecord = Record & { hook: string };

  export function resolveFeatured(entries: FeaturedEntry[], records: Record[]): FeaturedRecord[] {
    const byId = new Map(records.map((r) => [r.id, r]));
    const out: FeaturedRecord[] = [];
    for (const e of entries) {
      const r = byId.get(e.id);
      if (r) out.push({ ...r, hook: e.hook });
    }
    return out;
  }
  ```
- [ ] **Step 5:** Run the test — expect PASS.
- [ ] **Step 6:** In `scripts/build-records.mjs`, after `records.json` is written, add:
  ```js
  // --- validate the curated Hall of Fame list ---
  const featured = JSON.parse(await fs.readFile(new URL("../src/data/featured.json", import.meta.url)));
  if (!Array.isArray(featured) || featured.length === 0) {
    console.error("featured.json must be a non-empty array"); process.exit(1);
  }
  const recIds = new Set(records.map((r) => r.id));   // adjust var name to match the script
  for (const f of featured) {
    if (!recIds.has(f.id)) { console.error(`featured.json references unknown record id: ${f.id}`); process.exit(1); }
    if (typeof f.hook !== "string" || !f.hook.trim()) { console.error(`featured.json entry ${f.id} has an empty hook`); process.exit(1); }
  }
  console.log(`✓ featured.json: ${featured.length} records validated`);
  ```
  (Match the script's existing fs import style and the actual variable holding the built records.)
- [ ] **Step 7:** Run `npm run build:data` — expect the `✓ featured.json` line, no errors. `npm test` — green.
- [ ] **Step 8:** Commit: `feat: featured.json + resolver + build validation for Hall of Fame`.

### Task B2: `HallOfFameOverlay` component (TDD on behavior)

**Files:** Create `src/components/HallOfFameOverlay.tsx`, `tests/HallOfFameOverlay.test.tsx`.

- [ ] **Step 1:** Write `tests/HallOfFameOverlay.test.tsx` covering: renders nothing/hidden initially; dispatching `window` event `open-hall-of-fame` shows it (header text `HALL OF FAME` visible, all featured titles present); pressing `Escape` closes it; clicking the backdrop closes it; clicking a card dispatches an `open-record` `CustomEvent` whose `detail` is that record's id **and** closes the overlay; when `matchMedia('(prefers-reduced-motion: reduce)')` returns `matches:true`, the rail container does not carry the `is-staggered` class. Use a small fake `featured` array of 2–3 real-shaped records.
  ```tsx
  // sketch — flesh out per the assertions above
  import { render, screen, fireEvent } from "@testing-library/react";
  import { describe, it, expect, vi } from "vitest";
  import HallOfFameOverlay from "@/components/HallOfFameOverlay";

  const featured = [
    { id: "a", title: "Alpha File", year: 2023, mediaType: "pdf", thumbnailUrl: "/x.jpg", blurb: "...", hook: "wild thing one", /* ...other Record fields as needed */ } as any,
    { id: "b", title: "Bravo File", year: 1965, mediaType: "vid", thumbnailUrl: "/y.jpg", blurb: "...", hook: "wild thing two" } as any,
  ];

  it("opens on event and lists featured records", () => {
    render(<HallOfFameOverlay featured={featured} />);
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
    fireEvent(window, new Event("open-hall-of-fame"));
    expect(screen.getByText(/HALL OF FAME/i)).toBeInTheDocument();
    expect(screen.getByText("Alpha File")).toBeInTheDocument();
  });
  it("card click dispatches open-record then closes", () => {
    render(<HallOfFameOverlay featured={featured} />);
    fireEvent(window, new Event("open-hall-of-fame"));
    const spy = vi.fn();
    window.addEventListener("open-record", spy as any);
    fireEvent.click(screen.getByText("Alpha File"));
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toBe("a");
    expect(screen.queryByText(/HALL OF FAME/i)).toBeNull();
  });
  ```
- [ ] **Step 2:** Run — expect FAIL (component missing).
- [ ] **Step 3:** Implement `src/components/HallOfFameOverlay.tsx`: props `{ featured: FeaturedRecord[] }`; `open` state; `useEffect` adds `open-hall-of-fame` listener (→ open), `keydown` Escape listener (→ close, only while open); renders `null` when closed; when open renders a fixed full-viewport backdrop (`role="dialog"`, `aria-label="Hall of Fame"`) with a `▣ HALL OF FAME · {featured.length} RECORDS` header, a `✕` close button, and a card rail (`<ul>` of cards). Each card: `<button data-id={r.id}>` with thumbnail `<img object-position:top>` (or `NO PREVIEW`), `.type-badge`, title, year, the hook (`.hof-hook`), and a clamped blurb. Card `onClick` → `window.dispatchEvent(new CustomEvent("open-record", { detail: r.id }))` then `setOpen(false)`. Backdrop `onClick` (only when the target is the backdrop itself) → close. Reduced-motion: `const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;` → only add `is-staggered` to the rail when `!reduce`. Defensive: filter out any falsy `featured` entries.
- [ ] **Step 4:** Run — expect PASS. `npm run build` — clean.
- [ ] **Step 5:** Commit: `feat: HallOfFameOverlay component`.

### Task B3: Mount it + the chip + the GlobeApp listener

**Files:** Modify `src/pages/index.astro`, `src/components/GlobeApp.tsx`, `src/styles/global.css`.

- [ ] **Step 1:** `index.astro`: `import featuredRaw from "@/data/featured.json"; import { resolveFeatured } from "@/lib/featured"; const featured = resolveFeatured(featuredRaw, all);` Render `<HallOfFameOverlay client:only="react" featured={featured} />` inside `<main class="globe-page">`.
- [ ] **Step 2:** `index.astro`: add the chip near the bottom-left of `.globe-page`:
  ```astro
  <button type="button" class="chip hof-chip" data-open="hall-of-fame" title="The wildest files in the release">★ HALL OF FAME</button>
  ```
  Extend the existing inline click-delegation `<script>` (or add a sibling listener) so a click on `[data-open="hall-of-fame"]` does `e.preventDefault(); window.dispatchEvent(new CustomEvent("open-hall-of-fame"));`.
- [ ] **Step 3:** `global.css`: position `.hof-chip` `position: fixed; left: 12px; bottom: 64px; z-index: 7;` (above the 56px dock; on mobile `bottom: 60px; left: 8px; font-size: 9px;`). Style the overlay: `.hof-overlay` fixed inset 0, `background: rgba(4,6,11,.82); backdrop-filter: blur(10px); z-index: 20;`; `.hof-header` Orbitron accent-green with corner brackets; `.hof-rail` horizontal `display:flex; gap:14px; overflow-x:auto; scroll-snap-type:x mandatory; padding:...;` cards `scroll-snap-align:start; width: 280px;` reusing `.card`/`.type-badge` look from `RecordCard.astro`; `.hof-hook` accent-green, slightly larger; clamped blurb (`-webkit-line-clamp:3`). `.hof-rail.is-staggered .hof-card { animation: hof-in .4s both; }` with `nth-child` delays; respect that `is-staggered` is only present when motion is allowed. Mobile: `.hof-rail { flex-direction: column; overflow-y: auto; }` full-width cards; sticky close button.
- [ ] **Step 4:** `GlobeApp.tsx`: add a `useEffect` that listens for `open-record` `CustomEvent`s: `const id = (e as CustomEvent<string>).detail; const rec = records.find(r => r.id === id); if (!rec) return; if (rec.hasLocation) { /* snapshot current POV like the pin-click path does, then globeRef.current?.pointOfView({ lat, lng, altitude }, 1000) */ } setModalRecords([rec]);` Reuse the existing POV-snapshot/restore mechanism so closing the modal returns the prior view. Clean up the listener on unmount.
- [ ] **Step 5:** `npm run build` — clean. `npm test` — green.
- [ ] **Step 6: Visual verify** (`npm run dev` + Playwright): the `★ HALL OF FAME` chip is bottom-left and doesn't overlap the dock or the legend; clicking it opens the overlay; the rail scrolls (horizontal desktop / vertical mobile); clicking a card opens the right record modal and (for located records) flies the globe; `Esc`/backdrop/`✕` all close it; screenshot desktop + mobile, save to repo root.
- [ ] **Step 7:** Update `CHANGELOG.md` + `README.md` (new `featured.json`, new component, the chip). Commit: `feat: Hall of Fame chip + overlay`.

### Task B4: Ship Part B
- [ ] From the worktree: push `feat/hall-of-fame`, PR, CI green, squash-merge, delete branch + worktree.

---

## PART C — Floating UFOs easter egg (worktree, branch `feat/floating-ufos`, off post-A `main`)

> Create the worktree with the `superpowers:using-git-worktrees` skill. Develop in parallel with Part B; merge B first, then C, resolving the small `GlobeApp.tsx` overlap (both add a mount/listener — keep both).

### Task C1: UFO pool + spawn-manager logic + transmission pool (TDD)

**Files:** Create `src/lib/ufos.ts`, `tests/ufos.test.ts`.

- [ ] **Step 1:** Write `tests/ufos.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { UFO_POOL, TRANSMISSIONS, makeSpawnManager, randomUfoSpec } from "@/lib/ufos";

  describe("ufo pool", () => {
    it("has both kinds", () => {
      expect(UFO_POOL.some((u) => u.kind === "orb")).toBe(true);
      expect(UFO_POOL.some((u) => u.kind === "saucer")).toBe(true);
    });
    it("transmissions are a non-empty list of strings", () => {
      expect(TRANSMISSIONS.length).toBeGreaterThan(3);
      expect(TRANSMISSIONS.every((t) => typeof t === "string" && t.length > 0)).toBe(true);
    });
  });

  describe("spawn manager", () => {
    it("never exceeds the cap of 3 active UFOs", () => {
      const mgr = makeSpawnManager({ cap: 3, now: 0 });
      // simulate 10 seconds of frames asking it to spawn aggressively
      let active = 0;
      for (let t = 0; t < 10_000; t += 16) {
        const ev = mgr.tick(t);
        active += ev.spawned.length - ev.despawned.length;
        expect(active).toBeLessThanOrEqual(3);
        expect(active).toBeGreaterThanOrEqual(0);
      }
    });
    it("randomUfoSpec produces in-range positions and a valid kind", () => {
      for (let i = 0; i < 50; i++) {
        const s = randomUfoSpec(() => Math.random());
        expect(["orb", "saucer"]).toContain(s.kind);
        expect(s.altitude).toBeGreaterThan(0);
        expect(s.lifetimeMs).toBeGreaterThan(0);
      }
    });
  });
  ```
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `src/lib/ufos.ts`:
  - `export type UfoKind = "orb" | "saucer";`
  - `export interface UfoPoolEntry { id: string; kind: UfoKind; colorHint: string; }` and `export const UFO_POOL: UfoPoolEntry[]` with ~6–8 entries (mix of orb/saucer; colorHints pale cyan/green-white — explicitly NOT the media-type pin colors).
  - `export const TRANSMISSIONS: string[]` — the ~8 cryptic fragments from spec Part C (verbatim, all original fiction). Add an exported header constant too, e.g. `export const TRANSMISSION_HEADER = "// SIGNAL INTERCEPT · UNAUTHENTICATED · ORIGIN UNKNOWN";`.
  - `export interface UfoSpec { poolId: string; kind: UfoKind; colorHint: string; altitude: number; angularSpeed: number; lifetimeMs: number; startLngDeg: number; startLatDeg: number; driftLatPerSec: number; }`
  - `export function randomUfoSpec(rnd: () => number): UfoSpec` — pick a pool entry, randomize altitude band (e.g. 0.15–0.6), angularSpeed (slow), lifetimeMs (e.g. 12_000–35_000), start lat/lng, small drift.
  - `export function makeSpawnManager(opts: { cap: number; now: number; rnd?: () => number }): { tick(now: number): { spawned: { spec: UfoSpec; expiresAt: number }[]; despawned: string[] } }` — internal list of active `{ key, expiresAt }`; on each `tick`, despawn any expired; if under `cap` and a (randomized, throttled) spawn timer elapsed, spawn one; return the deltas. Keep it deterministic-enough to test (inject `rnd`, default `Math.random`).
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit: `feat: UFO pool + spawn manager + transmission pool`.

### Task C2: `TransmissionModal` component (TDD on behavior)

**Files:** Create `src/components/TransmissionModal.tsx`, `tests/TransmissionModal.test.tsx`.

- [ ] **Step 1:** Write `tests/TransmissionModal.test.tsx`: renders `null` when no transmission; given a `text` prop renders it plus the `TRANSMISSION_HEADER`; `Escape`/backdrop/`✕` call `onClose`; if a `[DECRYPT ANOTHER]` button is present, clicking it calls `onAnother`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement: props `{ text: string | null; onClose: () => void; onAnother?: () => void }`. When `text` is null → `null`. Else a fixed centered modal (`role="dialog"`) with an **animated UFO border** wrapper (`.tx-modal` with a CSS-animated rotating dashed ring / scanning glow — defined in `global.css`), the header line, the `text` rendered with a subtle "decode" reveal (CSS only; reduced-motion → instant), `✕`, optional `[ DECRYPT ANOTHER ]`. `Esc` + backdrop click → `onClose`.
- [ ] **Step 4:** Run — expect PASS. `npm run build` — clean.
- [ ] **Step 5:** Commit: `feat: TransmissionModal component`.

### Task C3: `FloatingUfos` — scene integration

**Files:** Create `src/components/FloatingUfos.tsx`; Modify `src/components/GlobeApp.tsx`, `src/styles/global.css`.

- [ ] **Step 1:** Implement `src/components/FloatingUfos.tsx`. Props: `{ globeRef: React.MutableRefObject<GlobeMethods | undefined>; isTouch: boolean }`. On mount (and once `globeRef.current` exists): grab `scene = globeRef.current.scene()` and `camera = globeRef.current.camera()`. Create a parent `THREE.Group` added to `scene`. Maintain a `Map<key, { spec, mesh, born }>`. Build meshes: **orb** = small `SphereGeometry` + emissive/basic material + an additive halo `Sprite`; **saucer** = flattened body (`CylinderGeometry` very short, or scaled `SphereGeometry`) + small hemisphere dome + couple of tiny emissive rim dots, grouped; keep all low-poly. Drive everything from a `requestAnimationFrame` loop: call `spawnManager.tick(now)`, add/remove meshes accordingly, and update each active mesh's position by converting its evolving `(lat, lng, altitude)` to coords via `globeRef.current.getCoords(...)` (drift the lat/lng per `spec`), rotate saucers, pulse orbs. On despawn / unmount: remove from group, `geometry.dispose()`, `material.dispose()`, dispose sprite textures. **Raycasting:** on `pointermove`/`click` over the globe container, raycast from `camera` through the pointer against the UFO group's children; on hover set `container.style.cursor = "crosshair"` and bump that mesh's scale slightly; on click pick a `TRANSMISSIONS` entry at random, set state → render `<TransmissionModal text=... onClose=... onAnother=...>`, and `stopPropagation` so globe controls don't also react. Respect `prefers-reduced-motion`: skip drift/rotation/pulse updates (UFOs still appear, static, still clickable). Guard the whole thing if `globeRef.current` is briefly undefined.
- [ ] **Step 2:** `GlobeApp.tsx`: render `<FloatingUfos globeRef={globeRef} isTouch={isTouch} />` as a sibling inside the component tree (after `<Globe>`); make sure it has access to the same `globeRef`. Verify it doesn't interfere with existing pin hover/click (raycast only against the UFO group; let globe.gl handle the rest).
- [ ] **Step 3:** `global.css`: `.tx-modal` animated border (`@keyframes tx-scan` rotating conic-gradient or dashed `::before` ring), `.tx-header`, `.tx-body` decode shimmer, `prefers-reduced-motion` overrides; nothing for the UFOs themselves (they're WebGL) except the container `cursor` is set in JS.
- [ ] **Step 4:** `npm test` — green. `npm run build` — clean.
- [ ] **Step 5: Visual verify** (`npm run dev` + Playwright over ~30s): UFOs drift around the globe, **never more than 3 at once**, mix of orbs + saucers, positions/timing feel random; hovering one shows the crosshair + slight grow; clicking opens the transmission modal with a cryptic fragment + animated border; `[DECRYPT ANOTHER]` swaps the text; closing returns to the globe; globe drag/zoom still works normally; no console errors; FPS not visibly tanked. Screenshot, save to repo root.
- [ ] **Step 6:** Update `CHANGELOG.md` + `README.md`. Commit: `feat: floating UFOs easter egg + transmission modal`.

### Task C4: Ship Part C
- [ ] From the worktree: push `feat/floating-ufos`, PR, CI green, squash-merge (after Part B is in), delete branch + worktree. Resolve the `GlobeApp.tsx` overlap with Part B by keeping both the `open-record` listener and the `<FloatingUfos>` mount.

---

## After all three land
- [ ] Refresh `docs/HANDOFF.md`: remove the UFOs and curated-hero backlog items, note pins reworked, list the new files (`featured.json`, `HallOfFameOverlay`, `FloatingUfos`, `TransmissionModal`, `src/lib/*`, Vitest setup), and update "current state of main".
- [ ] Verify the live site (`et-phone-home.pages.dev`) after the final deploy.

## Self-review notes
- Spec coverage: Part A → A1–A4; Part B (chip bottom-left, overlay, featured.json, build validation, `open-record` listener, single modal owner, reduced-motion, tests) → B1–B4; Part C (mix of orbs+saucers, randomized, max 3, always-on, crosshair hover, cryptic eerie fictional transmissions, animated border, separate modal, perf cleanup, reduced-motion, tests) → C1–C4; Vitest setup → A1; testing plan → A2/B1/B2/C1/C2 unit tests + visual-verify steps; sequencing (pins first, then B & C in parallel worktrees, merge B then C) → covered.
- The `open-record` event uses `detail` = the id **string** (matches the existing `record-modal-open` convention in `GalleryModalRoot.tsx`); `open-hall-of-fame` carries no detail.
- `PUSHPIN` constants are tunable during the A3 visual-verify loop — that's expected refinement, not a placeholder.
