/** The same-origin proxy URL for a war.gov PDF, or null if `assetUrl` isn't one.
 *
 * war.gov serves its UFO PDFs without CORS headers, so the in-app pdf.js viewer
 * can't fetch them cross-origin — `/api/pdf` (a Cloudflare Pages Function) proxies
 * them from our own domain. Only `https://www.war.gov/medialink/...pdf` URLs are
 * eligible (matches the SSRF guard in `functions/api/pdf.js`). */
export function proxiedPdfUrl(assetUrl: string | null | undefined): string | null {
  if (!assetUrl) return null;
  try {
    const u = new URL(assetUrl);
    if (u.protocol !== "https:" || u.hostname !== "www.war.gov" || !u.pathname.startsWith("/medialink/"))
      return null;
    if (!/\.pdf(\?|#|$)/i.test(u.pathname)) return null;
  } catch {
    return null;
  }
  return `/api/pdf?url=${encodeURIComponent(assetUrl)}`;
}

/** Base path under which pdf.js's runtime assets are served — `scripts/copy-pdfjs-assets.mjs`
 *  copies them out of `node_modules/pdfjs-dist` into `public/pdfjs/` (so `dist/pdfjs/...`). */
export const PDFJS_ASSET_BASE = "/pdfjs/";

/**
 * Params to hand `pdfjsLib.getDocument()`. Beyond the file `url`, this MUST point
 * pdf.js at the bundled WASM decoders — without `wasmUrl`, pdf.js v5 can't decode
 * JPEG2000 (JPX/OpenJPEG) or JBIG2 page images, which is how most of the *scanned*
 * war.gov PDFs encode their pages → those pages render BLANK ("OpenJPEG failed to
 * initialize" / "JBig2 failed to initialize" in the console). `iccUrl` /
 * `standardFontDataUrl` cover ICC colour profiles and the standard-14 fonts.
 */
export function pdfjsGetDocumentParams(url: string) {
  return {
    url,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
    iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  };
}
