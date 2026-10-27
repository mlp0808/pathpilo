const countryData = require('../../shared/countries.json');

const DEFAULT_COUNTRY_CODE = countryData.defaultCountry;
const SUPPORTED_COUNTRY_CODES = Object.keys(countryData.countries);

function getCountry(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return countryData.countries[code] || null;
}

function isSupportedCountry(countryCode) {
  return Boolean(getCountry(countryCode));
}

/** Company country or the default; never returns an unsupported code. */
function resolveCountry(countryCode) {
  return getCountry(countryCode) || countryData.countries[DEFAULT_COUNTRY_CODE];
}

function countryNameFor(countryCode) {
  return getCountry(countryCode)?.name || null;
}

function currencyForCountry(countryCode) {
  return resolveCountry(countryCode).currency;
}

function defaultTaxRateForCountry(countryCode) {
  return resolveCountry(countryCode).tax.defaultRate;
}

function documentTaxLabelForCountry(countryCode) {
  return resolveCountry(countryCode).tax.documentLabel;
}

function displayLocaleForCountry(countryCode) {
  return resolveCountry(countryCode).locale;
}

/** Date locale for customer documents: the document language, written the country's way. */
function documentDateLocale(countryCode) {
  const country = resolveCountry(countryCode);
  if (country.invoiceLocale === 'da') return 'da-DK';
  return String(countryCode || '').toUpperCase() === 'US' ? 'en-US' : 'en-GB';
}

function timezoneForCountry(countryCode) {
  return resolveCountry(countryCode).timezone;
}

function bankSchemeForCountry(countryCode) {
  return resolveCountry(countryCode).bank;
}

/** Uppercase 2-letter state code when the country uses states and the value is valid, else ''. */
function normalizeState(countryCode, state) {
  const states = getCountry(countryCode)?.address?.states;
  const raw = String(state || '').trim();
  if (!raw || !Array.isArray(states)) return '';
  const upper = raw.toUpperCase();
  const byCode = states.find(([code]) => code === upper);
  if (byCode) return byCode[0];
  const byName = states.find(([, name]) => name.toUpperCase() === upper);
  return byName ? byName[0] : '';
}

/**
 * The postal line after the street, written the way the country does it:
 * "2100 Copenhagen", "London SW1A 1AA", "Austin, TX 78701".
 */
function formatLocality({ zip, city, state } = {}, countryCode) {
  const format = resolveCountry(countryCode).address.localityFormat;
  return format
    .replace('{zip}', String(zip || '').trim())
    .replace('{city}', String(city || '').trim())
    .replace('{state}', String(state || '').trim())
    .replace(/,\s*(?=,|$)/g, '')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatAddressLine({ address, zip, city, state } = {}, countryCode) {
  const street = String(address || '').trim();
  const locality = formatLocality({ zip, city, state }, countryCode);
  if (street && locality) return `${street}, ${locality}`;
  return street || locality;
}

/**
 * Money with decimals, written the company country's way ("1.234,56 kr.", "£1,234.56", "$1,234.56").
 * `pdfSafe` swaps characters the built-in PDF fonts can't draw (U+2212 minus, U+202F space).
 */
function formatMoneyForCountry(amount, currency, countryCode, { pdfSafe = false } = {}) {
  const n = Number(amount) || 0;
  const cur = currency || currencyForCountry(countryCode);
  let out;
  try {
    out = new Intl.NumberFormat(displayLocaleForCountry(countryCode), {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    out = `${n.toFixed(2)} ${cur}`;
  }
  return pdfSafe ? out.replace(/\u2212/g, '-').replace(/[\u202F\u2009]/g, ' ') : out;
}

function vatNumberLabelForCountry(countryCode) {
  return getCountry(countryCode)?.vatNumber?.label || 'VAT no.';
}

module.exports = {
  DEFAULT_COUNTRY_CODE,
  formatMoneyForCountry,
  vatNumberLabelForCountry,
  SUPPORTED_COUNTRY_CODES,
  getCountry,
  isSupportedCountry,
  resolveCountry,
  countryNameFor,
  currencyForCountry,
  defaultTaxRateForCountry,
  documentTaxLabelForCountry,
  displayLocaleForCountry,
  documentDateLocale,
  timezoneForCountry,
  bankSchemeForCountry,
  normalizeState,
  formatLocality,
  formatAddressLine,
};
