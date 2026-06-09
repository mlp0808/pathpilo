const crypto = require('crypto');
const { ianaTimezoneForCountry } = require('./companyTimezone');

const DEFAULT_GUEST_COUNTRY = 'GB';

/** Map marketing / UI language to a default ISO country code for new guest companies. */
function countryCodeFromLanguage(languageCode) {
  const lang = String(languageCode || 'en').trim().toLowerCase();
  if (lang.startsWith('da')) return 'DK';
  return DEFAULT_GUEST_COUNTRY;
}

/** Generate a unique guest slug + display name for a new company row. */
async function generateUniqueGuestCompany(client) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const guestId = crypto.randomBytes(4).toString('hex');
    const slug = `guest-${guestId}`;
    const check = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
    if (check.rows.length === 0) {
      return {
        slug,
        name: `Guest ${guestId}`,
        guestId,
        countryCode: DEFAULT_GUEST_COUNTRY,
      };
    }
  }
  const guestId = crypto.randomBytes(8).toString('hex');
  return {
    slug: `guest-${guestId}`,
    name: `Guest ${guestId}`,
    guestId,
    countryCode: DEFAULT_GUEST_COUNTRY,
  };
}

module.exports = {
  DEFAULT_GUEST_COUNTRY,
  countryCodeFromLanguage,
  generateUniqueGuestCompany,
  ianaTimezoneForCountry,
};
