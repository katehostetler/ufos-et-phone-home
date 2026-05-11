# Handoff — UFOs / ET Phone Home

Pick-up doc after context clear. Last updated 2026-05-09 (long polish/iteration session; + a perf pass on the globe).

## What this is

Spy-movie-styled archive of the war.gov 5/8/26 UAP release. 3D rotating globe homepage with colored pins per record, click-through to inline video / photo / PDF preview. Built from scratch in this repo.

- **Repo:** https://github.com/katehostetler/ufos-et-phone-home — **PUBLIC** (MIT licensed; Kate explicitly chose to make it public despite the "private by default" CLAUDE.md rule)
- **Prod URL:** `et-phone-home.pages.dev` (Cloudflare Pages, auto-deploys on push to `main`; builds take ~2–4 min because the build re-fetches the war.gov CSV)
- **Stack:** Astro 6 + React 19 + Tailwind 4 + react-globe.gl (Three.js) + Vitest. Pages Functions for `/api/tts`.
- **Source data:** `data/uap-csv.csv` cached from war.gov; `scripts/build-records.mjs` geocodes + scrapes thumbnails/MP4s + validates `featured.json`. Build deps: `node scripts/build-records.mjs && astro build`.
- **Working notes from this session:** Kate runs this fast/continuous-deploy; she gives a stream of small UI tweaks, tests on her iPhone against prod (not localhost — localhost from her phone never works; the LAN dev URL `npm run dev -- --host` does). She wants UI things eyeball-verified, not just diff-checked. The HUD palette is green-cyan; "ET PHONE HOME" + Hall of Fame are purple (`--color-hof: #d4b3ff`); UFOs are dark silver.

## 2026-05-09 — perf pass (globe FPS + load; user reported it ran slow)

- **Pixel-ratio cap** — `GlobeApp.tsx`, right after `const renderer = (globeRef.current as any).renderer?.()`: `renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.5))`. Biggest FPS win on Retina/4K (was rendering DPR² pixels). If the globe ever looks soft to someone, that's the knob (1.5 → 2).
- **`document.hidden` guards on every RAF** — `globeShimmer.ts` loop, `FloatingUfos.tsx` `frame()`, `LunarMoon.tsx` `frame()` all early-return when the tab is hidden (dt timers rebased on return so no jump). Plus `GlobeApp.tsx` adds a `visibilitychange` listener that flips `controls.autoRotate` off while hidden and restores it.
- **Three.js code-split** — `astro.config.mjs` `vite.build.rollupOptions.output.manualChunks` → `three`/`three-globe`/`react-globe.gl`/`kapsule`/`d3-*`/`topojson-*`/`@tweenjs` go in a `three-globe-[hash].js` chunk. `GlobeApp` chunk: **1.85 MB → 45 KB** + a separate ~1.81 MB Three chunk (module-preloaded on the homepage only). Gallery pages stay three-free (verified in `dist/`).
- **Misc cheap trims** — globe pins `pointResolution` `12 → 6` (invisible hit cylinders); starfield `~3300 → ~2200` points; `prefetch:{prefetchAll:true,defaultStrategy:'hover'}` + `compressHTML:true` in `astro.config.mjs`.
- **Found, not done:** `bumpImageUrl` on `<Globe>` still points at `https://unpkg.com/three-globe@2.27.2/example/img/earth-topology.png` — a ~200 KB cross-origin PNG fetched on the heaviest page. Worth vendoring to `public/textures/earth-topology.png` (couldn't `curl` it from this sandboxed env) or dropping (relief is subtle on the night texture). It's a one-time load, not a per-frame cost, so it wasn't blocking the FPS complaint. Also: with `prefers-reduced-motion`, UFOs are static but the RAF still repositions them each frame (`getCoords`+`lookAt`+`rotateX` ×≤4) — negligible, left alone to keep the diff minimal (spawn-manager logic is owned by another dev).

## 2026-05-09 — even later (globe look, starfield, UFOs ≥2, HUD polish)

- **Moon-saucer** (`LunarMoon.tsx` `makeMoonSaucer` + the `frame` loop) — a tiny silver saucer on a tilted pivot orbiting the Moon (period 22s). Super-evasive: in `frame` it projects its world pos to NDC and if `cursorActiveRef` (set in `onMove`/`onLeave`) and the cursor is within `MOON_SAUCER_FLEE_NDC` (0.13) it sets `msFleeUntil = now + 900ms`, flips `msDir` ~50% of the time, and runs the orbit at `MOON_SAUCER_FLEE_MUL`× (12×) with a position jitter. Hand-integrated orbit angle (`msAngle += msDir * dt/period * 2π * speedMul`). Not clickable (decorative).
- **Starfield** (`GlobeApp.tsx` `makeStarLayer`) — was rendering on top of the globe + ballooning into squares when zooming out. Now: `sizeAttenuation:false` (fixed px size), `transparent:false`, `depthTest:false`, `depthWrite:false`, `renderOrder:-1` → drawn before the opaque globe so it always paints over them; brightness baked into per-vertex colours (3 layers @ r=600/1000/1500, px size 2.3/1.5/1.0).
- **City lights / oceans** (`globeShimmer.ts`) — Kate: lights too bright + too "pin gold", oceans too black, never sees the shimmer. Rewrote the shader patch (hooks `<map_fragment>`, modifies `diffuseColor`, no `vMapUv` dep): lifts dark pixels toward navy `vec3(0.022,0.052,0.115)*(1-w)`, desaturates+dims the lit pixels (`mix toward luminance 0.48*w`, `*= mix(1,0.50,w)`), then twinkles (seed = pixel brightness, so the flicker follows a city as it rotates; intensity 0.7). `index.astro` canvas filter stays bright (`brightness(1.16) contrast(1.05) saturate(0.92)`) — the toning is all in the shader; brightness is deliberately ≥1 (Kate doesn't want the overall image darker — just the cities less vibrant). *(5/10: bumped the desaturate `0.30→0.48` and the dim `0.80→0.50`, and the canvas `saturate 1.03→0.92`, because the lights were still too vibrant for the pins to read on top — they now look like a dim sodium glow. Knobs to tune if it's too far: the two `mix()`es in step 2 of the shader patch + the canvas `saturate`.)*
- **UFOs** (`ufos.ts`) — `UFO_POOL` is 4 "small+fast" (scale ~0.6–0.78, driftSpeed 4.6–6) + 4 "large+slow" (scale ~1.35–1.65, driftSpeed 1.7–2.4), each with a `sizeClass`. `makeSpawnManager({minActive:2})` refills to the floor immediately (no cooldown) and pairs opposite size classes via `randomUfoSpec(rnd, excludeColors, excludeSizeClasses)` → always ≥2 on screen, always a big-slow + small-fast. `FloatingUfos.tsx`: `minActive:2`; hit-sphere is `5.0 / spec.scale` (≈5 world units for every craft).
- **PinRail beacon** (`GlobeApp.tsx` `highlightPin`) — when `onQueueActiveChange` flies to a record, that pushpin is recoloured white + grown 1.7× (`pushpin.ts` now stashes `userData.{bead,defaultColor,defaultEmissive}`); cleared when the rail/queue closes (a `useEffect` on `pinRailType` + `highlightPin(null)` in the close handlers). Also: **removed the hover-jump** (`onPointHover` gone — it flickered in clusters). Hover tooltip now has `class="pin-tooltip {mediaType}"` + a `.pt-icon` glyph; colour rules in `global.css`.
- **Moon** — clicking it (`LunarMoon onSelect` → GlobeApp) sets `controlsRef.current.autoRotate = false`; `closeModalPreservingView` sets it back true. RecordModal shows "THE MOON" when `records.every(r => r.location?.name === "Moon")`. `LunarMoon` takes a `dirRef` prop and writes `globeRef.current.toGeoCoords(group.position)` → `{lat,lng}` each frame; `onQueueActiveChange`'s Moon branch flies `pointOfView({...moonDirRef.current, altitude: 3.0})` so browsing the Apollo photos in a rail swings the camera toward the Moon.
- **PinRail top pad** trimmed `30vh → 14px` (`global.css .pin-rail-list`; bottom stays ~38vh). **HUD**: `.top` got more right-padding so the stamp clears `.corner.tr`; `Ticker.astro` is green not red; `PageLayout` has `hideBack` (about page passes it).
- **Photo-vs-PDF classification** (`scripts/build-records.mjs` `detectMediaType`) — the FBI "B" photos (`fbi-photo-b1..b24`) + the 2023 composite sketch are photographs the gov uploaded as PDFs; `detectMediaType` now returns `'img'` first if the title matches `^FBI Photo`, `composite sketch`, or `photograph` (before the CSV `Type` check). 25 records flipped pdf→img (`/photos`: 14→39). Their `assetUrl` stays the war.gov `.pdf` (the `fullImagesToMirror` filter now skips non-image extensions, so the build doesn't pointlessly mirror a PDF). `RecordModal.tsx`: the `img` hero branch only `<img src={assetUrl}>` if `assetUrl` is an image ext, else falls back to `thumbnailUrl` (the mirrored JPG = the photo); the action button says "VIEW SOURCE PDF →" when `assetUrl` is `.pdf`. **`records.json` is regenerated by every Cloudflare deploy** (`npm run build` runs `build:data`), so committing it is just to keep the local artifact in sync — the real source of truth for `mediaType` is `build-records.mjs`.
- **Document type colour: violet `#b56cff`** (was gold `#ffc870` — blended with the amber city lights). `--color-pdf` in `global.css` + `COLORS.pdf` in `GlobeApp.tsx` + `TYPE_COLOR.pdf` in `LunarMoon.tsx` + the hardcoded `rgba(255,200,112,…)` → `rgba(181,108,255,…)` in `global.css` + `RecordCard.astro`'s badge bg. Distinct from `--color-hof: #d4b3ff` (the lavender HOF/"ET PHONE HOME" accent).
- **Ring pulses sized by location record count** (`GlobeApp.tsx`) — `points` entries now carry `_hasVid`; `rings = points.filter(p => p._hasVid || p._count >= 3)`; `ringMaxRadius` accessor `= min(2 + _count*0.45, 7.5)`; `ringColor` accessor colours by `_pinType` and fades with `t`. `ringRepeatPeriod` 1400→1600.
- **Pins: uniform "target marker" — flat button + halo ring; the pulse ring carries the count.** `pushpin.ts`: a flattened sphere (`bead.scale.set(1, beadFlatten=0.5, 1)` → low button, `beadRadius` 1.1, raised ~2.2 units off the surface via `altitude` 0.022) with a bright halo `TorusGeometry` ring around it (`haloRadiusMul` 1.55× the bead, `haloTubeMul` 0.11; colour = `bead colour lerp white 0.55`; child of the bead so it tracks the flatten; `halo.rotation.x = π/2` so the ring lies flat against the surface), on a tiny stub (`needleRadius` 0.06; `if (len > 0.01)` keeps the needle). The bead's emissive is `×0.45` (bright glow). `makePushpin` stashes `userData.{bead, halo, defaultColor, defaultEmissive, defaultHaloColor}`. `touchScale` 1.3, `altitudeRegional` 0.026 (>`altitude` only so the legacy `pushpin.test.ts` "regional>normal" assertions pass — `regional` unused). `GlobeApp.tsx`: ALL pins same size — no per-pin scale; `pointAltitude`/`pointRadius` (hit sphere `beadRadius·(touch?9:3.5)`) are constant. The count signal lives in `_ringRadius = min(2 + (count−1)·0.35, 8)°` (every pin has `_ring: true`). `highlightPin` (beacon) recolours bead+halo white + scales the group 1.8×. `pointLabel` tooltip: for `_count > 1`, a `<span class="pt-count">N RECORDS</span>` bright pill in the `.loc` line + "CLICK TO BROWSE ALL" in `.meta` (CSS in `global.css`). (History: scaled the pin itself = lollipop; scattered co-located records over an area = "inventing data" — both reverted.) `points` = ONE entry per location (group records by `location.name`, coloured by the dominant media type, ties → `TYPE_PRIORITY` pdf>img>vid). Each entry carries `_pinLat/_pinLng` (= `loc.lat/lng`), `_pinType`, `_count` (records there), `_ring` (always true now) and `_ringRadius = min(2 + (count−1)·0.5, 7.5)`. The pin's SIZE scales with `_count`: `pinSizeScale(n) = min(1 + 0.4·√(n−1), 3.4)` (module-level helper) — `customThreeObject` does `m.scale.setScalar(pinSizeScale(_count))` + stashes `m.userData.baseScale`; `pointAltitude`/`pointRadius` (the invisible hit sphere) are also `* pinSizeScale(_count)` so the hit target stays where the scaled bead is. `pointRadius = PUSHPIN.beadRadius * (isTouch?9:3.5) * pinSizeScale` (decoupled from the bead — much fatter). `customThreeObject` keys `pinMeshesRef` by `loc.name`; `highlightPin(rec|null)` looks up `pinMeshesRef.get(rec.location.name)`, scales to `baseScale*1.7` (beacon) / `baseScale` (restore). `openLocationModal` unchanged → clicking gathers ALL records at that `location.name`. Counts: Western US 25, Arabian Gulf 13, Syria 12, Iraq 8, United States 5, Mediterranean Sea 4. ⚠️ History: stacked-per-record → dedup → fan-out-ring (giant gold circle, bad) → dedup → scatter-regional ("feels like lying" — geocoder doesn't have 25 real coords) → **this bubble-map approach** (the keeper).

## 2026-05-09 — later in the day (mobile bottom sheet, UFOs, autoplay, badge fix)

- **Mobile RecordModal is a draggable bottom sheet now** (`≤767px`; desktop unchanged). `src/components/RecordModal.tsx` branches on `useMediaQuery("(max-width:767px)")` → renders a bottom-anchored sheet (`.modal--sheet`, `92dvh` tall) with two rest states: `peek` (parked ~46% up, globe visible/interactive above — backdrop is `pointer-events:none` in sheet mode so taps reach the globe) showing loc/type/title/agency·year + a glimpse of the media + a "↑ SWIPE UP" strip, and `full` (~92dvh, scrollable). Drag the grabber/header (`.sheet-handle`, `touch-action:none`, pointer events go through `window` listeners) to move between states; flick/drag down past peek = dismiss. Snap decision is a pure helper `src/lib/bottomSheet.ts` `pickSnapState()` (unit-tested `tests/bottomSheet.test.ts`). Tapping a different pin while peeked just swaps content (`recordsKey` effect resets `idx`, keeps `sheetState`). The entrance: starts at `translateY(110%)` then a double-rAF sets it to the peek offset → slides up.
- **Fixed the mobile pin-tap glitch** (pin bounced, nothing opened). `onPointHover` is a no-op on touch (the bounce was the hover-grow firing on a tap's synthetic mouse events); the old double-tap "preview bubble → open" flow + `TouchPreview` component are gone — a single tap calls `openLocationModal()` directly (the bottom sheet is the preview now). All `<Globe>` accessor props in `GlobeApp.tsx` are memoized (`useCallback`) so re-renders don't rebuild every pushpin mesh.
- **Videos autoplay** in the modal hero (`<video autoPlay playsInline>`; DVIDS `<iframe allow="autoplay; fullscreen">`).
- **More + catchable UFOs** — `UFO_POOL` is 8 saucers now (added brushed-aluminum / slate-steel / graphite tones); `makeSpawnManager` defaults `cap:4`, `spawnIntervalMs:8000` (was 2 / 18000). Flee is now an escapable dart: `FLEE_NDC_RADIUS` 0.18→0.12, kick ×6→×2.2, top flee speed 9×→3× cruise, `fleeUntil` 1100→650ms; each saucer mesh got an invisible ~4.6-unit hit-sphere so clicks register.
- **Fixed the `.type-badge` overlap bug** (root cause of the "DOCUMENT over TURKMENISTAN" modal-header overlap AND the "PDF bar across the whole gallery card" overlap): the global `.type-badge` rule in `global.css` was setting `position:absolute; top/left`, which leaked into RecordCard's `right`-anchored badge (→ stretched edge-to-edge) and RecordModal's flex header (→ overlapped `.loc`). Global rule now carries only visual styling; `.hof-thumb-wrap > .type-badge` / `.pin-rail-thumb > .type-badge` opt into the absolute corner positioning.
- "UNLOCATED" → "LOCATION UNKNOWN" in the modal header; **Hall of Fame chip stays purple on hover** (was inheriting `.chip:hover`'s green).

## 2026-05-09 session — what shipped (on top of the 5/8 state below)

- **Glossy 3D pushpin markers** (`src/lib/pushpin.ts` `makePushpin()` → THREE.Group: chrome needle + glossy media-coloured bead) via `customLayerData`; invisible `pointsData` is the hit-target (generous ~2× radius). Hovered pin "jumps" (grows 1.3×) via `onPointHover` → `pinMeshesRef` Map (desktop only now — no-op on touch).
- **City-light twinkle** — `src/lib/globeShimmer.ts` patches the globe material's fragment shader; intensity 0.5, per-cell + occasional "surge". Earth texture swapped to a mirrored 3600×1800 NASA VIIRS night-earth (`public/textures/earth-night.jpg`) + max anisotropic filtering for sharpness when zoomed.
- **Hall of Fame** — `★ HALL OF FAME` chip (bottom-left, purple) → `HallOfFameOverlay` (10 curated wildest records, `src/data/featured.json` + `src/lib/featured.ts`; build validates the list). Cards dispatch `open-record` → `GlobeApp` flies the globe + opens `RecordModal`.
- **PinRail** (`src/components/PinRail.tsx`) — the top "⏵ BROWSE PINS" chips no longer toggle pin visibility; they open a left-docked panel (~36vw × ~60vh desktop / full-width × ~50vh mobile, globe stays visible) of tall vertical cards; scrolling makes the centered card "active" → globe flies there; click → RecordModal.
- **Floating UFOs** — `FloatingUfos.tsx` + `src/lib/ufos.ts`. Dark-silver flying saucers only (no orbs, no tic-tac). ≤2 at once, spawner won't reuse an active colour. Velocity-based **sporadic** wander + **jets away** when the cursor gets near (`FLEE_NDC_RADIUS`). Click → `TransmissionModal` (8 cryptic *fictional* fragments). Hover-grow.
- **Orbiting Moon** — `LunarMoon.tsx`. The 8 Apollo lunar records (no longer plotted on Earth — `points` excludes `location.name === "Moon"`) live on a small textured Moon (`public/textures/moon.jpg`) that slow-orbits Earth (~5min, no spin). Pins on it = `makePushpin()` scaled down, **clustered** in one region, **media-type-coloured**, with invisible hit-spheres. Click a Moon pin → opens the whole lunar set starting there; click the Moon body → all 8.
- **RecordModal** — redesigned to a **left-docked panel** (~60vw, globe visible/spinning behind on desktop; full-screen on mobile), scrolls as ONE unit (no skinny inner box), sticky header so `BACK TO GLOBE` / `BACK TO GALLERY` stays reachable. Stills show at natural aspect (capped); video keeps 16/9. `closeLabel` prop. **All overlays (RecordModal, QueuePanel, TransmissionModal, HallOfFameOverlay) are portalled to `document.body`** (`src/components/Portal.tsx`) so they sit above the Hud — they were rendering *under* it before because `.globe-page` is `position: fixed` (own stacking context).
- **HUD / chrome**: dropped the BROWSE mini-nav; `DECLASSIFIED · RELEASE_01` sits alone in the top-right corner; `ⓘ ABOUT` moved to a bottom-right chip (lowercase `i`, 26×26 square on mobile, mirrors the HALL OF FAME chip). Bottom dock = `▦ BROWSE GALLERY` link (→ new `/gallery` page, all 161 records) + icon-only colour-coded `▶ ⊡ ▤` chips (no dot swatches); the LOCATION UNKNOWN dock chip was removed. Type badges (on cards) got a near-solid dark backing so they read on white PDF thumbnails. Touch-aware instruction banner.
- **TTS** — `LISTEN` button: better browser-voice selection (Google cloud voices first, etc.), and an ElevenLabs proxy at `functions/api/tts.js` (uses `ELEVENLABS_API_KEY` Cloudflare secret — **Kate hasn't set the secret yet**; until she does, it 503s and the browser voice is used). "voice · ElevenLabs" credit shown when active; noted on /about.
- `/about` has a `SOURCE · WAR.GOV/UFO →` + `CREATOR · WITHKATE.AI →` (https://withkate.ai) two-box row.
- **`LICENSE`** (MIT) added; **`README.md`** rewritten public-facing/snarky. **Vitest** is set up — `npm test` (53 tests across `tests/`).

## Open items / backlog (next session)
- **Set `ELEVENLABS_API_KEY` in Cloudflare Pages** (Settings → Variables and Secrets, encrypted, Production) → instant good narration. Until then it falls back to the browser voice. Walk Kate through it (she has an ElevenLabs account).
- Pin hover tooltip flicker on desktop (`.float-tooltip-kap` z-index inside `.scene-container`) — long-standing, still not fixed.
- **Bottom sheet — needs real-device feel-check.** Verified in Playwright (peek/full layout, the readmore button, full→peek drag, close button, video autoplay) but NOT on a real touch device: the drag-to-*dismiss* gesture (drag down past peek / flick), momentum, and how it feels rapidly tapping pins to browse titles. Tunables: `PEEK_UNCOVERED` (0.54) and the sheet height (`92dvh`) in `RecordModal.tsx`; `FLICK_VELOCITY` (0.5 px/ms) in `bottomSheet.ts`.
- **UFO catchability is a feel-tune.** Current numbers (flee radius 0.12, kick ×2.2, fleeUntil 650ms, hit-sphere 4.6, cap 4) are a first pass — if a craft is still too slippery or now too easy, the knobs are all in `FloatingUfos.tsx` (`FLEE_NDC_RADIUS`, the kick/`fleeUntil` in the flee block, the `clampSpeed` `max` multiplier) and `ufos.ts` (`cap`, `spawnIntervalMs`).
- A11y pass (keyboard nav / focus traps on the now-many overlays; the bottom sheet has no keyboard equivalent for drag — Esc closes it, though).
- A `npm run dev -- --host` LAN dev server may still be running from this session (port 4321) — Kate uses it to preview on her phone.

---

# (5/8/26 state — original build, for reference)

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
