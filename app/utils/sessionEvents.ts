/**
 * Fired whenever the cached session (localStorage 'user'/'token') changes in
 * the background — e.g. a silent token refresh or a cross-tab company switch
 * — so mounted components (Sidebar, AppLayout, useUser) re-read it without a
 * full page reload.
 */
export const SESSION_UPDATED_EVENT = 'vevago:session-updated'
