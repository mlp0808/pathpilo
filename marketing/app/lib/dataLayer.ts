/**
 * Google Tag Manager dataLayer — use with GTM triggers on custom event names.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

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
}

/** Fires once when a marketing feature page loads (route planning, subscriptions, team). */
export function pushFeaturePageView(featureKey: string, pagePath?: string) {
  pushToDataLayer({
    event: 'feature_page_view',
    feature_key: featureKey,
    ...(pagePath ? { page_path: pagePath } : {}),
  })
}
