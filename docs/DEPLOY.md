# Deploy — Cloudflare Pages + GitHub

One-time setup. After this, every push to `main` auto-deploys.

## 1. Go to Cloudflare Pages

https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**

## 2. Authorize the Cloudflare GitHub App

- Click **Connect GitHub account**
- On GitHub: install/authorize the **Cloudflare Pages** app
- Grant access to **only** `ufos-et-phone-home` (or all repos — your call)

## 3. Pick the repo

`katehostetler/ufos-et-phone-home` → **Begin setup**

## 4. Configure build settings

| Setting | Value |
|---|---|
| Project name | `ufos-et-phone-home` (becomes `<name>.pages.dev`) |
| Production branch | `main` |
| Framework preset | `Astro` (or "None" — both work) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |
| Environment variables | none needed |

**Build command details:** `npm run build` invokes `npm run build:data && astro build`, which:
1. Re-fetches the war.gov CSV (reuses local cache if fetch fails)
2. Geocodes all locations from the static lookup
3. Mirrors any new thumbnails (skips ones already in `public/thumbnails/`)
4. Builds the static Astro site to `dist/`

Total build time on Cloudflare's free tier: ~2 minutes.

## 5. Save and Deploy

Click **Save and Deploy**. First build takes ~2–3 minutes. The site will be live at `https://<project-name>.pages.dev`.

## 6. (Optional) Custom domain

In the project's **Custom domains** tab, add your own domain. Cloudflare handles DNS + SSL automatically.

## After deploy

- Every `git push origin main` triggers a fresh build + deploy.
- Preview deploys are auto-created for any branch with an open PR.
- Build logs live in the Cloudflare dashboard.
- War.gov rate limits: if a build hits a 403 wall while mirroring thumbnails, the cached versions in `public/thumbnails/` (committed to the repo) keep the site working.
