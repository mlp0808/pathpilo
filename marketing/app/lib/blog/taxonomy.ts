/**
 * Blog taxonomy — the "network" of categories and tags that drives
 * navigation, archive pages, and related-article suggestions.
 *
 * CATEGORIES are broad sections (one per article). They get their own
 * archive page, a colour, and show up in the top filter bar.
 *
 * TAGS are granular topics (many per article). They power related-article
 * scoring and tag archive pages. Adding a new tag is cheap — just use it in
 * an article's frontmatter. The labels below give known tags a nice display
 * name; unknown tags fall back to a title-cased version of the slug.
 */

export interface BlogCategory {
  slug: string
  label: string
  /** One-line description shown on the category archive page + cards. */
  description: string
  /** Brand-friendly hex used for pills, gradients, and image fallbacks. */
  color: string
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: 'getting-started',
    label: 'Getting Started',
    description: 'Set up PathPilo and run your first jobs, routes, and invoices with confidence.',
    color: '#3DD57A',
  },
  {
    slug: 'route-planning',
    label: 'Route Planning',
    description: 'Plan smarter routes, cut drive time, and fit more jobs into every day.',
    color: '#14b8c4',
  },
  {
    slug: 'scheduling',
    label: 'Scheduling & Jobs',
    description: 'Organise your calendar, recurring work, and day-to-day job management.',
    color: '#6366f1',
  },
  {
    slug: 'invoicing',
    label: 'Invoicing & Payments',
    description: 'Get paid faster with professional invoices, reminders, and healthy cash flow.',
    color: '#8b5cf6',
  },
  {
    slug: 'leads-marketing',
    label: 'Leads & Marketing',
    description: 'Win more work — capture leads, follow up, and market your service business.',
    color: '#f59e0b',
  },
  {
    slug: 'team-management',
    label: 'Team Management',
    description: 'Hire, schedule, and lead a field team that runs without you chasing them.',
    color: '#ec4899',
  },
  {
    slug: 'business-growth',
    label: 'Business Growth',
    description: 'Pricing, retention, and the operations that turn a service business into a real company.',
    color: '#0ea5e9',
  },
  {
    slug: 'product-updates',
    label: 'Product Updates',
    description: "What's new in PathPilo — features, improvements, and release notes.",
    color: '#193434',
  },
]

const DA_CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Kom godt i gang',
  'route-planning': 'Ruteplanlægning',
  scheduling: 'Planlægning & opgaver',
  invoicing: 'Fakturering & betaling',
  'leads-marketing': 'Leads & marketing',
  'team-management': 'Teamstyring',
  'business-growth': 'Forretningsvækst',
  'product-updates': 'Produktopdateringer',
  ruteplanlægning: 'Ruteplanlægning',
}

const CATEGORY_BY_SLUG: Record<string, BlogCategory> = Object.fromEntries(
  BLOG_CATEGORIES.map((c) => [c.slug, c]),
)

export function getCategory(slug: string | undefined | null): BlogCategory | undefined {
  if (!slug) return undefined
  return CATEGORY_BY_SLUG[slug]
}

export function getCategoryLabel(slug: string, locale: 'en' | 'da' = 'en'): string {
  if (locale === 'da' && DA_CATEGORY_LABELS[slug]) return DA_CATEGORY_LABELS[slug]
  return getCategory(slug)?.label ?? slug
}

/** Always returns a usable category (falls back to a neutral default). */
export function resolveCategory(slug: string | undefined | null): BlogCategory {
  return (
    getCategory(slug) || {
      slug: slug || 'uncategorised',
      label: 'Articles',
      description: 'Guides and tips for running your service business.',
      color: '#193434',
    }
  )
}

/**
 * Known tag labels. Tags not listed here still work — they just render as a
 * title-cased version of their slug. Keep slugs short, lowercase, dash-separated.
 */
export const BLOG_TAG_LABELS: Record<string, string> = {
  // Route planning
  'route-optimization': 'Route Optimisation',
  'route-planning-software': 'Route Planning Software',
  'automated-routing': 'Automated Routing',
  dispatch: 'Dispatching',
  'fuel-savings': 'Fuel Savings',
  'gps-tracking': 'GPS Tracking',
  'live-eta': 'Live ETA',
  'multi-stop': 'Multi-stop Routing',
  // Field service software
  'field-service': 'Field Service',
  'field-service-software': 'Field Service Software',
  ai: 'AI & Automation',
  'software-comparison': 'Software Comparison',
  'buyers-guide': "Buyer's Guide",
  // Scheduling
  'recurring-jobs': 'Recurring Jobs',
  scheduling: 'Scheduling',
  'calendar-management': 'Calendar Management',
  'time-management': 'Time Management',
  'seasonal-work': 'Seasonal Work',
  // Invoicing
  invoicing: 'Invoicing',
  quotes: 'Quotes & Estimates',
  'payment-reminders': 'Payment Reminders',
  'cash-flow': 'Cash Flow',
  vat: 'VAT & Tax',
  pricing: 'Pricing',
  'pricing-strategy': 'Pricing Strategy',
  // Leads & marketing
  'lead-generation': 'Lead Generation',
  'online-booking': 'Online Booking',
  'google-reviews': 'Google Reviews',
  'local-seo': 'Local SEO',
  'customer-retention': 'Customer Retention',
  'follow-up': 'Follow-up',
  referrals: 'Referrals',
  // Team
  hiring: 'Hiring',
  'team-scheduling': 'Team Scheduling',
  'time-tracking': 'Time Tracking',
  'field-team': 'Field Team',
  // Growth & ops
  'business-growth': 'Business Growth',
  productivity: 'Productivity',
  automation: 'Automation',
  crm: 'CRM',
  'mobile-app': 'Mobile App',
  'customer-experience': 'Customer Experience',
  // Industries
  cleaning: 'Cleaning Business',
  landscaping: 'Landscaping',
  'lawn-care': 'Lawn Care',
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  electrical: 'Electrical',
  'pest-control': 'Pest Control',
  'window-cleaning': 'Window Cleaning',
  'pool-service': 'Pool Service',
  handyman: 'Handyman',
}

export function tagLabel(slug: string): string {
  return (
    BLOG_TAG_LABELS[slug] ||
    slug
      .split('-')
      .map((w) => (w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ')
  )
}

/** All known tag slugs (for archive static params + the authoring guide). */
export const KNOWN_TAGS = Object.keys(BLOG_TAG_LABELS)
