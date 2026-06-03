/** Set in .env to enable live chat. Remove or leave empty to disable Crisp everywhere. */
export const CRISP_WEBSITE_ID =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID?.trim()) || ''

export function isCrispEnabled(): boolean {
  return CRISP_WEBSITE_ID.length > 0
}

export const CRISP_DISMISSED_KEY = 'pathpilo_crisp_dismissed'
export const HELP_CENTER_URL = 'https://help.pathpilo.com'
export const CRISP_READY_EVENT = 'pathpilo-crisp-ready'

export function isCrispDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(CRISP_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function teardownCrispWidget() {
  if (typeof window === 'undefined') return

  try {
    const crisp = window.$crisp
    if (crisp) {
      crisp.push(['do', 'chat:hide'])
      crisp.push(['do', 'chat:close'])
      crisp.push(['do', 'session:reset'])
    }
  } catch {
    // ignore
  }

  const selectors = [
    '#crisp-chatbox',
    '.crisp-client',
    'iframe[src*="crisp.chat"]',
    'a[href*="crisp.chat"]',
  ]

  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => el.remove())
  }

  document.querySelectorAll('script[src*="crisp.chat"]').forEach((el) => el.remove())

  try {
    delete window.$crisp
    delete window.CRISP_WEBSITE_ID
  } catch {
    window.$crisp = []
  }
}

export function dismissCrispPermanently() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CRISP_DISMISSED_KEY, '1')
  } catch {
    // ignore
  }
  teardownCrispWidget()
}
