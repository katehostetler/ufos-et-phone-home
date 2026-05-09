# Handoff — UFOs / ET Phone Home

Pick-up doc after context clear. Last updated 2026-05-08 (evening — homepage polish session).

## What this is

Spy-movie-styled archive of the war.gov 5/8/26 UAP release. 3D rotating globe homepage with colored pins per record, click-through to inline video / photo / PDF preview. Built from scratch in this repo.

- **Repo:** https://github.com/katehostetler/ufos-et-phone-home (private)
- **Prod URL:** `et-phone-home.pages.dev` (Cloudflare Pages, auto-deploys on push to `main`)
- **Stack:** Astro 6 + React 19 + Tailwind 4 + react-globe.gl (Three.js) + Pagefind (eventual)
- **Source data:** `data/uap-csv.csv` cached from war.gov; build script geocodes + scrapes thumbnails/MP4s

## Current state of `main`

Working tree clean, in sync with origin. The 5/8/26 evening session shipped a big polish pass:

1. **Vitest + Testing Library** set up (project's first test framework). 49 tests across 6 files: pushpin factory, smoke, featured.json + resolver, HallOfFameOverlay behavior, ufos pool/spawn manager, TransmissionModal.
2. **Glossy 3D pushpin markers** — replaces the old cone "column" pins. `src/lib/pushpin.ts` builds a `THREE.Group` with a thin chrome needle + glossy media-coloured bead; positioned via `customLayerData` so three-globe doesn't auto-stretch the bead. Invisible `pointsData` keeps native hover/click. Touch devices get a fatter bead and longer needle.
3. **City-light twinkle** — `src/lib/globeShimmer.ts` patches the globe material's fragment shader to per-cell modulate only the bright (lit) pixels of the night-earth texture. Lights flicker, dark land/ocean stays still. Driven by a RAF loop on a uTime uniform; cleaned up on unmount; respects `prefers-reduced-motion`.
4. **Hall of Fame chip + overlay** — `★ HALL OF FAME` chip pinned bottom-left of the globe page; click → cinematic overlay with 10 hand-curated wildest records (`src/data/featured.json` + `src/lib/featured.ts` resolver). `scripts/build-records.mjs` validates the list at the end of every data build (unknown ids or empty hooks fail the build). Card click dispatches `open-record` → `GlobeApp` flies the globe and opens `RecordModal`. New `HallOfFameOverlay.tsx`.
5. **Floating UFOs easter egg** — `FloatingUfos.tsx` injects 3 (capped) low-poly UFOs (mix of glowing orbs + tiny saucers) into the globe scene with randomized drift / position / lifetime. `src/lib/ufos.ts` owns the pool + spawn manager + 8 cryptic *fictional* transmission fragments. Click a UFO → `TransmissionModal.tsx` (animated rotating-conic ring border + decode shimmer). Reduced-motion respected.
6. **Glowy purple HUD title** — `UFOS / ET PHONE HOME` is now violet (`#d4b3ff`) with a layered text-shadow glow on desktop AND mobile (was previously hidden on mobile).
7. **HUD cleanup** — dropped the BROWSE mini-nav from the top bar (duplicated the bottom dock); kept only `ⓘ ABOUT`. Top stamp simplified to `DECLASSIFIED · RELEASE_01` (count lives in the right-side ticker). Desktop `PIN = MEDIA` legend removed. Bottom dock vid/img/pdf chips became icon-only (`▶ ⊡ ▤`); `LOCATION UNKNOWN` chip kept its full text/count.
8. **Universal back-to-context affordances** — `RecordModal` accepts `closeLabel`; says BACK TO GLOBE on the homepage, BACK TO GALLERY on gallery pages, CLOSE elsewhere. `QueuePanel` close button now reads `✕ BACK TO GLOBE`. `PageLayout` shows a green `← BACK TO GLOBE` button above each gallery page title.
9. **Mobile gallery polish** — sticky-pinned action bar (so the red `OPEN ON DVIDS →` doesn't float over content); mobile-stamp matched to desktop stamp; touch-aware instruction banner (`PINCH TO ZOOM` instead of `SCROLL TO ZOOM`).
10. **Better TTS voice** — rewrote voice selection to prefer Google Chrome cloud voices, then Microsoft Online Natural, then Apple Premium/Enhanced/Neural, then named macOS voices. Wait for `voiceschanged` event when initial voices array is empty. Reset rate/pitch from 0.95/0.92 → 1.0/1.0 (the slowdown was making good voices sound worse).
11. **QueuePanel layout fix** — pinned `.queue` to `grid-template-columns: minmax(0, 1fr)` + min-width:0 cascade so the info pane (with the `OPEN ON DVIDS` button) no longer overflows off-screen on desktop.

## Architecture quick map

```
data/
  uap-csv.csv            # cached war.gov manifest (161 records)
  location-lookup.json   # static geocoding for 36 unique location strings
  geocode-cache.json     # nominatim cache (currently unused — static lookup covers all)
  dvids-thumbs.json      # DVIDS video thumbnail URL cache
  dvids-mp4s.json        # DVIDS MP4 src URL cache (for inline player)
public/thumbnails/       # 147 mirrored war.gov thumbnails (43 MB) — mirrors needed because Akamai blocks hotlinking
scripts/
  build-records.mjs      # data pipeline: CSV → geocode → mirror thumbs → scrape MP4s → src/data/records.json
src/
  data/records.json      # built artifact, committed
  types/record.ts        # Record interface
  components/
    GlobeApp.tsx         # main React island — globe + pins + modal + queue + touch preview + state
    RecordModal.tsx      # popup with hero (video/photo/PDF), TTS button, blurb, actions
    QueuePanel.tsx       # full-screen-ish coverflow when dock chip clicked on homepage
    GalleryModalRoot.tsx # React island in PageLayout — listens for `record-modal-open` event from card clicks
    Hud.astro            # top header with logo + nav + classified stamp + UTC clock
    Legend.astro         # pin-color legend (top-left, hidden on mobile)
    Ticker.astro         # "TRACKING · 161 RECORDS" (top-right, hidden on mobile)
    RecordCard.astro     # gallery tile (used by /videos /photos /files /no-location)
  layouts/
    Base.astro           # global wrapper: fonts, scanlines, corner brackets
    PageLayout.astro     # gallery-page wrapper: Hud + page header + GalleryModalRoot + click delegate
  pages/
    index.astro          # globe homepage with dock + filter chips + GlobeApp island
    videos.astro         # grid of all 28 video records
    photos.astro         # grid of all 14 image records
    files.astro          # grid of all 119 doc records
    no-location.astro    # grid of 47 records with no location
    about.astro          # source attribution + methodology
  styles/global.css      # tailwind import + theme tokens + HUD CSS + media-type chip styles + starfield
```

## Common commands

```bash
npm run build:data       # rebuild records.json (refetches CSV from war.gov, scrapes new DVIDS data, mirrors new thumbs)
npm run dev              # Astro dev server at localhost:4321
npm run build            # production build → dist/
```

Cloudflare Pages settings: production branch `main`, build command `npm run build`, output directory `dist`. Auto-deploys on push.

## Backlog

1. **Hover tooltip rendering** — pin hover tooltips still don't show reliably on desktop. `.float-tooltip-kap` z-index issue inside `.scene-container`. (Was already in backlog before this session — not addressed.)
2. **Even better TTS** — current rewrite prefers Google Chrome cloud voices, but on Safari / mobile the available voices are still mediocre. Real upgrade path is ElevenLabs free tier (10k chars/month) via a Cloudflare Pages Function endpoint — needs an API key in environment, plus a backend route. ~2-hour task.
3. **Voice picker UI** — let the user choose between detected voices (`speechSynthesis.getVoices()` returns many) instead of always auto-picking. Tiny dropdown next to the LISTEN button.
4. **Phase 2 enrichment (deferred from original spec):**
   - AI summaries via Claude API (per-record, on top of the gov blurbs)
   - Full-text search across PDF contents (requires actually downloading + OCR)
   - Mirror PDFs to R2 for resilience
   - RSS / newsletter for new release drops
5. **A11y pass** — verify keyboard nav across every modal; verify all buttons have aria-labels; check focus traps on overlays.

## Known design decisions / gotchas

- **PDFs are NOT mirrored** — clicking "VIEW SOURCE PDF →" sends the user to war.gov. Per Kate's call. Only thumbnails are mirrored locally (Akamai 403s without proper session headers).
- **DVIDS MP4 scraping** is brittle — relies on regex against `<source src="...mp4">` in DVIDS's HTML. If they change their player, re-scrape with a different pattern. Current cache covers all 28 videos.
- **War.gov fetches need browser-faithful headers** — see `scripts/build-records.mjs`. CSV + thumbnail downloads use a cookie-jar establishment via curl.
- **Geocoding is fully static** — the lookup table in `data/location-lookup.json` covers all 36 unique location strings in the current dataset. If `release_2` adds new locations, the build will skip them and log a warning; add them to the lookup manually.
- **`/no-location` URL stays** even though the displayed label is "LOCATION UNKNOWN" — don't rename the route, only the visible labels were updated.
- **Touch detection** uses `window.matchMedia('(pointer: coarse)')`. On touch devices: pin tap radius is 1.6× larger, single-tap shows preview tooltip, double-tap opens modal, and globe.gl's hover label is suppressed (only the custom touch preview shows).
- **Globe view preservation** — the `RecordModal`'s onClose restores the previous globe pointOfView (snapshotted before flying to a pin). The QueuePanel does the same.
- **Pin shape** — `pointsData` (sphere head, hover/click) + `customLayerData` (tapered cone body underneath, MeshPhongMaterial, decoration only). Don't switch to all-customLayer — that broke pin visibility in testing.

## Files I might want to read next session

- `src/components/GlobeApp.tsx` — biggest file (~460 lines), owns the globe interactivity, pin geometry hookup, modal owner on the homepage, listens for `open-record` and `open-queue` events
- `src/components/QueuePanel.tsx` — the in-place coverflow media browser
- `src/components/HallOfFameOverlay.tsx` — the chip-triggered featured-records overlay
- `src/components/FloatingUfos.tsx` + `src/lib/ufos.ts` — UFO easter egg + spawn manager + transmissions pool
- `src/lib/pushpin.ts` + `src/lib/globeShimmer.ts` — pin geometry factory + city-light shader patch
- `src/data/featured.json` — curated 10-record list with hooks (validated at build time)
- `scripts/build-records.mjs` — data pipeline + featured.json validation step
- `docs/superpowers/specs/2026-05-08-homepage-polish-design.md` — spec for this session's work
- `docs/superpowers/plans/2026-05-08-homepage-polish.md` — implementation plan for this session's work
- `docs/superpowers/specs/2026-05-08-ufo-archive-design.md` — original archive design spec
- `docs/DEPLOY.md` — Cloudflare Pages connect/build settings

## How to resume

1. `cd ~/projects/ufos-et-phone-home`
2. `claude` (this folder)
3. "Read docs/HANDOFF.md and tell me where we left off"
4. Pick a backlog item (UFOs / hover tooltip / Phase 2)
