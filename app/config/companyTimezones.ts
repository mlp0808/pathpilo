/** Mirrors api-server/utils/companyTimezone.js defaults for UI. */
const DEFAULT_TIMEZONE_BY_COUNTRY: Record<string, string> = {
  DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  FI: 'Europe/Helsinki',
  IS: 'Atlantic/Reykjavik',
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  FR: 'Europe/Paris',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  LU: 'Europe/Luxembourg',
  ES: 'Europe/Madrid',
  IT: 'Europe/Rome',
  PT: 'Europe/Lisbon',
  IE: 'Europe/Dublin',
  GB: 'Europe/London',
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  IN: 'Asia/Kolkata',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  ZA: 'Africa/Johannesburg',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  GR: 'Europe/Athens',
  TR: 'Europe/Istanbul',
  RO: 'Europe/Bucharest',
  HU: 'Europe/Budapest',
  BG: 'Europe/Sofia',
  HR: 'Europe/Zagreb',
  SI: 'Europe/Ljubljana',
  SK: 'Europe/Bratislava',
  EE: 'Europe/Tallinn',
  LV: 'Europe/Riga',
  LT: 'Europe/Vilnius',
}

export function getDefaultTimezoneForCountry(countryCode: string): string {
  const cc = String(countryCode || 'DK').toUpperCase()
  return DEFAULT_TIMEZONE_BY_COUNTRY[cc] || 'Europe/Copenhagen'
}

/** Curated lists for multi-zone countries; others use a single default entry. */
const EXTRA_OPTIONS: Record<string, { value: string; label: string }[]> = {
  US: [
    { value: 'America/New_York', label: 'Eastern (New York)' },
    { value: 'America/Chicago', label: 'Central (Chicago)' },
    { value: 'America/Denver', label: 'Mountain (Denver)' },
    { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
    { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
    { value: 'America/Anchorage', label: 'Alaska' },
    { value: 'Pacific/Honolulu', label: 'Hawaii' },
  ],
  CA: [
    { value: 'America/Toronto', label: 'Eastern (Toronto)' },
    { value: 'America/Winnipeg', label: 'Central (Winnipeg)' },
    { value: 'America/Edmonton', label: 'Mountain (Edmonton)' },
    { value: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  ],
  AU: [
    { value: 'Australia/Sydney', label: 'Sydney' },
    { value: 'Australia/Melbourne', label: 'Melbourne' },
    { value: 'Australia/Brisbane', label: 'Brisbane' },
    { value: 'Australia/Adelaide', label: 'Adelaide' },
    { value: 'Australia/Perth', label: 'Perth' },
  ],
}

export function getTimezoneChoicesForCountry(countryCode: string): { value: string; label: string }[] {
  const cc = String(countryCode || 'DK').toUpperCase()
  const extra = EXTRA_OPTIONS[cc]
  if (extra?.length) return extra
  const def = getDefaultTimezoneForCountry(cc)
  return [{ value: def, label: def.replace(/\//g, ' / ').replace(/_/g, ' ') }]
}

function getAllIanaTimeZones(): string[] {
  try {
    const IntlAny = Intl as { supportedValuesOf?: (k: string) => string[] }
    if (typeof IntlAny.supportedValuesOf === 'function') {
      return IntlAny.supportedValuesOf('timeZone')
    }
  } catch {
    /* ignore */
  }
  return []
}

/** Suggested options + full IANA list for advanced selection (deduped). */
export function getTimezoneSelectOptions(countryCode: string): {
  suggested: { value: string; label: string }[]
  otherZones: string[]
} {
  const suggested = getTimezoneChoicesForCountry(countryCode)
  const suggestedSet = new Set(suggested.map((s) => s.value))
  const all = getAllIanaTimeZones().filter((z) => !suggestedSet.has(z))
  return { suggested, otherZones: all.sort() }
}
