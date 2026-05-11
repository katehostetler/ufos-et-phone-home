# UFOs / ET Phone Home

An interactive archive of the 161 declassified UFO/UAP records the U.S. Department of War released on war.gov in May 2026, plotted onto a rotating 3D globe.

**Live: [et-phone-home.pages.dev](https://et-phone-home.pages.dev)**

## What it is

The war.gov release is a CSV manifest plus a stack of FBI Cold War files, Navy infrared footage, Apollo-era photos, and military mission reports. This site plots the records that have a known location as pins on a 3D Earth — colour-coded by file type (red = video, cyan = photo, violet = document) — and clicking a pin flies the camera in and opens the report (PDFs embed and page through inline). The Apollo records sit on a small Moon orbiting the Earth. The ~47 records with no location given have their own page. There's a "Hall of Fame" of the ten strangest, and every record is browsable by type. Each one links back to its original war.gov URL; nothing is altered.

## Run it locally

```bash
npm install
npm run build:data   # builds src/data/records.json from the cached CSV (~1 min first run; mirrors thumbnails)
npm run dev          # http://localhost:4321
npm test             # vitest
npm run build        # production build
```

The archive is pinned to the May 2026 release (161 records) — every build reads the cached `data/uap-csv.csv`. To pull a fresh copy from war.gov and review the diff: `WARGOV_REFRESH=1 npm run build:data` (the build warns if the record count changes).

Deployed on Cloudflare Pages — pushes to `main` build and ship automatically. The "Listen" feature uses ElevenLabs if `ELEVENLABS_API_KEY` is set in the Pages environment, otherwise the browser's built-in speech synthesis.

## Stack

Astro + React + [`react-globe.gl`](https://github.com/vasturiano/react-globe.gl) (Three.js) + Tailwind. `scripts/build-records.mjs` parses the war.gov CSV, geocodes the "Incident Location" strings via a static lookup table, scrapes DVIDS for video thumbnails/MP4s, and mirrors war.gov thumbnails into `public/thumbnails/`. The output is `src/data/records.json`; `src/data/featured.json` is the curated Hall of Fame (the build fails if it references a record that no longer exists).

```
data/                      build-time inputs (CSV, geocode lookups, DVIDS caches)
public/thumbnails/         mirrored war.gov thumbnails
public/textures/           earth + moon textures
scripts/build-records.mjs  the data pipeline
functions/api/tts.js       Cloudflare Pages Function — ElevenLabs TTS proxy
src/components/            GlobeApp, RecordModal, HallOfFameOverlay, GalleryFilter, FloatingUfos, LunarMoon, …
src/lib/                   pushpin geometry, city-light shimmer shader, ufo pool, gallery-filter + bottom-sheet logic
src/data/                  records.json (generated) + featured.json (curated)
src/pages/                 /, /gallery, /videos, /photos, /files, /no-location, /about
tests/                     vitest
```

## License

The **code** in this repo is [MIT licensed](./LICENSE). The **documents, photos, and footage** are works of the U.S. federal government (war.gov, DVIDS, NASA) and are in the public domain — this project is just a viewer, and source files link back to the original government URLs.

Built by [Kate](https://withkate.ai). Data from [war.gov/UFO](https://www.war.gov/UFO/).
