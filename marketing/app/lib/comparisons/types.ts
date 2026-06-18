export interface CompetitorRow {
  /** Feature or criteria label */
  feature: string
  pathpilo: string | boolean
  [key: string]: string | boolean
}

export interface Competitor {
  /** Used as column key */
  id: string
  name: string
  /** One-line positioning */
  tagline: string
  /** Starting price (monthly, no commitment) */
  startingPrice: string
  /** Whether there is a true free plan (not just a trial) */
  hasFreePlan: boolean
  /** URL to their pricing page — for transparency */
  pricingUrl: string
}

export interface ComparisonSection {
  title: string
  sub: string
  /** Small legal/transparency note */
  disclaimer: string
  competitors: Competitor[]
  rows: CompetitorRow[]
}

export interface ComparisonPageProsCons {
  pros: string[]
  cons: string[]
}

export interface ComparisonFaq {
  q: string
  a: string
}

export interface ComparisonPage {
  slug: string
  seoTitle: string
  seoDescription: string
  /** e.g. "PathPilo vs Jobber for Window Cleaners" */
  headline: string
  sub: string
  /** ISO date — shown as "last updated" for freshness signal */
  lastUpdated: string
  verdict: string
  competitors: Competitor[]
  sections: {
    id: string
    title: string
    body: string
    /** Optional per-competitor notes */
    notes?: Record<string, string>
  }[]
  pricingBreakdown: {
    title: string
    rows: {
      label: string
      pathpilo: string
      [key: string]: string
    }[]
    note: string
  }
  prosCons: {
    pathpilo: ComparisonPageProsCons
    [key: string]: ComparisonPageProsCons
  }
  whoShouldChoose: {
    pathpilo: string
    [key: string]: string
  }
  faq: ComparisonFaq[]
}
