# Changelog

All notable changes to the ufos-et-phone-home project will be documented in this file.

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
