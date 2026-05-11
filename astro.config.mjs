import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  // Prefetch internal links on hover (user intent → near-instant navigation
  // between the globe and the gallery pages). Hover, not viewport, so we don't
  // eagerly fetch everything — only what the cursor lands on.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // Compress the built HTML/CSS/JS/SVG (Cloudflare also gzips/brotlis at the
  // edge, but this trims what we ship + what the worker has to compress).
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['react-globe.gl', 'three-globe'],
    },
    build: {
      rollupOptions: {
        output: {
          // Split the Three.js / globe stack into its own long-lived chunk so
          // it's cached separately from app code and never duplicated. Only the
          // homepage (`GlobeApp`) imports it; the gallery pages stay three-free.
          manualChunks(id) {
            if (
              /[\\/]node_modules[\\/](three|three-globe|react-globe\.gl|kapsule|d3-[^\\/]+|topojson-[^\\/]+|@tweenjs)[\\/]/.test(id)
            ) {
              return 'three-globe';
            }
            // pdf.js (~1MB) — only the record modal's lazy PdfViewer pulls it in;
            // keep it in its own chunk so the lazy import stays clean and it's
            // never bundled into the homepage entry.
            if (id.includes('pdfjs-dist')) {
              return 'pdfjs';
            }
          },
        },
      },
    },
  },
});
