// Copies pdf.js's runtime assets out of node_modules into public/pdfjs/ so the
// in-app PDF viewer can fetch them at runtime.
//
// WHY THIS EXISTS: pdf.js v5 decodes JPEG2000 (JPX/OpenJPEG) and JBIG2 images
// — which most of the *scanned* war.gov PDFs use for their page images — via
// WASM modules (wasm/openjpeg.wasm, wasm/jbig2.wasm, wasm/qcms_bg.wasm). It also
// wants ICC profiles (iccs/) and the standard-14 fonts (standard_fonts/) for
// some PDFs. If pdf.js can't find these, you get "OpenJPEG failed to initialize"
// / "JBig2 failed to initialize" and the affected pages render BLANK. PdfViewer
// points pdf.js at `/pdfjs/{wasm,iccs,standard_fonts}/` (see pdfjsGetDocumentParams
// in src/lib/pdfProxy.ts); this script puts the files there.
//
// Run automatically from `postinstall` and again at the top of `npm run build`.
// public/pdfjs/ is .gitignore'd — it's a build artifact derived from the
// installed pdfjs-dist version. (cmaps/ — CJK CMaps — is intentionally skipped:
// the archive has no CJK PDFs and it's 1.6 MB of dead weight in the deploy.)

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "node_modules/pdfjs-dist");
const DEST = resolve(ROOT, "public/pdfjs");
const DIRS = ["wasm", "iccs", "standard_fonts"];

async function main() {
  try {
    await stat(SRC);
  } catch {
    console.error("⚠ pdfjs-dist isn't installed yet — skipping pdf.js asset copy. (Run `npm install` then re-run.)");
    return; // don't fail `postinstall` if, somehow, deps aren't there yet
  }
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const d of DIRS) {
    const from = resolve(SRC, d);
    try {
      await stat(from);
    } catch {
      console.error(`✗ Expected pdfjs-dist/${d}/ but it isn't there — a pdfjs-dist version bump may have moved it. PDF rendering of scanned files will break.`);
      process.exitCode = 1;
      continue;
    }
    await cp(from, resolve(DEST, d), { recursive: true });
  }
  console.log(`✓ Copied pdf.js assets (${DIRS.join(", ")}) → public/pdfjs/`);
}

main().catch((e) => {
  console.error("✗ copy-pdfjs-assets failed:", e);
  process.exitCode = 1;
});
