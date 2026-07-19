/**
 * Industry landing-page data model.
 *
 * Each industry is a long-form, solution-focused sales page rendered by the
 * shared <IndustryLanding /> template. Content is plain, serialisable data so
 * adding a new trade (gardeners, cleaners, etc.) is just a new entry in
 * `INDUSTRIES` — no new layout code required.
 *
 * Icons and section visuals are referenced by string keys and mapped to real
 * components inside the template, keeping this file free of JSX.
 */

/** Heroicon keys mapped in the template's ICONS record. */
export type IconKey =
  | 'route'
  | 'clock'
  | 'chat'
  | 'invoice'
  | 'form'
  | 'phone'
  | 'calendar'
  | 'users'
  | 'bell'
  | 'card'
  | 'chart'
  | 'sparkles'
  | 'map'
  | 'check'

/** Built-in illustrated mockups for outcome rows. */
export type VisualKey = 'route' | 'sms' | 'invoice' | 'booking'

export interface IndustryOutcome {
  /** Small label above the heading, e.g. "More hours". */
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  /** Which illustrated mockup to show beside the copy. */
  visual: VisualKey
  /** Real product screenshot — when set, overrides the SVG mockup. */
  image?: string
  imageAlt?: string
  /**
   * When true the image is rendered as-is with no surrounding white card,
   * border, or drop-shadow. Use for UI screenshots that already carry their
   * own chrome (e.g. app window captures) or for lifestyle photos.
   */
  imagePlain?: boolean
  /** Real product video — takes priority over `image` when both are set. */
  video?: string
  videoPoster?: string
}

export interface IndustryStat {
  prefix?: string
  /** Numeric target for the count-up animation. */
  value: number
  suffix?: string
  label: string
  /** Render as a plain string instead of counting (e.g. "£0"). */
  display?: string
}

export interface IndustryTestimonial {
  quote: string
  name: string
  role: string
  location?: string
}

export interface IndustryFeature {
  icon: IconKey
  title: string
  text: string
}

export interface IndustryFaq {
  q: string
  a: string
}

export interface IndustryCalculator {
  /** Section eyebrow + heading + sub. */
  eyebrow: string
  title: string
  sub: string
  /** Slider config for jobs handled per day. */
  minJobs: number
  maxJobs: number
  defaultJobs: number
  /** Average value of one job, used for the revenue projection. */
  avgJobValue: number
  /** Currency symbol for projections. */
  currency: string
  /** Extra jobs/day unlocked is derived from time saved; this scales it. */
  extraJobsPerDay: number
  /** Working days per week used in the weekly/monthly projection. */
  daysPerWeek: number
}

/**
 * Localised string overrides for a specific locale (currently Danish).
 * All fields are optional — missing fields fall back to the English base.
 */
export interface IndustryTranslation {
  menuLabel?: string
  trade?: string
  menuBlurb?: string
  seoTitle?: string
  seoDescription?: string
  hero?: Partial<{
    eyebrow: string
    h1: string
    sub: string
    trustLine: string
    imageAlt: string
  }>
  trustBar?: { label: string; points: string[] }
  pain?: { title: string; sub: string; items: string[] }
  outcomes?: IndustryOutcome[]
  stats?: IndustryStat[]
  featureGrid?: { eyebrow: string; title: string; sub: string; items: IndustryFeature[] }
  testimonials?: { title: string; sub: string; items: IndustryTestimonial[] }
  freePlan?: { title: string; sub: string; includes: string[]; note: string }
  faq?: { title: string; sub: string; items: IndustryFaq[] }
  finalCta?: { title: string; sub: string }
  calculator?: IndustryCalculator
}

export interface Industry {
  /** URL slug under /industries/<slug> (SEO keyword-rich). */
  slug: string
  /** Short label used in the navigation megamenu. */
  menuLabel: string
  /** The trade in lower-case, used in body copy, e.g. "window cleaning". */
  trade: string
  /** One-liner shown in the megamenu under the label. */
  menuBlurb: string

  seoTitle: string
  seoDescription: string

  hero: {
    eyebrow: string
    h1: string
    sub: string
    trustLine: string
    /** Optional hero image path; falls back to a built-in illustration. */
    image?: string
    imageAlt?: string
  }

  trustBar: {
    label: string
    /** Compact proof points shown in the trust strip. */
    points: string[]
  }

  pain: {
    title: string
    sub: string
    items: string[]
  }

  outcomes: IndustryOutcome[]

  /** Omit to hide the revenue-calculator section on this page. */
  calculator?: IndustryCalculator

  stats: IndustryStat[]

  featureGrid: {
    eyebrow: string
    title: string
    sub: string
    items: IndustryFeature[]
  }

  testimonials: {
    title: string
    sub: string
    items: IndustryTestimonial[]
  }

  freePlan: {
    title: string
    sub: string
    includes: string[]
    note: string
  }

  faq: {
    title: string
    sub: string
    items: IndustryFaq[]
  }

  finalCta: {
    title: string
    sub: string
  }

  /**
   * Optional full-width photo break inserted between the Pain and Outcomes
   * sections. Use a real photo of the trade to add authenticity.
   */
  midpagePhoto?: {
    src: string
    alt: string
    /** Optional short caption shown beneath the image. */
    caption?: string
  }

  /**
   * Optional comparison table section.
   * Import type from lib/comparisons/types — kept optional so existing industry
   * entries that don't yet have comparison data don't need updating.
   */
  comparison?: import('../comparisons/types').ComparisonSection & {
    /** href of the full-detail comparison page, e.g. /comparisons/pathpilo-vs-jobber-window-cleaning */
    detailHref?: string
  }

  /** Danish locale overrides — merged on top of the English base at render time. */
  da?: IndustryTranslation
}
