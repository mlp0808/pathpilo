/**
 * Server-side translator for invoice content.
 *
 * Core principle: the language of an invoice (PDF + digital view +
 * outgoing client emails) is determined by the *company country*, NOT by
 * the admin user's UI language. An English-speaking owner of a Danish
 * company still sends Danish invoices with the label "Moms" — that is the
 * whole point of `language-for-the-company-country`.
 *
 * We reuse the same JSON dictionaries the frontend consumes
 * (`app/i18n/messages/en.json`, `da.json`) so labels on the PDF, the
 * digital link and the admin page can never drift apart.
 *
 * Adding a new locale:
 *   1) create `app/i18n/messages/<code>.json`
 *   2) add it to `bundles` below
 *   3) add the country→locale entry in `COUNTRY_LOCALE`
 */

const path = require('path');

// Both JSON files live one level above the api-server root, under
// `app/i18n/messages/`. We resolve the absolute path so the exact same
// dictionary is used regardless of cwd.
const MESSAGES_DIR = path.resolve(__dirname, '..', '..', 'app', 'i18n', 'messages');

// Loaded lazily but cached forever — these files change rarely and a
// restart picks them up anyway.
let _bundles = null;
function bundles() {
  if (_bundles) return _bundles;
  try {
    _bundles = {
      en: require(path.join(MESSAGES_DIR, 'en.json')),
      da: require(path.join(MESSAGES_DIR, 'da.json')),
    };
  } catch (e) {
    // If the frontend tree isn't present (e.g. running the api-server in
    // isolation), fall back to empty dictionaries — `t()` will then return
    // the key fallback. Don't crash the process.
    console.error('invoiceI18n: failed to load message bundles:', e.message);
    _bundles = { en: {}, da: {} };
  }
  return _bundles;
}

const DEFAULT_LOCALE = 'en';

// Map ISO-3166 alpha-2 country codes to the language the invoice should
// be rendered in. Anything not listed falls back to English.
const COUNTRY_LOCALE = {
  DK: 'da',
  // Rooms for future expansion without code changes elsewhere:
  // SE: 'sv', NO: 'nb', FI: 'fi', DE: 'de', NL: 'nl', FR: 'fr', ...
};

function normalizeLocale(value) {
  const v = String(value || '').toLowerCase();
  if (v.startsWith('da')) return 'da';
  if (v.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

function localeForCountry(countryCode) {
  if (!countryCode) return DEFAULT_LOCALE;
  return COUNTRY_LOCALE[String(countryCode).toUpperCase()] || DEFAULT_LOCALE;
}

function t(locale, key, fallback) {
  const loc = normalizeLocale(locale);
  const bs = bundles();
  const value =
    (bs[loc] && bs[loc][key]) ||
    (bs[DEFAULT_LOCALE] && bs[DEFAULT_LOCALE][key]) ||
    fallback ||
    key;
  return value;
}

// Render `{{name}}` placeholders in a translated string.
function tInterp(locale, key, values, fallback) {
  const tpl = t(locale, key, fallback);
  if (!values) return tpl;
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return String(values[name] == null ? '' : values[name]);
    }
    return '';
  });
}

module.exports = {
  t,
  tInterp,
  normalizeLocale,
  localeForCountry,
  DEFAULT_LOCALE,
};
