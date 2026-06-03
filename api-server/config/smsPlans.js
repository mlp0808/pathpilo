// SMS add-on plan tiers. These mirror the public marketing pricing
// (marketing/app/pricing/page.tsx → SMS_TIERS) so the control panel and the
// website never drift apart. Prices are per month, GBP.
//
// `included` is the monthly SMS allowance bundled in the tier. Usage beyond the
// allowance is billed at `overageRate` per SMS segment (derived from the tier's
// per-message price so it stays consistent without a separate column to manage).

const SMS_CURRENCY = 'GBP';

const SMS_PLAN_TIERS = [
  { key: 'sms_500', label: '500 SMS', included: 500, price: 26 },
  { key: 'sms_1000', label: '1,000 SMS', included: 1000, price: 49 },
  { key: 'sms_2500', label: '2,500 SMS', included: 2500, price: 129 },
  { key: 'sms_5000', label: '5,000 SMS', included: 5000, price: 239 },
  { key: 'sms_7500', label: '7,500 SMS', included: 7500, price: 345 },
  { key: 'sms_10000', label: '10,000 SMS', included: 10000, price: 440 },
].map((t) => ({
  ...t,
  currency: SMS_CURRENCY,
  // Overage priced at the tier's effective per-SMS rate, rounded to 4 dp.
  overageRate: Math.round((t.price / t.included) * 10000) / 10000,
}));

const SMS_TIERS_BY_KEY = SMS_PLAN_TIERS.reduce((acc, tier) => {
  acc[tier.key] = tier;
  return acc;
}, {});

function getSmsTier(key) {
  if (!key) return null;
  return SMS_TIERS_BY_KEY[String(key)] || null;
}

module.exports = {
  SMS_CURRENCY,
  SMS_PLAN_TIERS,
  SMS_TIERS_BY_KEY,
  getSmsTier,
};
