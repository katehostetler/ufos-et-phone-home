# UFOs / ET Phone Home — Design Spec

**Date:** 2026-05-08
**Status:** Approved (verbal) — proceeding to build
**Source release:** [war.gov/UFO](https://www.war.gov/UFO/) "release_1" dated 5/8/26 (161 records)

## Goal

Take the gov's flat, table-based UFO doc release and turn it into a **cinematic, interactive archive** that makes the videos and photos the star, with a slick spy-movie aesthetic. Users land on a 3D rotating earth, see at a glance where every encounter happened (color-coded by media type), click a pin to see the full record details inline.

## Tone / aesthetic

Spy movie. Mission-control HUD. Dark theme with green-cyan accent (`#6affc8`), red for video/danger (`#ff3b3b`), cyan for photos (`#5ad7ff`), gold for documents (`#ffc870`). Orbitron for headlines, JetBrains Mono for body. Scan lines, corner brackets, live UTC clock, pulsing rings on video pins, "DECLASSIFIED · RELEASE_01" stamp.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Framework | **Astro** | Static-first, content-heavy; React islands for interactive bits |
| Interactive globe | **react-globe.gl** (Three.js) | Real 3D, drag-to-rotate, zoom, native point/ring/arc support |
| Styling | **Tailwind CSS** + custom CSS for HUD | Speed, consistent design tokens |
| PDF hosting | **Linked to war.gov** | Per Kate's call — no mirroring of the actual files |
| Asset hosting (thumbnails) | **Linked to war.gov** initially | Defer R2 mirror to Phase 2 |
| Search | **Pagefind** | Static index, no backend needed |
| Hosting | **Cloudflare Pages** | Generous free tier, GH-integrated CI |
| Repo | **Private GitHub repo** (`ufos-et-phone-home`) | Per Kate's global rule |

## Data flow

```
war.gov/Portals/.../uap-csv.csv
        │
        ▼
scripts/build-records.mjs   (run on every build)
   │  parse CSV
   │  geocode Incident Location strings:
   │    1. static lookup for known regions ("Middle East", "Indo-PACOM", ...)
   │    2. Nominatim API for unknown strings (cached in geocode-cache.json)
   │  enrich each record with:
   │    - lat, lng (or null if no location)
   │    - is_regional flag (for halo vs sharp pin)
   │    - media_type: vid|img|pdf
   │    - asset_url (war.gov)
   │    - thumbnail_url (war.gov)
   │  output:
   ▼
src/data/records.json   (committed to repo)
        │
        ▼
Astro pages read records.json at build time
```

`geocode-cache.json` is committed so we don't hit Nominatim repeatedly during dev. Re-running the build script picks up only new strings.

## Pages

| Route | Purpose |
|---|---|
| `/` | Globe homepage. Full-bleed 3D earth, pins colored by media type, filter chips for video/photo/doc + era. Click pin → record popup. |
| `/videos` | Grid of all 28 video records with DVIDS embedded players |
| `/photos` | Grid of all 14 photos with lightbox |
| `/files` | Searchable, sortable list of all 119 PDFs (Pagefind index) |
| `/no-location` | Gallery for the 47 records with `N/A` locations (mostly FBI Cold War files) |
| `/about` | Source attribution, methodology, geocoding notes |

## Record popup (the "click on a location" experience)

When a user clicks a globe pin:
1. Camera flies in (~1s ease)
2. Modal popup appears center-screen with:
   - **Hero media:** large thumbnail (PDF cover page) OR embedded DVIDS video player OR full image
   - **Title** in Orbitron
   - **Metadata strip:** agency · incident date · incident location · type
   - **Description blurb** (full ~150-word agency summary, scrollable if long)
   - **"VIEW SOURCE PDF →"** button → opens war.gov URL in new tab
   - **Paired-asset badge** if the record has both a video AND PDF (25% do)
3. **Multi-record locations** (e.g. Hormuz has 5): popup shows the first record with a `1 / 5` indicator and arrow keys / on-screen prev-next to cycle through.
4. `Esc` closes; clicking outside closes.

## Component breakdown

```
src/
  components/
    Hud.astro              # corner brackets, scan lines, top header, classified stamp
    FilterBar.astro        # filter chips (vid/img/pdf, era)
    Globe.tsx              # react-globe.gl island; receives geocoded points; emits onPinClick
    RecordModal.tsx        # the popup with carousel
    RecordCard.tsx         # used in /videos /photos /files lists
    Legend.astro           # bottom-left legend
    Dock.astro             # bottom dock with media-type counts
  data/
    records.json           # built artifact
    geocode-cache.json     # geocoding memoization
  pages/
    index.astro            # globe homepage
    videos.astro
    photos.astro
    files.astro
    no-location.astro
    about.astro
  layouts/
    Base.astro             # global HUD frame, fonts, scan-line overlay
  scripts/
    build-records.mjs      # data pipeline
```

## Phasing

**Phase 1 (this sprint — ~weekend-scoped):**
- Scaffold + data pipeline + globe homepage + record modal
- All 4 list pages (videos / photos / files / no-location)
- GitHub repo + Cloudflare deploy
- Ship as-is — uses only the gov's pre-written blurbs

**Phase 2 (later):**
- AI summaries (Claude API) on top of each record
- "Most interesting findings" hero curation
- Full-text search across PDF contents (requires actually downloading & OCR'ing the PDFs)
- Mirror PDFs to R2 for resilience
- "Pair view" detail page that shows PDF + video + transcript side-by-side
- Newsletter / RSS for new release drops

## Risks / open issues

1. **Geocoding ambiguity:** "Middle East" / "Indo-PACOM" are regions. Static lookup table (committed to repo) maps them to a centroid + `is_regional: true` flag → render as halo, not pin.
2. **war.gov bot protection:** the CSV requires browser-like headers to fetch (Akamai). Build script will use a proper UA + Referer to avoid 403.
3. **DVIDS embed reliability:** DVIDS may have CSP/embed restrictions. Fallback: link out to DVIDS player rather than embed if iframe fails.
4. **Future releases:** schema may shift in `release_2`. Build script designed to be re-run; CSV columns are stable enough that minor additions won't break it.
5. **Apollo / orbital records (3 NASA entries):** not real lat/lon. Decision: pin them at a stylized "space" marker on the globe (lat 0, lng -30/+30) with a special icon, OR exclude from globe and surface only on `/videos`. Phase 1: stylized marker. Revisit if it looks weird.

## Out of scope (Phase 1)

- User accounts / favorites
- Comments / community input
- AI chat over the corpus
- PDF OCR / full-text indexing
- R2 mirror of the PDFs
- Mobile-optimized globe (desktop-first; mobile gets a fallback gallery view)
