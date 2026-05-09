# Handoff — UFOs / ET Phone Home

Pick-up doc after context clear. Last updated 2026-05-08.

## What this is

Spy-movie-styled archive of the war.gov 5/8/26 UAP release. 3D rotating globe homepage with colored pins per record, click-through to inline video / photo / PDF preview. Built from scratch in this repo.

- **Repo:** https://github.com/katehostetler/ufos-et-phone-home (private)
- **Prod URL:** `et-phone-home.pages.dev` (Cloudflare Pages, auto-deploys on push to `main`)
- **Stack:** Astro 6 + React 19 + Tailwind 4 + react-globe.gl (Three.js) + Pagefind (eventual)
- **Source data:** `data/uap-csv.csv` cached from war.gov; build script geocodes + scrapes thumbnails/MP4s

## Current state of `main`

Working tree clean, in sync with origin. Last 4 merged feature branches:

1. `feat/brighter-globe-and-stars` — earth brightness + 3D starfield
2. `feat/queue-tts-inline-video` — queue/coverflow browser + inline DVIDS video + TTS button + mobile tap targets + gallery cards open modal
3. `feat/3d-pins-tap-preview` — first version of 3D pins, single-tap-preview/double-tap-open
4. `feat/proper-pins-and-labels` — proper map-pin shape (cone + sphere head with phong shading), FILTER/GALLERY labels, mobile DECLASSIFIED chip, "BACK TO GLOBE" button, globe view preservation

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

## Backlog (in order I'd tackle them)

1. **🛸 Floating UFOs + alien transmission modal** — Easter egg. 3-5 hovering UFO sprites in the Three.js scene around the globe. Click → opens a special modal with a "transmission decoded" cryptic blurb + animated UFO border. Spec: see `docs/superpowers/specs/2026-05-08-ufo-archive-design.md` Phase 2.
2. **Hover tooltip rendering** — Kate reported hover labels still not showing reliably on desktop after the fix. Likely a stacking-context issue with `.float-tooltip-kap` inside `.scene-container` (z-index 1) — needs investigation. The tooltip element exists with z-index 100, just not visible when hovering. Reproduce by hovering a pin on the live site.
3. **Phase 2 enrichment (deferred from spec):**
   - AI summaries via Claude API (per-record, on top of the gov blurbs)
   - "Most interesting findings" curated hero on homepage
   - Full-text search across PDF contents (requires actually downloading + OCR)
   - Mirror PDFs to R2 for resilience
   - RSS / newsletter for new release drops

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

- `src/components/GlobeApp.tsx` — biggest file (~470 lines), owns most of the homepage interactivity
- `src/components/QueuePanel.tsx` — the in-place media browser
- `scripts/build-records.mjs` — data pipeline, has all the war.gov / DVIDS scraping logic
- `docs/superpowers/specs/2026-05-08-ufo-archive-design.md` — original design spec, Phase 2 ideas
- `docs/DEPLOY.md` — Cloudflare Pages connect/build settings

## How to resume

1. `cd ~/projects/ufos-et-phone-home`
2. `claude` (this folder)
3. "Read docs/HANDOFF.md and tell me where we left off"
4. Pick a backlog item (UFOs / hover tooltip / Phase 2)
