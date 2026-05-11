import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// `?url` makes Vite emit the bundled pdf.js worker as an asset and hand us its
// final URL — works in dev and in the production build. (The classic pdf.js +
// Vite gotcha: a plain `new URL('pdfjs-dist/build/...', import.meta.url)` won't
// resolve a bare specifier.)
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set the worker once at module scope.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Horizontal breathing room subtracted from the container width before fitting
 *  each page to it (a hair of margin + room for an overlay scrollbar). */
const PAGE_H_PADDING = 12;

export default function PdfViewer({ url }: { url: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    const renderTasks: Array<{ cancel: () => void }> = [];
    const container = scrollRef.current;
    if (container) container.replaceChildren();

    setStatus("loading");

    (async () => {
      let loaded: PDFDocumentProxy;
      try {
        loaded = await pdfjsLib.getDocument({ url }).promise;
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) {
        loaded.destroy();
        return;
      }
      doc = loaded;
      setStatus("ready");

      if (!container) return;
      // Width available to a page canvas (CSS px) — measure the wrapper so the
      // pending overlay scrollbar etc. doesn't throw it off; fall back if the
      // layout somehow hasn't settled.
      const measured = wrapRef.current?.clientWidth || container.clientWidth || 600;
      const containerWidth = Math.max(120, measured - PAGE_H_PADDING);
      const dpr = window.devicePixelRatio || 1;

      for (let n = 1; n <= loaded.numPages; n++) {
        if (cancelled) return;
        let page;
        try {
          page = await loaded.getPage(n);
        } catch {
          continue;
        }
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = containerWidth / base.width;
        const viewport = page.getViewport({ scale: scale * dpr });

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // Only pin the CSS width; CSS `height: auto` keeps the page's aspect
        // ratio (and lets `max-width: 100%` clamp gracefully without squishing).
        canvas.style.width = `${viewport.width / dpr}px`;
        // Append before render so pages stream in top-to-bottom.
        container.appendChild(canvas);

        const task = page.render({ canvas, viewport });
        renderTasks.push(task);
        try {
          await task.promise;
        } catch {
          // render cancelled (unmount / url change) — stop here
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const t of renderTasks) {
        try {
          t.cancel();
        } catch {
          /* already done */
        }
      }
      if (container) container.replaceChildren();
      if (doc) {
        try {
          doc.destroy();
        } catch {
          /* noop */
        }
      }
    };
  }, [url]);

  return (
    <div className="pdf-viewer" ref={wrapRef}>
      <div ref={scrollRef} className="pdf-pages" />
      {status !== "ready" && (
        <div className="pdf-viewer-msg">
          {status === "loading" ? "Loading PDF…" : "Couldn’t load the PDF preview."}
        </div>
      )}
      <style>{`
        .pdf-viewer {
          width: 100%;
          height: 100%;
          position: relative;
          background: #2a2c2e;
        }
        .pdf-viewer-msg {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: rgba(255,255,255,.65);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: .15em;
          text-transform: uppercase;
          padding: 24px;
          background: #2a2c2e;
          pointer-events: none;
        }
        .pdf-pages {
          width: 100%;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y pinch-zoom;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
        }
        .pdf-page-canvas {
          display: block;
          max-width: 100%;
          /* if max-width clamps it (a stray sub-pixel of overflow), keep the
             page's aspect ratio rather than squishing it vertically */
          height: auto;
          background: #fff;
          box-shadow: 0 1px 6px rgba(0,0,0,.45);
        }
      `}</style>
    </div>
  );
}
