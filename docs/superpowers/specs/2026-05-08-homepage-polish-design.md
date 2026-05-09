# Homepage Polish — Design Spec

**Date:** 2026-05-08
**Status:** Approved (verbal) — proceeding to implementation plan
**Scope:** Three related upgrades to the globe homepage of `ufos-et-phone-home`, shipped in sequence:

1. **Glossy 3D pushpin markers** — replace the current tapered-cone pins (which read as "columns") with proper map-style pushpins. _Ships first, lands on `main` before the others start._
2. **Hall of Fame overlay** — a `★ HALL OF FAME` chip in the bottom-left corner that opens a curated overlay of the 10 wildest records.
3. **Floating UFOs easter egg** — randomized glowing-orb / flying-saucer sprites drifting around the globe; click one → a cryptic "transmission decoded" modal.

Builds on the existing architecture in `docs/HANDOFF.md` and `docs/superpowers/specs/2026-05-08-ufo-archive-design.md`. Honors the gotchas listed in the handoff doc (esp. pin-rendering: keep the clickable head as `pointsData`, don't move everything to `customLayer`).

---

## Part A — Glossy 3D pushpin markers

### Problem
`GlobeApp.tsx` currently renders each pin as a `pointsData` sphere "head" (~line 312) plus a `customLayerData` tapered `CylinderGeometry(0.55, 0.08, 1, 14)` "body" (~line 343). The body is too straight-sided and the head too small, so pins read as upright columns rather than location markers.

### Target
A skeuomorphic **pushpin**: a glossy spherical bead head on a thin metallic needle stuck radially into the globe surface.

- **Head** — stays a `pointsData` sphere (preserves globe.gl's built-in hover label + click handling; the handoff doc warns against moving this to `customLayer`). Restyle:
  - Larger radius than today (tune in implementation; goal is "bead", not "dot").
  - `MeshPhongMaterial` with high `shininess` and a bright near-white `specular` color → glossy highlight.
  - Color stays media-type-coded: video `#ff3b3b`, photo `#5ad7ff`, document `#ffc870` (existing tokens).
  - Video pins keep their existing pulsing ring.
  - Optional faint `emissive` on the head so pins stay visible on the dark side of the globe (tune; don't overdo it).
- **Needle** — the `customLayerData` object becomes a thin straight `CylinderGeometry` (small constant top/bottom radius ≈ 0.04; length spans from the surface up to roughly the head's altitude). `MeshPhongMaterial` in metallic grey (`color ≈ 0x9aa3ad`, high `shininess`, white `specular`) so it reads as a chrome pin shaft. Reuse the existing `customThreeObjectUpdate` to orient it radially (long axis pointing at the globe's center) with the **tip touching the surface** and the head end up near the bead.
- **Contact base** — optional small faint flat disc/ring (`CircleGeometry` or `RingGeometry`) co-located with the needle tip, low opacity, to suggest "stuck in". Polish only; cut if it looks muddy.
- **Regional vs. precise locations** — keep today's distinction (regional locations sit slightly higher / are slightly larger). Just carry the existing `regional` flag through to the new geometry's altitude/scale.
- Hover and click behavior, the camera fly-to-pin, the multi-record cycling — all unchanged; only the geometry/material of the marker changes.

### Files touched
- `src/components/GlobeApp.tsx` — the `<Globe>` `pointsData`/`pointRadius`/`pointAltitude` props for the head; the `customThreeObject` / `customThreeObjectUpdate` for the needle (+ optional base); possibly a small `makePushpin(record)` helper factory for testability.

---

## Part B — Hall of Fame overlay

### Trigger
A `★ HALL OF FAME` chip pinned to the **bottom-left** corner of `.globe-page`, sitting above the existing bottom dock, styled like the other HUD chips (`.chip` family in `global.css`). It is **always visible** — no first-load behavior, no `localStorage`. Clicking it opens the overlay. Clicking the chip again, pressing `Esc`, clicking the dark backdrop, or clicking the `✕` closes it.

### Overlay UI
- Full-viewport layer above the globe: a dark, slightly-blurred backdrop over the (still-rendering) globe.
- HUD header: `▣ HALL OF FAME · 10 RECORDS` (Orbitron, accent green, corner-bracket framing consistent with the rest of the site). A short subtitle line is allowed (e.g. `THE WILDEST FILES IN THE RELEASE`).
- A scroll-snap rail of 10 cards:
  - **Desktop / tablet:** horizontal rail, scroll-snap, each card ≈ 260–300 px wide. Arrow affordances optional.
  - **Mobile:** vertical scrolling list of full-width cards; a sticky `ENTER A FILE ↑` / close affordance at the bottom.
- Each card shows: the record thumbnail (`object-position: top center`, like `RecordCard.astro`), the media-type badge (existing `.type-badge` colors), the title, the year, **our one-line hook** (accent green, prominent), and the government blurb (truncated to ~2–3 lines, `-webkit-line-clamp`).
- Entrance animation: cards stagger-fade in on open (short, ~40–60 ms apart). Respect `prefers-reduced-motion`: when set, render instantly with no stagger.

### Interaction → opening a record
Clicking a card calls `window.dispatchEvent(new CustomEvent("open-record", { detail: { id } }))` and then closes the overlay. `GlobeApp` gains a listener for `open-record`:
- Look up the record by `id` in its `records` prop.
- If `record.hasLocation`, fly the globe to that pin (reuse the existing fly-to-pin logic / `pointOfView`), snapshotting the prior view first (same pattern the modal already uses for restore-on-close).
- Open the existing `RecordModal` for that record.
- If the record has no location (one of the 10 — the FBI `62-HQ-83894` case file — does not), skip the globe fly and just open the modal.

This keeps a single modal owner on the homepage (`GlobeApp`), mirroring how gallery pages use `GalleryModalRoot` + the `record-modal-open` event.

### Data
New committed file `src/data/featured.json` — an **ordered** array of `{ id, hook }`:

```json
[
  { "id": "western-us-event",
    "hook": "Seven federal employees, independently, reported orbs launching other orbs." },
  { "id": "usper-statement-about-uap-sighting",
    "hook": "A “super-hot” orb hovered over a military facility — then outran the helicopter chasing it, for 20 miles." },
  { "id": "nasa-uap-d3",
    "hook": "Astronauts Borman and Lovell radioed Houston about a “bogey” — the file even has handwritten notes titled “UFO Sighting by Borman.”" },
  { "id": "nasa-uap-d3a",
    "hook": "The actual air-to-ground audio: Frank Borman reporting his “bogey” to mission control, December 5, 1965." },
  { "id": "65-hs1-834228961-62-hq-83894-section-10",
    "hook": "The complete FBI flying-disc case file, 1947–1968 — incident accounts, photos from Oak Ridge, and proposals on UFO propulsion." },
  { "id": "state-department-uap-cable-2",
    "hook": "A 747 crew at 41,000 feet photographed a “bright light of enormous intensity” doing corkscrews and 90-degree turns — with contrails too high for any ordinary aircraft." },
  { "id": "fbi-september-2023-sighting-composite-sketch",
    "hook": "An FBI Lab sketch over a real site photo: a bronze, ellipsoid object “materializing out of a bright light” — then gone instantly." },
  { "id": "state-department-uap-cable-5",
    "hook": "Mexico’s Congress heard testimony on a law to formally acknowledge alien life — complete with “two alleged alien corpses.”" },
  { "id": "nasa-uap-vm6",
    "hook": "An Apollo 17 photo shows three dots in a triangular formation — new US analysis says it could be a “physical object in the scene.”" },
  { "id": "dow-uap-d33",
    "hook": "A UAP skimming just above the ocean, making multiple 90-degree turns at an estimated 80 mph." }
]
```

All 10 ids verified present in `src/data/records.json`. Every hook is drawn from the wording of that record's real `blurb` — no invented facts.

- `src/pages/index.astro` reads `featured.json` at build time, joins it against `records.json` by `id` (preserving order), and passes the resolved array (each entry = the full `Record` + its `hook`) to `<HallOfFameOverlay>`.
- `scripts/build-records.mjs` gains a **validation step at the end of its run**: load `featured.json`, assert it is a non-empty array, assert every `id` exists in the freshly-built `records.json`, assert every entry has a non-empty `hook` string. On failure, log the offending id(s) and `process.exit(1)` so the build fails loudly — the curated list cannot silently rot when a future release changes ids.
- At runtime, `HallOfFameOverlay` also defensively skips any entry whose record didn't resolve (belt-and-suspenders).

### Components / files touched
- **New:** `src/components/HallOfFameOverlay.tsx` — React island. Props: `featured: (Record & { hook: string })[]`. State: `open` (boolean). Listens for an `open-hall-of-fame` window event (fired by the chip) to open; handles `Esc` / backdrop / `✕` to close; renders the card rail; dispatches `open-record` on card click then closes; reduced-motion aware.
- `src/pages/index.astro` — import `featured.json`, build the resolved array, render `<HallOfFameOverlay client:only="react" featured={...} />` alongside `<GlobeApp>`; add the `★ HALL OF FAME` chip element + a tiny inline script (or reuse the existing click-delegation script) so clicking it dispatches `open-hall-of-fame`.
- `src/components/GlobeApp.tsx` — add the `open-record` event listener described above.
- `src/styles/global.css` (or a scoped `<style>` in the overlay) — overlay backdrop, header, card rail, card styling, mobile layout. Use existing theme tokens (`--color-hud`, `--color-vid/img/pdf`, `--font-display`, `--font-mono`, scanline/corner-bracket patterns).
- **New:** `src/data/featured.json` — the curated list above.

---

## Part C — Floating UFOs easter egg

### Behavior
- A small pool (~6–8) of UFO definitions, each tagged as `orb` or `saucer`. At any moment **at most 3 are visible** drifting in the Three.js scene around the globe.
- Each visible UFO has **randomized**: which pool entry it is, spawn position (random point on a sphere a bit larger than the globe, or off-screen edge), drift path (slow arc / orbit / wander), speed, altitude band, and lifetime (after which it fades out and a different one fades in elsewhere). The result should feel organic and never look scripted.
- They are **always present** (subject to the max-3 rule) — not gated behind a trigger — but subtle: small, semi-transparent, easy to miss unless you look.
- Hovering a UFO changes the cursor to a crosshair (`cursor: crosshair`) and gives it a faint highlight/scale-up so it's discoverable on hover.
- Clicking a UFO opens the **transmission modal** (below), pauses that UFO (or lets it drift), and does not interfere with globe drag/zoom (the click is consumed).

### Visuals
- **Orb:** a small glowing sphere — `MeshBasicMaterial` or emissive `MeshPhongMaterial` with an additive-blended halo sprite around it, gently pulsing opacity/scale. Colorway: pale cyan-white or faint green to match the HUD; avoid clashing with the media-type pin colors (so it doesn't look like a pin).
- **Saucer:** a tiny classic disc-with-dome — a flattened ellipsoid/cylinder body + a small hemisphere dome, `MeshPhongMaterial`, slowly rotating about its vertical axis, maybe a couple of tiny emissive "lights" on the rim. Kept small and low-poly — charming, not detailed.
- Both should have a subtle motion-trail or none (implementer's call; keep it cheap). Respect `prefers-reduced-motion`: reduce or stop the drifting/rotation/pulsing, but the UFOs may still appear (static) and remain clickable.
- Performance: this runs every frame inside the react-globe.gl scene — keep geometry low-poly, reuse materials, cap the count, and clean up disposed meshes (`geometry.dispose()` / `material.dispose()`).

### Transmission modal
- Triggered only by clicking a UFO. A distinct modal (not `RecordModal`) with an **animated UFO-themed border** (e.g. a slowly-rotating dashed/scanning ring, or a marquee of `▮ ▯` glyphs, or a CSS-animated glow) — clearly an easter egg, visually different from the record modal.
- Content: a randomly chosen **cryptic, eerie "transmission" fragment** from a pool of ~6–8 original strings. These are **flavor fiction, not data** — they are not presented as real intercepts, sightings, or records, and they contain no fabricated names/dates/metrics dressed up as fact. They read like degraded-signal text. Header line makes the framing obvious, e.g. `// SIGNAL INTERCEPT · UNAUTHENTICATED · ORIGIN UNKNOWN`.
- Starter pool (final wording can be tweaked during implementation; all original, all clearly fictional):
  - `…we have watched since before your records began… ▮▮▮ …the sky was never empty—`
  - `…you are looking in the wrong direction… ▮▮▮ …look down—`
  - `…the objects in your archive are not the interesting ones… ▮▮▮`
  - `…one hundred sixty-one files. you were handed the ones that explain nothing… ▮▮▮`
  - `…we left the orbs so you would have something to find… ▮▮▮`
  - `…do not adjust your instruments. the contact is real… ▮▮▮ …it always was—`
  - `…they were believed by no one… ▮▮▮ …you will be too—`
  - `…we are not arriving. we have not left. ▮▮▮ …check the dates—`
- Closes on `Esc` / backdrop / `✕`, like the other modals. Optional: a `[ DECRYPT ANOTHER ]` button that swaps in a different fragment.

### Components / files touched
- **New:** `src/components/FloatingUfos.tsx` — React component that, given the Three.js scene from react-globe.gl (via the globe ref / `scene()` accessor that `GlobeApp` already uses), spawns/animates/despawns the UFO meshes, manages the max-3 + randomization logic, handles raycast hover/click on the UFOs, and renders the transmission modal (or dispatches an `open-transmission` event that a small modal component listens for — implementer's call; keep the modal a separate, small component either way).
- `src/components/GlobeApp.tsx` — mount `FloatingUfos` and give it access to the globe instance/scene; ensure UFO raycasting doesn't fight globe controls.
- `src/styles/global.css` (or scoped) — transmission-modal styling + the animated UFO border.
- **New (optional):** `src/data/transmissions.ts` — the string pool, if it's cleaner to keep it out of the component.

---

## Testing

The repo currently has **no test framework**. The implementation plan's **first step** is to add **Vitest** (+ `@testing-library/react` and `jsdom` for the React-island logic) with a `test` script in `package.json`. Then:

- **`featured.json` integrity** (pure data test): the array is non-empty; every `id` resolves to a record in `records.json`; every entry has a non-empty `hook` string. (This duplicates the build-script guard at the unit level so a bad edit fails fast in `npm test`, not just in `npm run build`.)
- **`HallOfFameOverlay`**: starts closed (renders nothing / hidden); dispatching `open-hall-of-fame` opens it; `Esc` and backdrop click close it; clicking a card dispatches `open-record` with that card's `id` and then closes the overlay; with `prefers-reduced-motion` mocked, the stagger class is absent.
- **Pushpin factory** (if a `makePushpin(record)` helper exists): returns a mesh group with the expected children (needle + optional base) and the head sizing/altitude differs for `regional` vs. precise records.
- **FloatingUfos logic**: the spawn manager never exceeds 3 active UFOs; despawned UFOs are removed and their geometry/material disposed; clicking a UFO selects a transmission string from the pool; with `prefers-reduced-motion` mocked, animation updates are skipped (or reduced) but UFOs still mount and are clickable.
- Three.js rendering itself isn't unit-tested; logic is extracted into plain functions where practical so it can be tested without a WebGL context.

All three parts also get a **manual visual check** (dev server + Playwright screenshot) before each is reported done: pins look like pushpins on both lit and dark sides of the globe; Hall of Fame opens from the chip, scrolls, and a card opens the right record (with globe fly-to where applicable); UFOs drift, never exceed 3, change cursor on hover, and a click opens the transmission modal.

---

## Sequencing & delivery

1. **Part A (pushpins)** — own branch `feat/glossy-pushpins`, off `main`. Includes the Vitest setup (it's the first code change). Visual-verify, merge to `main`.
2. **Part B (Hall of Fame)** and **Part C (UFOs)** — branched off the updated `main`, developed in **parallel git worktrees** by separate agents. Part B touches `GlobeApp.tsx` (one event listener) and Part C touches `GlobeApp.tsx` (mounting `FloatingUfos`); the conflict surface is small and resolved at merge time. Merge B first (more contained), then C.
3. Each part: branch → implement (TDD where it applies) → `npm test` green → `npm run build` clean → visual check → update `CHANGELOG.md` + `README.md` in the same commit → PR → squash-merge → delete branch (per project + global git rules).
4. After all three land: refresh `docs/HANDOFF.md` (remove the now-done items, note what shipped).

## Out of scope
- AI-written hooks (hand-written from real blurbs only).
- A standalone `/findings` or `/hall-of-fame` page (overlay only).
- Per-record "why" essays beyond the one-line hook.
- Any change to the gallery pages, the data pipeline beyond the `featured.json` validation step, the globe controls beyond the new pin geometry, or the mobile globe experience.
- Persisting which UFOs/transmissions a user has seen; achievements for finding them all.
- Sound.
