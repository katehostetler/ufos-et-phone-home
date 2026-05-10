# UFOs / ET Phone Home

*An unauthorized, suspiciously well-designed archive of the documents Your Government™ would like you to glance at and then move on from.*

Live at **[et-phone-home.pages.dev](https://et-phone-home.pages.dev)**.

---

## What is this

In May 2026 the U.S. Department of War dropped a folder of 161 declassified UFO/UAP records onto `war.gov` — a CSV manifest, a pile of PDFs, some Navy infrared footage, a handful of Apollo-era photos, and a stack of FBI Cold War files that mostly say "we don't know either." Decades of fighter pilots, ship crews, and Apollo astronauts going *"...are you seeing this too?"* into a hot mic — orbs that launch other orbs, a "super-hot" sphere that outran the helicopter sent to chase it, an astronaut's margin note in someone's actual handwriting titled *"UFO Sighting by Borman"* — and the official takeaway is still, essentially, a polite shrug. Make of that what you will. We did.

I wanted to see a more visual version of all this — *okay, but where are the sightings?* — so I built one.

It's a rotating 3D Earth. Pins are colour-coded by file type (red = video, cyan = photo, gold = document). Click a pin — the camera flies in, a panel slides out, you read the report, you decide for yourself. There's a `★ HALL OF FAME` chip for the ten genuinely unhinged ones — Mexico's Congress hearing testimony about "two alleged alien corpses"; an FBI Lab sketch of a bronze ellipsoid "materializing out of a bright light"; a 747 crew at 41,000 feet photographing something doing corkscrews and 90-degree turns. The Apollo records live on an actual little Moon orbiting the Earth, because putting a pin for a lunar photo in the middle of the Atlantic was, frankly, embarrassing.

And yes, occasionally a small silver flying saucer drifts past. If you put your cursor near it, it leaves. We don't make the rules.

Everything links back to the original government URLs. Nothing is altered. We just gave it a budget.

---

## Running it locally

```bash
npm install
npm run build:data   # pulls the war.gov CSV, geocodes the locations, mirrors thumbnails (~1 min first run)
npm run dev          # http://localhost:4321
npm test             # vitest — pure logic + component behaviour
npm run build        # production build (re-runs build:data first)
```

The data pipeline is idempotent: re-running only fetches *new* records and *new* thumbnails. The CSV cache lives at `data/uap-csv.csv` — delete it to force a fresh pull. (Thumbnails are mirrored locally because Akamai 403s anyone who tries to hotlink them, which is its own kind of cover-up.)

Deployed via Cloudflare Pages — pushes to `main` auto-build and ship. The `LISTEN`-aloud feature uses ElevenLabs if an `ELEVENLABS_API_KEY` is set in the Pages environment, and quietly falls back to the browser's built-in robot voice if not.

---

## How it works (the boring true part)

```
war.gov CSV manifest
        │
        ▼
scripts/build-records.mjs   ──  parses the CSV, geocodes "Incident Location" strings
        │                       (static lookup table — all 36 distinct strings covered),
        │                       scrapes DVIDS for video thumbnails + MP4 URLs,
        │                       mirrors war.gov thumbnails into public/thumbnails/
        ▼
src/data/records.json   (committed; the build refuses to ship if a featured-record id has gone missing)
        │
        ▼
Astro + React + react-globe.gl (Three.js) + Tailwind  →  static site
```

## Project structure

```
ufos-et-phone-home/
├── data/                    # build-time inputs: CSV, geocode lookups, DVIDS caches
├── public/
│   ├── thumbnails/          # mirrored war.gov thumbnails
│   └── textures/            # earth-night + moon textures
├── scripts/build-records.mjs# the data pipeline
├── functions/api/tts.js     # Cloudflare Pages Function — ElevenLabs TTS proxy
├── src/
│   ├── components/          # GlobeApp, RecordModal, QueuePanel, PinRail, HallOfFameOverlay,
│   │                        # FloatingUfos, LunarMoon, TransmissionModal, Hud, RecordCard, …
│   ├── lib/                 # pushpin geometry, city-light shimmer shader, ufo pool, featured.json resolver
│   ├── data/                # generated records.json + curated featured.json
│   ├── layouts/             # Base, PageLayout
│   ├── pages/               # /, /gallery, /videos, /photos, /files, /no-location, /about
│   ├── styles/global.css
│   └── types/record.ts
├── tests/                   # vitest
└── docs/superpowers/        # design specs + implementation plans + handoff notes
```

---

## License

The **code** in this repo is [MIT licensed](./LICENSE) — copy it, fork it, build something weirder.

The **documents, photos, and footage** are works of the U.S. federal government (war.gov, DVIDS, NASA) and are in the public domain; this project is just a viewer. Source PDFs and full-resolution files link back to the original government URLs and aren't mirrored here.

Built by [Kate](https://withkate.ai). Government data courtesy of [war.gov/UFO](https://www.war.gov/UFO/). Believing is optional but encouraged.
