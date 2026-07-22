/**
 * Single source of truth for marketing site images.
 *
 * Feature/brand files live under `public/images/` and hero collage files under
 * `public/hero/` — replace using the same filenames (no code changes needed).
 *
 * Prefer WebP for lifestyle/photos (smaller, sharp enough). PNG is fine for
 * crisp UI screenshots. Missing files render as grey boxes via MarketingImage
 * showing filename + pixel size so you can upload without more code.
 *
 * Regenerate empty placeholders: `npm run placeholders`
 */

export const marketingImages = {
  brand: {
    /** Header logo on light bar — green pin + dark wordmark */
    logoHeader: '/images/brand/logo-header.png',
    /** Header logo on dark surfaces — green pin + white wordmark */
    logoHeaderWhite: '/images/brand/logo-header-white.png',
    /** Mono dark logo (optional) */
    logoHeaderMono: '/images/brand/logo-header-mono.png',
    /** White footer logo for dark background footer */
    logoFooterWhite: '/images/brand/logo-footer-white.png',
  },
  hero: {
    collageMain: {
      src: '/hero/collage-main.png',
      alt: 'PathPilo product overview',
    },
    collageTop: {
      src: '/hero/collage-top.png',
      alt: 'PathPilo route planning',
    },
    collageBottom: {
      src: '/hero/collage-bottom.png',
      alt: 'PathPilo job details',
    },
  },
  /** Laptop screenshots in the “Platform” section (one per tab) */
  features: {
    scheduling: '/images/features/scheduling.png',
    jobs: '/images/features/jobs.png',
    recurring: '/images/features/recurring.png',
    clients: '/images/features/clients.png',
    leads: '/images/features/leads.png',
    invoicing: '/images/features/invoicing.png',
    analytics: '/images/features/analytics.png',
    routes: '/images/features/routes.png',
    team: '/images/features/team.png',
    /** Prefer WebP for new uploads — grey placeholder until file exists */
    remindersHero: '/images/features/reminders-hero.webp',
    servicesHero: '/images/features/services-hero.webp',
    leadsDetail: '/images/features/leads-detail.webp',
  },
  /** Open Graph / social preview (recommended 1200×630) */
  og: {
    default: '/images/og/og-image.png',
    routePlanner: '/images/og/og-route-planner.png',
    pricing: '/images/og/og-pricing.png',
    routePlanning: '/images/og/og-routeplanning.png',
  },
} as const

export type FeatureImageKey = keyof typeof marketingImages.features
