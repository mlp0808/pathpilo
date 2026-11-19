/**
 * Cross-component plumbing for the in-app guides.
 *
 * Guide content itself lives in the database and is edited in the admin panel
 * (Admin → Guides); only the wiring that tells the banner "something changed"
 * and which pages count as visited belongs in the bundle.
 */

export type VisitKey =
  | 'clients'
  | 'services'
  | 'jobs'
  | 'map'
  | 'invoices'
  | 'pipeline'
  | 'offers'
  | 'team'
  | 'invoice_settings'
  | 'notifications_settings'

export const GUIDES_REFRESH_EVENT = 'pathpilo:missions-refresh'
export const GUIDES_OPEN_EVENT = 'pathpilo:guides-open'

/** Call after an action that might complete a guide step (new client, job, …). */
export function requestGuidesRefresh() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(GUIDES_REFRESH_EVENT))
}

/** Open the in-app guides panel (used by Get help, etc.). */
export function openGuidesPanel() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(GUIDES_OPEN_EVENT))
}

/**
 * Pages that count as "visited" for visit-based steps. Keys are the first path
 * segment after the company slug, or `segment/sub` for settings pages.
 */
export const PATH_TO_VISIT: Record<string, VisitKey> = {
  clients: 'clients',
  services: 'services',
  jobs: 'jobs',
  map: 'map',
  invoices: 'invoices',
  pipeline: 'pipeline',
  offers: 'offers',
  team: 'team',
  'settings/invoices': 'invoice_settings',
  'settings/notifications': 'notifications_settings',
}
