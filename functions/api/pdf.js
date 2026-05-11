/**
 * Cloudflare Pages Function — GET /api/pdf?url=<war.gov pdf url>
 *
 * Proxies a war.gov-hosted UFO PDF same-origin so the in-app pdf.js viewer can
 * `fetch`/XHR it. war.gov serves these PDFs with no CORS headers, so a browser
 * can't fetch them cross-origin; this proxy serves them from our own domain.
 *
 * Cloudflare auto-routes this file because it lives under /functions. The static
 * Astro build in /dist is unaffected.
 *
 * SSRF guard: only `https://www.war.gov/medialink/...pdf` URLs are proxied.
 *
 * war.gov 403s `curl` (TLS fingerprinting) but returns 200 to a browser-ish
 * `fetch` — the Workers runtime behaves like the latter. It also supports range
 * requests (206 + Content-Range, Accept-Ranges: bytes), which pdf.js may use.
 */

function isWarGovPdf(u) {
  return (
    u.protocol === "https:" &&
    u.hostname === "www.war.gov" &&
    u.pathname.startsWith("/medialink/") &&
    /\.pdf(\?|#|$)/i.test(u.pathname)
  );
}

async function handlePdf(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) return new Response("bad url", { status: 400 });

  let u;
  try {
    u = new URL(urlParam);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!isWarGovPdf(u)) return new Response("bad url", { status: 400 });

  const range = request.headers.get("range");
  let upstream;
  try {
    upstream = await fetch(u.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        Accept: "application/pdf,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.war.gov/UFO/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        ...(range ? { Range: range } : {}),
      },
    });
  } catch {
    return new Response("upstream error", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("upstream error", { status: 502 });
  }

  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, s-maxage=604800",
    "X-Content-Type-Options": "nosniff",
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["Content-Length"] = len;
  const cr = upstream.headers.get("content-range");
  if (cr) headers["Content-Range"] = cr;

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function onRequest(context) {
  const m = context.request.method;
  if (m === "GET") return handlePdf(context);
  if (m === "OPTIONS") return new Response(null, { status: 204 });
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
}
