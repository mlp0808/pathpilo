/**
 * GTM dataLayer helpers.
 *
 * We push structured events here. Pixels (Meta, GA4, etc.) are wired up
 * inside GTM — nothing is fired directly from the codebase.
 */

export function pushToDataLayer(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

/** Primary marketing CTAs (Get started, register, section buttons, etc.) */
export function pushCtaClick(args: {
  ctaType: 'primary' | 'secondary' | 'register' | 'login' | 'other'
  ctaLabel: string
  linkUrl: string
  /** Where the click happened, e.g. hero, cta_section, header, footer */
  location: string
  featureKey?: string
}) {
  pushToDataLayer({
    event: 'cta_click',
    cta_type: args.ctaType,
    cta_label: args.ctaLabel,
    link_url: args.linkUrl,
    location: args.location,
    ...(args.featureKey ? { feature_key: args.featureKey } : {}),
  })
  // GTM trigger: Custom Event = cta_click where cta_type = "register"
  // fires the Facebook "action_click" custom event via a Meta Pixel tag.
}

/** "Get started" / register button clicked anywhere on the site. */
export function pushActionClick(args: { label: string; location: string }) {
  pushToDataLayer({
    event: 'action_click',
    cta_label: args.label,
    location: args.location,
  })
}

/** Fires once when a marketing feature page loads (route planning, subscriptions, team). */
export function pushFeaturePageView(featureKey: string, pagePath?: string) {
  pushToDataLayer({
    event: 'feature_page_view',
    feature_key: featureKey,
    ...(pagePath ? { page_path: pagePath } : {}),
  })
}

const ENGAGED_MS = 30_000

/**
 * Fired once when the visitor has been on the page ≥30s AND has scrolled or
 * clicked at least once. GTM Custom Event name: `show_interest`.
 */
export function pushShowInterestEvent(payload?: { page_path?: string; interaction?: 'scroll' | 'click' }) {
  if (typeof window === 'undefined') return
  const pagePath = payload?.page_path ?? window.location.pathname
  pushToDataLayer({
    event: 'show_interest',
    engagement_seconds: ENGAGED_MS / 1000,
    page_path: pagePath,
    ...(payload?.interaction ? { first_interaction: payload.interaction } : {}),
  })
}
