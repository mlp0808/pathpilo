/**
 * Stripe Coupons + Promotion Codes for admin-created discounts.
 *
 * Use duration: 'repeating' + duration_in_months so customers enter the code once
 * at checkout and Stripe applies the discount for N billing periods automatically.
 */

const Stripe = require('stripe');

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

async function resolveBillingProducts() {
  const stripe = getStripe();
  const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY;
  const annualPriceId = process.env.STRIPE_PRICE_ANNUAL;

  const out = { monthly: null, annual: null };
  if (monthlyPriceId) {
    const price = await stripe.prices.retrieve(monthlyPriceId);
    out.monthly = {
      priceId: monthlyPriceId,
      productId: typeof price.product === 'string' ? price.product : price.product?.id,
    };
  }
  if (annualPriceId) {
    const price = await stripe.prices.retrieve(annualPriceId);
    out.annual = {
      priceId: annualPriceId,
      productId: typeof price.product === 'string' ? price.product : price.product?.id,
    };
  }
  return out;
}

function formatPromotionCode(promo) {
  const coupon = promo.coupon && typeof promo.coupon === 'object' ? promo.coupon : null;
  return {
    id: promo.id,
    code: promo.code,
    active: promo.active,
    maxRedemptions: promo.max_redemptions,
    timesRedeemed: promo.times_redeemed ?? 0,
    createdAt: promo.created ? new Date(promo.created * 1000).toISOString() : null,
    coupon: coupon
      ? {
          id: coupon.id,
          name: coupon.name || null,
          percentOff: coupon.percent_off ?? null,
          amountOff: coupon.amount_off != null ? coupon.amount_off / 100 : null,
          currency: coupon.currency || null,
          duration: coupon.duration,
          durationInMonths: coupon.duration_in_months ?? null,
          appliesTo: coupon.metadata?.appliesTo || 'both',
          valid: coupon.valid,
        }
      : null,
  };
}

async function listPromotionCodes() {
  const stripe = getStripe();
  const all = [];
  let startingAfter;

  for (let page = 0; page < 20; page += 1) {
    const batch = await stripe.promotionCodes.list({
      limit: 100,
      expand: ['data.coupon'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...batch.data);
    if (!batch.has_more) break;
    startingAfter = batch.data[batch.data.length - 1]?.id;
  }

  return all
    .map(formatPromotionCode)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

async function createPromotionCode({
  code,
  percentOff,
  amountOff,
  currency = 'gbp',
  durationMonths,
  appliesTo = 'month',
  maxRedemptions,
  name,
}) {
  const stripe = getStripe();
  const normalizedCode = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!normalizedCode || !/^[A-Z0-9_-]{3,40}$/.test(normalizedCode)) {
    const err = new Error('Code must be 3–40 characters (letters, numbers, dash, underscore)');
    err.status = 400;
    throw err;
  }

  const months = Math.max(1, Math.min(36, Math.round(Number(durationMonths) || 1)));
  const pct = percentOff != null && percentOff !== '' ? Number(percentOff) : null;
  const amt = amountOff != null && amountOff !== '' ? Number(amountOff) : null;

  if (pct != null && Number.isFinite(pct) && pct > 0 && pct <= 100) {
    // percent discount
  } else if (amt != null && Number.isFinite(amt) && amt > 0) {
    // fixed amount discount
  } else {
    const err = new Error('Enter a valid percent off (1–100) or fixed amount off');
    err.status = 400;
    throw err;
  }

  const interval = appliesTo === 'year' ? 'year' : appliesTo === 'month' ? 'month' : 'both';
  const products = await resolveBillingProducts();

  const couponParams = {
    duration: 'repeating',
    duration_in_months: months,
    name:
      name?.trim() ||
      (pct
        ? `${pct}% off for ${months} billing period${months === 1 ? '' : 's'}`
        : `£${amt} off for ${months} billing period${months === 1 ? '' : 's'}`),
    metadata: {
      appliesTo: interval,
      createdBy: 'pathpilo-admin',
    },
  };

  if (pct != null && pct > 0) {
    couponParams.percent_off = pct;
  } else {
    couponParams.amount_off = Math.round(amt * 100);
    couponParams.currency = String(currency || 'gbp').toLowerCase();
  }

  if (interval === 'month' && products.monthly?.productId) {
    couponParams.applies_to = { products: [products.monthly.productId] };
  } else if (interval === 'year' && products.annual?.productId) {
    couponParams.applies_to = { products: [products.annual.productId] };
  }

  const coupon = await stripe.coupons.create(couponParams);

  const promoParams = {
    coupon: coupon.id,
    code: normalizedCode,
    active: true,
    metadata: { appliesTo: interval },
  };
  if (maxRedemptions != null && maxRedemptions !== '') {
    const max = Math.max(1, Math.round(Number(maxRedemptions)));
    if (Number.isFinite(max)) promoParams.max_redemptions = max;
  }

  const promo = await stripe.promotionCodes.create(promoParams);
  const expanded = await stripe.promotionCodes.retrieve(promo.id, { expand: ['coupon'] });
  return formatPromotionCode(expanded);
}

async function deactivatePromotionCode(promotionCodeId) {
  const stripe = getStripe();
  const updated = await stripe.promotionCodes.update(promotionCodeId, { active: false });
  const expanded = await stripe.promotionCodes.retrieve(updated.id, { expand: ['coupon'] });
  return formatPromotionCode(expanded);
}

module.exports = {
  listPromotionCodes,
  createPromotionCode,
  deactivatePromotionCode,
  resolveBillingProducts,
};
