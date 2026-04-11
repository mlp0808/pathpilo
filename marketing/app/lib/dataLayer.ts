/**
 * Google Tag Manager dataLayer — use with GTM triggers on custom event names.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    fbq?: (...args: unknown[]) => void
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

const ENGAGED_MS = 30_000

export function pushMetaCustomEvent(eventName: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  window.fbq('trackCustom', eventName, payload || {})
}

/**
 * Fired once when the visitor has been on the page ≥30s and has scrolled or clicked at least once.
 * GTM: Custom Event name `show_interest`. Meta: `trackCustom('show_interest', …)`.
 */
export function pushShowInterestEvent(payload?: { page_path?: string; interaction?: 'scroll' | 'click' }) {
  if (typeof window === 'undefined') return
  const pagePath = payload?.page_path ?? window.location.pathname
  const metaPayload: Record<string, unknown> = {
    engagement_seconds: ENGAGED_MS / 1000,
    page_path: pagePath,
    ...(payload?.interaction ? { first_interaction: payload.interaction } : {}),
  }
  pushToDataLayer({
    event: 'show_interest',
    ...metaPayload,
  })
  pushMetaCustomEvent('show_interest', metaPayload)
}
