/**
 * Persisted map backdrop layer toggles (Clients / Employees).
 * Shared across every map mode on /[company]/map.
 */

const STORAGE_KEY = 'vevago:map-layer-prefs'

export type MapLayerPrefs = {
  clients: boolean
  employees: boolean
}

const DEFAULTS: MapLayerPrefs = { clients: true, employees: true }

export function readMapLayerPrefs(): MapLayerPrefs {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<MapLayerPrefs>
    return {
      clients: parsed.clients !== false,
      employees: parsed.employees !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeMapLayerPrefs(prefs: MapLayerPrefs): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clients: !!prefs.clients,
      employees: !!prefs.employees,
    }))
  } catch {
    /* ignore quota / private mode */
  }
}
