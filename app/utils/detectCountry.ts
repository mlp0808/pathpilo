import { isSupportedCountry } from '@/app/config/countryRules'

/**
 * IANA zones that pin a visitor to one of the countries we support. Only zones
 * belonging to supported countries are listed — anything else falls through to
 * the browser language.
 */
const COUNTRY_BY_TIMEZONE: Record<string, string> = {
  'Europe/Copenhagen': 'DK',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Helsinki': 'FI',
  'Atlantic/Reykjavik': 'IS',
  'Europe/Berlin': 'DE',
  'Europe/Busingen': 'DE',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Luxembourg': 'LU',
  'Europe/Madrid': 'ES',
  'Africa/Ceuta': 'ES',
  'Atlantic/Canary': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT',
  'Atlantic/Madeira': 'PT',
  'Atlantic/Azores': 'PT',
  'Europe/Dublin': 'IE',
  'Europe/London': 'GB',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'America/Detroit': 'US',
  'America/Indiana/Indianapolis': 'US',
  'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA',
  'America/Winnipeg': 'CA',
  'America/Edmonton': 'CA',
  'America/Vancouver': 'CA',
  'America/Halifax': 'CA',
  'America/St_Johns': 'CA',
  'America/Regina': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Adelaide': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
  'Pacific/Auckland': 'NZ',
}

/** Zone prefixes used when the exact zone isn't in the table above. */
const COUNTRY_BY_ZONE_PREFIX: [string, string][] = [
  ['Australia/', 'AU'],
  ['America/Indiana/', 'US'],
  ['America/Kentucky/', 'US'],
  ['America/North_Dakota/', 'US'],
]

function fromTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (!zone) return null
    const exact = COUNTRY_BY_TIMEZONE[zone]
    if (exact) return exact
    const prefixed = COUNTRY_BY_ZONE_PREFIX.find(([prefix]) => zone.startsWith(prefix))
    return prefixed ? prefixed[1] : null
  } catch {
    return null
  }
}

function fromLanguage(): string | null {
  if (typeof navigator === 'undefined') return null
  const tags = [navigator.language, ...(navigator.languages || [])].filter(Boolean)
  for (const tag of tags) {
    // "en-IE" / "de-AT" carry a region; bare "en" does not.
    const region = String(tag).split('-')[1]
    if (region && /^[A-Za-z]{2}$/.test(region)) {
      const code = region.toUpperCase()
      if (isSupportedCountry(code)) return code
    }
  }
  return null
}

/**
 * Guess which supported country the visitor is in: edge geo header first, then
 * the browser's timezone, then its language region. Returns null when none of
 * them point at a country we support.
 */
export async function detectCountryCode(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('/api/geo', { signal, cache: 'no-store' })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const code = String(data?.country || '').toUpperCase()
      if (isSupportedCountry(code)) return code
    }
  } catch {
    /* offline or blocked — fall through to the local signals */
  }

  const zone = fromTimezone()
  if (zone && isSupportedCountry(zone)) return zone

  return fromLanguage()
}
