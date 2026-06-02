export const TAWK_DISMISSED_KEY = 'pathpilo_tawk_dismissed'
export const HELP_CENTER_URL = 'https://help.pathpilo.com'

export function isTawkDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(TAWK_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Remove Tawk scripts/widgets from the DOM so it cannot reappear this session. */
export function teardownTawkWidget() {
  if (typeof window === 'undefined') return

  try {
    const api = window.Tawk_API
    if (api && typeof api.hideWidget === 'function') {
      api.hideWidget()
    }
  } catch {
    // ignore
  }

  const selectors = [
    '#tawk-bubble-container',
    '#tawk-chat-container',
    '#tawk-tooltip-container',
    '.tawk-min-container',
    '.tawk-max-container',
    '.tawk-message-preview',
    'iframe[src*="tawk.to"]',
    'iframe[src*="embed.tawk"]',
  ]

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => el.remove())
  }

  document.querySelectorAll('script[src*="tawk.to"]').forEach((el) => el.remove())

  try {
    delete window.Tawk_API
  } catch {
    window.Tawk_API = undefined
  }
}

export function dismissTawkPermanently() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TAWK_DISMISSED_KEY, '1')
  } catch {
    // ignore
  }
  teardownTawkWidget()
}
