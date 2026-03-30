const { DateTime } = require('luxon');

/**
 * Default IANA zone per ISO country (used when companies.timezone is not set).
 * Multi-zone countries use one representative default; users can override in Business settings.
 */
const IANA_TIMEZONE_BY_COUNTRY = {
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
};

function ianaTimezoneForCountry(countryCode) {
  const cc = String(countryCode || 'DK').toUpperCase();
  return IANA_TIMEZONE_BY_COUNTRY[cc] || 'Europe/Copenhagen';
}

function isValidIanaTimeZone(tz) {
  if (tz == null || typeof tz !== 'string') return false;
  const s = tz.trim();
  if (!s) return false;
  return DateTime.now().setZone(s).isValid;
}

/**
 * Stored DB value (may be null) + country → IANA zone for scheduling and emails.
 */
function normalizeCompanyTimezone(storedTimezone, countryCode) {
  const trimmed = storedTimezone != null ? String(storedTimezone).trim() : '';
  if (trimmed && isValidIanaTimeZone(trimmed)) return trimmed;
  return ianaTimezoneForCountry(countryCode);
}

module.exports = {
  IANA_TIMEZONE_BY_COUNTRY,
  ianaTimezoneForCountry,
  isValidIanaTimeZone,
  normalizeCompanyTimezone,
};
