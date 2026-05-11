import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pdfjsGetDocumentParams, PDFJS_ASSET_BASE } from "@/lib/pdfProxy";

// Regression guard for the "scanned PDFs render blank" bug.
//
// What happened: PdfViewer was rendering documents with pdf.js v5 but only set
// `GlobalWorkerOptions.workerSrc` — it never pointed pdf.js at the WASM image
// decoders. pdf.js v5 decodes JPEG2000 (JPX/OpenJPEG) and JBIG2 page images via
// WASM (openjpeg.wasm / jbig2.wasm), and *most* of the scanned war.gov PDFs
// encode their pages that way. With no `wasmUrl`, pdf.js logs "OpenJPEG failed to
// initialize" / "JBig2 failed to initialize" and those pages render BLANK. It
// slipped through because the only PDF tested was a small text-only sample (no
// JPX/JBIG2 images).
//
// Fixes, each guarded below:
//   1. scripts/copy-pdfjs-assets.mjs copies pdfjs-dist/{wasm,iccs,standard_fonts}
//      → public/pdfjs/ (postinstall + at the top of `npm run build`).
//   2. pdfjsGetDocumentParams() (src/lib/pdfProxy.ts) hands pdf.js wasmUrl /
//      iccUrl / standardFontDataUrl, all under /pdfjs/. PdfViewer must use it.

const ROOT = process.cwd(); // vitest runs from the repo root
const PDFJS_NM = resolve(ROOT, "node_modules", "pdfjs-dist");

describe("pdfjsGetDocumentParams (the config that keeps scanned PDFs from rendering blank)", () => {
  const params = pdfjsGetDocumentParams("/api/pdf?url=https%3A%2F%2Fwww.war.gov%2Fmedialink%2Fufo%2Frelease_1%2Fx.pdf");

  it("passes the file url through", () => {
    expect(params.url).toMatch(/^\/api\/pdf\?url=/);
  });

  it("points pdf.js at the bundled WASM decoders (wasmUrl) — without this, JPEG2000/JBIG2 page images don't decode and the page is blank", () => {
    expect(typeof params.wasmUrl).toBe("string");
    expect(params.wasmUrl).toBeTruthy();
    expect(params.wasmUrl.startsWith(PDFJS_ASSET_BASE)).toBe(true);
    expect(params.wasmUrl).toMatch(/\/wasm\/$/);
  });

  it("also points at the ICC profiles and standard fonts", () => {
    expect(params.iccUrl).toBeTruthy();
    expect(params.iccUrl.startsWith(PDFJS_ASSET_BASE)).toBe(true);
    expect(params.standardFontDataUrl).toBeTruthy();
    expect(params.standardFontDataUrl.startsWith(PDFJS_ASSET_BASE)).toBe(true);
  });

  it("PdfViewer actually uses pdfjsGetDocumentParams (not a bare {url})", async () => {
    const src = await readFile(resolve(ROOT, "src/components/PdfViewer.tsx"), "utf8");
    expect(src).toMatch(/pdfjsGetDocumentParams\s*\(/);
    // a bare `getDocument({ url })` would be the regression — make sure it's gone
    expect(src).not.toMatch(/getDocument\(\s*\{\s*url\s*\}\s*\)/);
  });
});

describe("pdf.js runtime assets are present", () => {
  // The decoders pdf.js needs to read scanned-document page images.
  for (const f of ["wasm/openjpeg.wasm", "wasm/jbig2.wasm", "wasm/qcms_bg.wasm"]) {
    it(`pdfjs-dist ships ${f} (a version bump that moves/renames it would silently break scanned-PDF rendering)`, () => {
      expect(existsSync(resolve(PDFJS_NM, f))).toBe(true);
    });
  }

  it("the copy script exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/copy-pdfjs-assets.mjs"))).toBe(true);
  });

  it("public/pdfjs/ has the WASM decoders (postinstall / `npm run build` should have copied them — run `npm install` if this fails)", () => {
    expect(existsSync(resolve(ROOT, "public/pdfjs/wasm/openjpeg.wasm"))).toBe(true);
    expect(existsSync(resolve(ROOT, "public/pdfjs/wasm/jbig2.wasm"))).toBe(true);
  });
});
