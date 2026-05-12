# Learnings

Running log of bugs, mistakes, and gotchas — and the reusable rule to take away from each.

---

## 2026-05-10 — react-globe.gl: a visible `customLayerData` marker silently eats clicks meant for its `pointsData` hit-target

**What went wrong:** Pin clicks "sometimes" did nothing. The globe uses a transparent `pointsData` cylinder as each pin's clickable hit-volume (`onPointClick`), with the *visible* pin drawn separately as a `customLayerData` `THREE.Group` (needle + bead). Two bugs:
1. The custom-layer mesh is raycastable by default, and the bead sits **closer to the camera** than the top of the hit-cylinder — so the raycaster's nearest hit was the bead. globe.gl classified that as a "custom layer" hit (which we don't handle) and never fired `onPointClick`.
2. The hit-cylinder was only as tall as the needle, so the bead poked out its top. Near the globe's limb, a ray aimed dead-centre at the bead passes *over* the cylinder entirely → no hit.

**Fix:** (a) disable raycasting on the visible marker — `group.traverse(o => { o.raycast = () => {}; })` in `customThreeObject`; (b) size the `pointAltitude` hit-cylinder tall enough to fully enclose the visible marker, with headroom (`pushpinHitAltitude()` in `src/lib/pushpin.ts`).

**Rule to always follow:** When a globe.gl (or any three.js) layer uses an *invisible* proxy for hit-testing and a *separate* visible mesh for looks, the visible mesh MUST be made non-raycastable (`obj.raycast = () => {}`), AND the invisible proxy must fully contain the visible mesh's bounds. Otherwise the visible mesh — being nearer the camera — wins the raycast and the proxy never gets hit.

## 2026-05-11 — pdf.js v5 needs `wasmUrl` configured, or scanned PDFs (JPX/JBIG2) render blank

**What went wrong:** A new in-app PDF viewer (`PdfViewer.tsx`, pdf.js v5) only set `pdfjsLib.GlobalWorkerOptions.workerSrc`. It worked for text PDFs but rendered most *scanned* war.gov PDFs **blank** — just a stray date stamp in a corner. Console: `"JpxError: OpenJPEG failed to initialize"` and `"Jbig2Error: JBig2 failed to initialize"` per page. pdf.js v5 decodes JPEG2000 (JPX/OpenJPEG) and JBIG2 page images via WASM modules (`pdfjs-dist/wasm/openjpeg.wasm`, `jbig2.wasm`, `qcms_bg.wasm` for ICC); without `wasmUrl` it can't load them. It slipped through because the only PDF tested when the viewer shipped was a tiny *text-only* sample with no JPX/JBIG2 images.

**Fix:** `scripts/copy-pdfjs-assets.mjs` (run on `postinstall` + at the top of `npm run build`) copies `pdfjs-dist/{wasm,iccs,standard_fonts}` → `public/pdfjs/` (gitignored); `pdfjsGetDocumentParams()` in `src/lib/pdfProxy.ts` hands `getDocument()` `wasmUrl` / `iccUrl` / `standardFontDataUrl` under `/pdfjs/`. Guarded by `tests/pdfRendering.test.ts`.

**Rule to always follow:** When wiring up pdf.js v5, configure `wasmUrl` (and `iccUrl`, `standardFontDataUrl`, plus `cMapUrl` if CJK is possible) — not just `workerSrc` — and serve those asset dirs statically. And: a PDF-renderer change MUST be verified against a real *scanned* PDF (one with JPX/JBIG2 images), not just a text PDF — "it renders" on a text sample proves almost nothing.

## 2026-05-11 — war.gov / Akamai: 403s `curl` (TLS fingerprint), 200s a browser/Node `fetch`; serves no CORS headers

**What was surprising:** `curl` against `https://www.war.gov/medialink/...pdf` (or the CSV) returns `403` (HTML error page) even with a full browser `User-Agent` + `Referer` + `Sec-Fetch-*` headers + a cookie jar — Akamai bot-management keys partly off the TLS fingerprint, which `curl`'s differs from a browser's. The *same request* via Node's `fetch` (undici) or a Cloudflare Worker's `fetch` returns `200` with the real file. Also: the PDF responses carry **no `Access-Control-Allow-Origin`**, so a browser can't fetch them cross-origin (hence the `/api/pdf` Cloudflare Function proxy, which fetches server-side and re-serves same-origin). And they support `Range`/`206`.

**Rule to always follow:** Don't conclude "war.gov is blocking us" from a `curl` test — test with Node `fetch` / the actual runtime. For anything that needs a war.gov asset *in the browser* (pdf.js, an image fetch), proxy it through a same-origin Function — direct hotlinking / cross-origin fetch won't work. (The build's `mirrorAsset` uses `curl` and *does* work for thumbnails — because it runs with a populated `.wargov-cookies.txt` from `establishWarGovSession`; the cookie + curl combo is more fragile than just using `fetch`.)
