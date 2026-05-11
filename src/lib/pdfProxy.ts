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
