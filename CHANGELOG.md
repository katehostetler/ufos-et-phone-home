# Changelog

All notable changes to the ufos-et-phone-home project will be documented in this file.

---

## 2026-05-09

### Changed
- Floating UFOs easter egg: redesigned the craft so the silhouettes actually read as spaceships. Removed the abstract glowing "orb" kind entirely — at small scale it read as a smudge, not a craft. The pool is now a curated mix of two iconic shapes: a **classic flying saucer** (thin disc + prominent half-sphere dome + ring of 8 emissive rim lights + a small underbelly down-light) and a **Navy-style tic-tac** (smooth elongated capsule with a faint additive halo). Both are matte-pale to stay off the pin palette.
- Floating UFOs sized down ~50% (saucer body 5.5 → 3.0 units across, tic-tac ~4.5 units long) so they feel like distant craft rather than dominating the scene.
- Floating UFOs are now noticeably rarer: hard cap dropped from 3 concurrent → **1 at a time**, and the spawn-attempt interval went from 4s → **12s**, so most of the time you'll see 0 or 1 craft. Lifespans tightened to 12-16s so each sighting is a brief moment, not a constant presence.
- Tic-tacs drift faster than saucers (5.5-6 deg/s vs 2.8-3.2) and gently wobble instead of spinning — keeps them feeling distinct from the saucers.
- Updated `tests/ufos.test.ts` for the new pool: asserts both `saucer` and `tictac` kinds exist, dropped the orb assertion, lowered the minimum-pool-size floor (≥4).

---

## 2026-05-08

### Added
- Initialized project with git
- Created project-level `CLAUDE.md` with project-specific rules
- Created `CHANGELOG.md` for tracking all changes
- Created `README.md` with project overview and structure
- Wrote design spec at `docs/superpowers/specs/2026-05-08-ufo-archive-design.md` covering the architecture for a globe-based, spy-movie-aesthetic UFO archive over the war.gov 5/8/26 release (161 records)
- Created interactive prototypes in `.superpowers/brainstorm/` (mockups for homepage concepts, colored-pins variant, fully interactive globe demo with real `globe.gl`)
- Scaffolded Astro 6 + React 19 + Tailwind 4 app
- Wrote `scripts/build-records.mjs` data pipeline: pulls war.gov CSV, geocodes Incident Locations via static lookup table, scrapes DVIDS thumbnails for video records, mirrors war.gov thumbnails locally to `public/thumbnails/` (Akamai blocks hotlinking), outputs `src/data/records.json`
- Built homepage with interactive 3D globe (`react-globe.gl`) — pins colored by media type, pulsing rings on videos, click pin to open record modal with video/photo/PDF preview, paired-PDF detection, auto-rotate, ESC to close
- Built `/videos`, `/photos`, `/files`, `/no-location`, `/about` gallery pages with thumbnail grids
- Added HUD chrome: corner brackets, scan lines, classified stamp, live UTC clock, tracking ticker, legend, dock
- Mobile-responsive sweep across all components (≤768px) + tablet (≤1024px); globe touch interaction works via OrbitControls
- Modal video sizing: hero capped at min(50vh, 480px) so blurb stays in view on tall windows; full-screen modal on mobile
- Set up Vitest + @testing-library/react + jsdom for the project's first test framework; added `test` / `test:watch` scripts
- Reworked globe pins as glossy 3D pushpins: a thin chrome needle (cylinder) topped by a glossy, media-type-coloured bead (sphere) — replaces the previous tapered cone "column" pins. Built as a `customLayerData` THREE.Group so three-globe doesn't auto-stretch the head; an invisible `pointsData` hit-target preserves native hover/click. Regional locations get a larger bead; touch devices get a fatter bead and longer needle for tap targets
- Subtle city-light twinkle on the night-earth texture: `src/lib/globeShimmer.ts` patches the globe material's fragment shader to per-cell-modulate only the bright (lit) pixels by a small amount over time. Lights flicker; dark land/ocean is untouched. Respects `prefers-reduced-motion` (skipped entirely if the user has it set)
- Hall of Fame chip + overlay: `★ HALL OF FAME` chip pinned to the bottom-left of the globe page; clicking it opens an overlay (cinematic dark backdrop over a blurred globe, HUD header, scroll-snap rail of 10 cards on desktop / vertical list on mobile). Each card shows the thumbnail, type badge, title, year, our one-line hook (accent green) and a clamped 3-line gov blurb. Card click dispatches `open-record` → `GlobeApp` flies the globe to the pin (if it has a location) and opens the existing `RecordModal`. `Esc`/backdrop/`✕` close. Reduced-motion-aware stagger animation
- Featured list: `src/data/featured.json` — ordered 10-entry curated list of the wildest records (Western US Event, USPER orb, Gemini 7 transcript + audio, FBI 62-HQ-83894, Kazakhstan State Dept cable, FBI 2023 composite sketch, Mexico State Dept cable, Apollo 17 photo, DOW-UAP-D33 Greece). Hooks drawn verbatim from each record's gov blurb. `src/lib/featured.ts` resolves the list against `records.json` at build time. `scripts/build-records.mjs` validates the list at the end of every data build — unknown ids or empty hooks fail the build loudly
- Floating UFOs easter egg: `src/components/FloatingUfos.tsx` injects a small group of low-poly Three.js UFOs (mix of glowing orbs and tiny saucers) into the globe scene. Hard cap of 3 visible at any moment; randomized spawn position / drift / lifetime per `src/lib/ufos.ts`. Hover shows a crosshair cursor + a slight grow; click opens `TransmissionModal` with one of 8 cryptic, eerie *fictional* transmission fragments (`TRANSMISSIONS` pool, clearly framed as flavor text — not data). Animated rotating-conic UFO border + decode shimmer on the modal. Respects `prefers-reduced-motion` (UFOs still render, just static)
- Glowy purple HUD title: `UFOS / ET PHONE HOME` is now violet with a layered text-shadow glow on desktop and mobile. Mobile no longer hides the `/ ET PHONE HOME` subtitle
- HUD cleanup: dropped the `BROWSE` mini-nav from the top bar (it duplicated the bottom dock); kept only the `ⓘ ABOUT` link. Top-right stamp simplified to `DECLASSIFIED · RELEASE_01` (the record count already lives in the right-side `TRACKING · 161 RECORDS` ticker, no need to repeat). Removed the desktop `PIN = MEDIA` legend (pin colors are self-evident with the dock chips). Bottom-dock vid/img/pdf chips became icon-only (`▶` / `⊡` / `▤`) — counts moved into hover tooltips / aria-labels. `LOCATION UNKNOWN` chip kept its full text/count
