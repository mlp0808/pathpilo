# PathPilo marketing site

## Dev & build (important)

Always run commands **from this folder** so Tailwind scans `marketing/app` and not the main app:

```bash
cd marketing
npm install
npm run dev    # http://localhost:3003
npm run build
```

Or from the repo root: `npm run dev:marketing` / `npm run build:marketing`.

If styles look “missing”, you’re usually building from the wrong directory or an old `.next` cache — run `rm -rf .next` (or delete `.next` on Windows) inside `marketing/`, then `npm run build` again.

Tailwind is pinned via `postcss.config.js` → `marketing/tailwind.config.js` because the monorepo root has its own Tailwind config.

## Images (placeholders)

- **Config (paths only):** `app/config/marketingImages.ts`
- **Files:** `public/images/` — see `public/images/README.md` and `manifest.json`
- **Regenerate tiny placeholder PNGs:** `npm run placeholders`  
  (Copies from `public/hero/` into the new layout when those files exist.)

Replace any file under `public/images/` with your final asset; **keep the same filename** so you don’t need to edit code.
