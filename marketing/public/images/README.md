# Marketing images

All image paths are defined in **`app/config/marketingImages.ts`**. Components import from there — **do not hardcode paths** in JSX.

## Your workflow

1. Run once (or after cloning): `npm run placeholders` — creates missing placeholders in `public/images/**`.
2. Open this folder and **replace files with real exports**.
3. **Keep the exact filename** (e.g. `scheduling.png` → better `scheduling.png`). No code changes.

## Layout

| Path | Purpose |
|------|---------|
| `brand/logo-header.png` | Header logo |
| `brand/logo-footer-white.png` | Footer logo on dark background |
| `hero/collage-main.png` | Hero — large collage panel |
| `hero/collage-top.png` | Hero — top-right tile |
| `hero/collage-bottom.png` | Hero — bottom-right tile |
| `features/scheduling.png` | Platform section — Scheduling tab |
| `features/jobs.png` | Jobs tab |
| `features/recurring.png` | Recurring tab |
| `features/clients.png` | Clients tab |
| `features/leads.png` | Leads tab |
| `features/invoicing.png` | Invoicing tab |
| `features/analytics.png` | Analytics tab |
| `features/routes.png` | Routes tab |
| `features/team.png` | Team tab |
| `og/og-image.png` | Open Graph / Twitter card (use **1200×630** when you can) |

**Platform / feature tab images:** Build your screenshot **inside your own mockup** (laptop frame, browser chrome, etc.) in Figma or another tool, then export to the filenames above — **PNG with transparency** is supported; nothing is drawn behind the image (no white card).

Placeholders are tiny valid PNGs until you overwrite them.

## `public/hero/` folder

Hero collage images are currently read directly from `public/hero/` via `app/config/marketingImages.ts`.
