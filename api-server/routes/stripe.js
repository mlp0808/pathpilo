const express = require('express');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { resolveCompanyIdForUser } = require('../utils/resolveCompanyId');
const { getStripeBillingSnapshot, isStripeConfigured } = require('../utils/stripeBilling');
const { setSmsPlan, getSmsBillingSnapshot } = require('../utils/smsBilling');
const { SMS_PLAN_TIERS, getSmsTier, SMS_CURRENCY } = require('../config/smsPlans');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

function getAppBaseUrl() {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    'https://app.pathpilo.com';
  const trimmed = String(raw).trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripeErrorMessage(err) {
  if (!err) return 'Failed to create checkout session';
  if (err.message === 'STRIPE_SECRET_KEY is not configured') {
    return 'Billing is not configured on the server. Contact support.';
  }
  return err.message || 'Failed to create checkout session';
}

async function resolveOwnerEmail(pool, companyId) {
  const fromMembership = await pool.query(
    `SELECT u.email
     FROM users u
     INNER JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = $1
     WHERE uc.role = 'owner'
     LIMIT 1`,
    [companyId]
  );
  if (fromMembership.rows[0]?.email) return fromMembership.rows[0].email;

  const fromOwnerId = await pool.query(
    `SELECT u.email
     FROM companies c
     INNER JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1
     LIMIT 1`,
    [companyId]
  );
  return fromOwnerId.rows[0]?.email || undefined;
}

async function assertCompanyOwner(pool, userId, companyId) {
  const membership = await pool.query(
    `SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId]
  );
  if (membership.rows[0]?.role === 'owner') return;

  const owned = await pool.query(
    'SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2',
    [companyId, userId]
  );
  if (owned.rows.length > 0) return;

  const err = new Error('Only the company owner can manage billing');
  err.status = 403;
  throw err;
}

/** Apply a completed Checkout subscription session to the company row (webhook + return URL). */
async function applyCheckoutSessionToCompany(pool, session) {
  if (session.mode !== 'subscription') {
    return { applied: false, reason: 'not a subscription checkout' };
  }
  if (session.status !== 'complete') {
    return { applied: false, reason: 'checkout not complete' };
  }

  const companyId = session.metadata?.companyId;
  if (!companyId) {
    return { applied: false, reason: 'missing companyId metadata' };
  }

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!subscriptionId) {
    return { applied: false, reason: 'missing subscription id' };
  }

  const interval = session.metadata?.interval ?? 'month';
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;

  // Inspect the subscription to learn whether this is a trial (for trial_used + email).
  let isTrial = false;
  let trialEndIso = null;
  let amountMajor = null;
  let currency = 'gbp';
  try {
    const stripe = getStripe();
    const sub =
      session.subscription && typeof session.subscription === 'object'
        ? session.subscription
        : await stripe.subscriptions.retrieve(subscriptionId);
    isTrial = sub.status === 'trialing' || !!sub.trial_end;
    trialEndIso = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    const price = sub.items?.data?.[0]?.price;
    if (price?.unit_amount != null) amountMajor = price.unit_amount / 100;
    currency = sub.currency || price?.currency || 'gbp';
  } catch (e) {
    console.warn('[stripe] could not inspect subscription for trial flag:', e.message || e);
  }

  // Was this company already known to have used a trial before this checkout?
  const prevRow = await pool.query(
    `SELECT plan, trial_used, stripe_subscription_id FROM companies WHERE id = $1`,
    [companyId]
  );
  const alreadyHadSub = !!prevRow.rows[0]?.stripe_subscription_id;
  const trialAlreadyUsed = !!prevRow.rows[0]?.trial_used;

  await pool.query(
    `UPDATE companies
     SET plan = 'pro',
         stripe_customer_id     = COALESCE($1, stripe_customer_id),
         stripe_subscription_id = $2,
         billing_interval       = $3,
         expires_at             = NULL,
         suspended_at           = NULL,
         trial_used             = CASE WHEN $5 THEN true ELSE trial_used END,
         trial_used_at          = CASE WHEN $5 AND trial_used_at IS NULL THEN NOW() ELSE trial_used_at END
     WHERE id = $4`,
    [customerId || null, subscriptionId, interval, companyId, isTrial]
  );

  console.log(
    `[stripe] ✅ Company ${companyId} upgraded to pro (${interval})${isTrial ? ' [trial]' : ''}`
  );

  // Send "trial started" email only the first time a brand-new trial subscription begins.
  const isNewTrial = isTrial && !alreadyHadSub && !trialAlreadyUsed;
  if (isNewTrial) {
    sendTrialStartedEmailForCompany(pool, companyId, {
      trialEndIso,
      amount: amountMajor,
      currency,
      interval,
    }).catch((e) => console.error('[stripe] trial-started email failed:', e.message || e));
  }

  return { applied: true, companyId: Number(companyId), interval, subscriptionId, isTrial };
}

/** Look up the owner + company, then send the branded trial-started email. */
async function sendTrialStartedEmailForCompany(pool, companyId, billing) {
  try {
    const { sendTrialStartedEmail } = require('../utils/billingEmails');
    const r = await pool.query(
      `SELECT c.name AS company_name, c.slug, u.email AS owner_email, u.first_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = $1`,
      [companyId]
    );
    const row = r.rows[0];
    if (!row?.owner_email) return;

    const appBase = getAppBaseUrl();
    const billingUrl = row.slug ? `${appBase}/${row.slug}/settings/billing` : `${appBase}/settings/billing`;

    await sendTrialStartedEmail({
      to: row.owner_email,
      firstName: row.first_name,
      companyName: row.company_name,
      companyId,
      trialEndIso: billing.trialEndIso,
      amount: billing.amount,
      currency: (billing.currency || 'gbp').toUpperCase(),
      interval: billing.interval || 'month',
      billingUrl,
    });
  } catch (e) {
    console.error('[stripe] sendTrialStartedEmailForCompany error:', e.message || e);
  }
}

async function ensureStripeCustomer(stripe, pool, company, customerEmail) {
  let customerId = company.stripe_customer_id;

  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
      return customerId;
    } catch (err) {
      if (err?.code !== 'resource_missing') throw err;
      console.warn(`[stripe/checkout] stale customer ${customerId} for company ${company.id}, recreating`);
      customerId = null;
    }
  }

  const customer = await stripe.customers.create({
    email: customerEmail,
    name: company.name,
    metadata: { companyId: String(company.id) },
  });
  await pool.query(
    'UPDATE companies SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, company.id]
  );
  return customer.id;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Run once at startup – adds stripe columns to companies table if missing
async function initStripeSchema(pool) {
  await pool.query(`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
      ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
      ADD COLUMN IF NOT EXISTS billing_interval         TEXT DEFAULT 'month',
      ADD COLUMN IF NOT EXISTS trial_used               BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS trial_used_at            TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS stripe_sms_subscription_id TEXT;
  `);
}

/** A company is eligible for the 14-day free trial only if it has never used one. */
function isTrialEligible(company) {
  return !company.trial_used;
}

// ─── SMS add-on Stripe prices ───────────────────────────────────────────────
// Find-or-create a recurring monthly Stripe Price for an SMS tier. We key each
// price by a lookup_key so it's only ever created once and stays in sync.
async function resolveSmsPriceId(stripe, tier) {
  const lookupKey = `pathpilo_${tier.key}_monthly`;
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;

  const price = await stripe.prices.create({
    unit_amount: Math.round(Number(tier.price) * 100),
    currency: (tier.currency || SMS_CURRENCY).toLowerCase(),
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    product_data: { name: `PathPilo SMS — ${tier.label}` },
    metadata: { smsTier: tier.key, includedPerMonth: String(tier.included) },
  });
  return price.id;
}

// ─── Schema migration (called from server.js on startup) ────────────────────
// Note: exported at the bottom together with the router.

// ─── GET /api/stripe/subscription ───────────────────────────────────────────
// Returns the current billing status for the authenticated company.
router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const queryCompanyId = req.query?.companyId != null ? Number(req.query.companyId) : null;
    const companyId = await resolveCompanyIdForUser(
      pool,
      req.user,
      queryCompanyId || req.body?.companyId
    );
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    const result = await pool.query(
      `SELECT plan, expires_at, stripe_customer_id, stripe_subscription_id, billing_interval,
              trial_used
       FROM companies WHERE id = $1`,
      [companyId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });

    const company = result.rows[0];
    let subscription = null;

    if (company.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        subscription = {
          status: sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          interval: sub.items.data[0]?.plan?.interval ?? company.billing_interval ?? 'month',
        };
        if (sub.discount?.coupon) {
          const c = sub.discount.coupon;
          subscription.discount = {
            percentOff: c.percent_off ?? null,
            amountOff: c.amount_off != null ? c.amount_off / 100 : null,
            currency: c.currency ?? null,
            durationInMonths: c.duration_in_months ?? null,
            endsAt: sub.discount.end ? new Date(sub.discount.end * 1000).toISOString() : null,
          };
        }
      } catch {
        // Subscription may have been deleted in Stripe – treat as no subscription
      }
    }

    // Trial days remaining (for pro companies without a paid subscription)
    let trialDaysLeft = null;
    if (company.plan === 'pro' && !company.stripe_subscription_id && company.expires_at) {
      const msLeft = new Date(company.expires_at) - Date.now();
      trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    }

    res.json({
      plan: company.plan,
      trialDaysLeft,
      subscription,
      hasStripeCustomer: !!company.stripe_customer_id,
      trialUsed: !!company.trial_used,
      trialEligible: !company.trial_used,
    });
  } catch (err) {
    console.error('[stripe/subscription]', err);
    res.status(500).json({ error: 'Failed to retrieve subscription' });
  }
});

// ─── POST /api/stripe/checkout ──────────────────────────────────────────────
// Creates a Stripe Checkout session and returns the redirect URL.
// Body: { interval: 'month' | 'year' }
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const { interval = 'month', companySlug } = req.body;
    const userId = req.user?.userId ?? req.user?.id;

    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    await assertCompanyOwner(pool, userId, companyId);

    const priceId = interval === 'year'
      ? process.env.STRIPE_PRICE_ANNUAL
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return res.status(500).json({ error: `STRIPE_PRICE_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'} is not configured` });
    }

    const result = await pool.query(
      `SELECT id, name, slug, plan, expires_at, stripe_customer_id, stripe_subscription_id,
              trial_used
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });

    const company = result.rows[0];
    const customerEmail = await resolveOwnerEmail(pool, companyId);
    const customerId = await ensureStripeCustomer(stripe, pool, company, customerEmail);

    const slug = companySlug || company.slug;
    const billingPath = slug ? `/${slug}/settings/billing` : '/settings/billing';
    const appBase = getAppBaseUrl();

    // 14-day free trial only if the company has never used one (monthly OR annual).
    // Card is always collected up-front so we can auto-charge when the trial ends.
    const includeStripeTrial = isTrialEligible(company) && !company.stripe_subscription_id;

    const sessionParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBase}${billingPath}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}${billingPath}?cancelled=true`,
      metadata: { companyId: String(company.id), interval },
      // Always capture a payment method, even during the free trial.
      payment_method_collection: 'always',
      subscription_data: {
        metadata: { companyId: String(company.id) },
      },
      allow_promotion_codes: true,
    };

    if (includeStripeTrial) {
      sessionParams.subscription_data.trial_period_days = 14;
      // If a card can't be charged when the trial ends, cancel rather than leave unpaid.
      sessionParams.subscription_data.trial_settings = {
        end_behavior: { missing_payment_method: 'cancel' },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url, trial: includeStripeTrial });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    const status = err.status || 500;
    res.status(status).json({ error: stripeErrorMessage(err) });
  }
});

// ─── POST /api/stripe/confirm-checkout ───────────────────────────────────────
// Called when the user returns from Stripe Checkout. Upgrades the company even
// when webhooks cannot reach the server (e.g. local dev). Idempotent.
router.post('/confirm-checkout', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    await assertCompanyOwner(pool, userId, companyId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (String(session.metadata?.companyId) !== String(companyId)) {
      return res.status(403).json({ error: 'Checkout session does not belong to this company' });
    }

    const result = await applyCheckoutSessionToCompany(pool, session);
    if (!result.applied) {
      return res.status(400).json({ error: result.reason || 'Could not confirm checkout' });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[stripe/confirm-checkout]', err);
    res.status(500).json({ error: err.message || 'Failed to confirm checkout' });
  }
});

// ─── POST /api/stripe/portal ─────────────────────────────────────────────────
// Creates a Stripe Billing Portal session so the customer can manage their
// subscription, update payment method, or download invoices.
router.post('/portal', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;

    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    await assertCompanyOwner(pool, userId, companyId);

    const result = await pool.query(
      'SELECT stripe_customer_id FROM companies WHERE id = $1',
      [companyId]
    );
    const customerId = result.rows[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
    }

    const { companySlug } = req.body;
    const companyRow = await pool.query('SELECT slug FROM companies WHERE id = $1', [companyId]);
    const slug = companySlug || companyRow.rows[0]?.slug;
    const billingPath = slug ? `/${slug}/settings/billing` : '/settings/billing';
    const appBase = getAppBaseUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appBase}${billingPath}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/portal]', err);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// ─── GET /api/stripe/billing ─────────────────────────────────────────────────
// Full billing snapshot for the customer billing page: plan, subscription,
// card on file, upcoming + historical invoices.
router.get('/billing', authenticateToken, async (req, res) => {
  try {
    const queryCompanyId = req.query?.companyId != null ? Number(req.query.companyId) : null;
    const companyId = await resolveCompanyIdForUser(pool, req.user, queryCompanyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    const result = await pool.query(
      `SELECT id, plan, expires_at, trial_used, trial_used_at,
              stripe_customer_id, stripe_subscription_id, billing_interval
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });

    const company = result.rows[0];
    const snapshot = await getStripeBillingSnapshot(company);

    // In-app trial days left (only when there is no Stripe subscription)
    let trialDaysLeft = null;
    if (company.plan === 'pro' && !company.stripe_subscription_id && company.expires_at) {
      const msLeft = new Date(company.expires_at) - Date.now();
      trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    }

    res.json({
      plan: company.plan,
      billingInterval: company.billing_interval || 'month',
      trialUsed: !!company.trial_used,
      trialEligible: !company.trial_used,
      trialDaysLeft,
      ...snapshot,
    });
  } catch (err) {
    console.error('[stripe/billing]', err);
    res.status(500).json({ error: 'Failed to load billing details' });
  }
});

// ─── POST /api/stripe/update-payment-method ──────────────────────────────────
// Opens a Stripe Checkout session in 'setup' mode so the owner can add/replace
// the card on file. The new card is set as the default for the subscription.
router.post('/update-payment-method', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const result = await pool.query(
      'SELECT id, name, slug, stripe_customer_id, stripe_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const company = result.rows[0];
    if (!company?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Subscribe first.' });
    }

    const slug = req.body?.companySlug || company.slug;
    const billingPath = slug ? `/${slug}/settings/billing` : '/settings/billing';
    const appBase = getAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: company.stripe_customer_id,
      payment_method_types: ['card'],
      success_url: `${appBase}${billingPath}?card_updated=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}${billingPath}?card_cancelled=true`,
      metadata: {
        companyId: String(company.id),
        purpose: 'update_payment_method',
        subscriptionId: company.stripe_subscription_id || '',
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/update-payment-method]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to start card update' });
  }
});

// ─── POST /api/stripe/confirm-card-update ────────────────────────────────────
// Called on return from the setup-mode Checkout; attaches the new card as the
// subscription + customer default so future charges use it.
router.post('/confirm-card-update', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent'],
    });
    if (String(session.metadata?.companyId) !== String(companyId)) {
      return res.status(403).json({ error: 'Session does not belong to this company' });
    }

    const setupIntent = session.setup_intent;
    const paymentMethodId =
      typeof setupIntent === 'object' ? setupIntent?.payment_method : null;
    if (!paymentMethodId) {
      return res.status(400).json({ error: 'No payment method found on this session' });
    }

    const companyRow = await pool.query(
      'SELECT stripe_customer_id, stripe_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const { stripe_customer_id: customerId, stripe_subscription_id: subscriptionId } =
      companyRow.rows[0] || {};

    // Make the new card the customer's default + the subscription's default.
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[stripe/confirm-card-update]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update card' });
  }
});

// ─── POST /api/stripe/cancel ─────────────────────────────────────────────────
// Schedules cancellation at period end (keeps access until then). Inline cancel.
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const result = await pool.query(
      'SELECT stripe_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const subscriptionId = result.rows[0]?.stripe_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'No active subscription to cancel' });

    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      success: true,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[stripe/cancel]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to cancel subscription' });
  }
});

// ─── POST /api/stripe/resume ─────────────────────────────────────────────────
// Undo a scheduled cancellation (before the period actually ends).
router.post('/resume', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const result = await pool.query(
      'SELECT stripe_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const subscriptionId = result.rows[0]?.stripe_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'No subscription found' });

    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    res.json({ success: true, cancelAtPeriodEnd: sub.cancel_at_period_end });
  } catch (err) {
    console.error('[stripe/resume]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to resume subscription' });
  }
});

// ─── GET /api/stripe/sms ─────────────────────────────────────────────────────
// SMS add-on state for the billing page: available tiers, current plan, usage,
// and the live Stripe subscription status (cancel / renewal).
router.get('/sms', authenticateToken, async (req, res) => {
  try {
    const queryCompanyId = req.query?.companyId != null ? Number(req.query.companyId) : null;
    const companyId = await resolveCompanyIdForUser(pool, req.user, queryCompanyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    const result = await pool.query(
      'SELECT id, stripe_customer_id, stripe_sms_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });
    const company = result.rows[0];

    const sms = await getSmsBillingSnapshot(pool, companyId);

    let subscription = null;
    if (company.stripe_sms_subscription_id && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(company.stripe_sms_subscription_id);
        subscription = {
          status: sub.status,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        };
      } catch {
        /* subscription may have been removed in Stripe */
      }
    }

    res.json({
      configured: isStripeConfigured(),
      hasCustomer: !!company.stripe_customer_id,
      currency: SMS_CURRENCY,
      tiers: SMS_PLAN_TIERS.map((t) => ({
        key: t.key,
        label: t.label,
        included: t.included,
        price: t.price,
        currency: t.currency,
      })),
      sms,
      subscription,
    });
  } catch (err) {
    console.error('[stripe/sms]', err);
    res.status(500).json({ error: 'Failed to load SMS plan' });
  }
});

// ─── POST /api/stripe/sms-checkout ───────────────────────────────────────────
// Subscribe to (or switch) an SMS tier. No free trial. If there's already an SMS
// subscription, we switch the tier in place (card on file, prorated). Otherwise
// we return a Checkout URL to collect a card and start the SMS subscription.
router.post('/sms-checkout', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const tier = getSmsTier(req.body?.tierKey);
    if (!tier) return res.status(400).json({ error: 'Unknown SMS tier' });

    const result = await pool.query(
      'SELECT id, name, slug, stripe_customer_id, stripe_sms_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const company = result.rows[0];
    const customerEmail = await resolveOwnerEmail(pool, companyId);
    const customerId = await ensureStripeCustomer(stripe, pool, company, customerEmail);

    const priceId = await resolveSmsPriceId(stripe, tier);

    // Already subscribed → switch the tier in place (no new card needed).
    if (company.stripe_sms_subscription_id) {
      try {
        const current = await stripe.subscriptions.retrieve(company.stripe_sms_subscription_id);
        if (['active', 'past_due', 'trialing'].includes(current.status)) {
          const itemId = current.items.data[0]?.id;
          await stripe.subscriptions.update(company.stripe_sms_subscription_id, {
            cancel_at_period_end: false,
            items: [{ id: itemId, price: priceId }],
            proration_behavior: 'create_prorations',
            metadata: { companyId: String(companyId), smsTier: tier.key },
          });
          await setSmsPlan(pool, companyId, tier.key);
          return res.json({ updated: true });
        }
      } catch (e) {
        console.warn('[stripe/sms-checkout] existing sub switch failed, falling back to checkout:', e.message);
      }
    }

    const slug = req.body?.companySlug || company.slug;
    const billingPath = slug ? `/${slug}/settings/billing` : '/settings/billing';
    const appBase = getAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBase}${billingPath}?sms_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}${billingPath}?sms_cancelled=true`,
      payment_method_collection: 'always',
      metadata: { companyId: String(companyId), smsTier: tier.key },
      subscription_data: { metadata: { companyId: String(companyId), smsTier: tier.key } },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/sms-checkout]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to start SMS checkout' });
  }
});

// ─── POST /api/stripe/confirm-sms-checkout ───────────────────────────────────
// Called on return from SMS Checkout (also covered by the webhook in production).
router.post('/confirm-sms-checkout', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (String(session.metadata?.companyId) !== String(companyId)) {
      return res.status(403).json({ error: 'Session does not belong to this company' });
    }
    const tierKey = session.metadata?.smsTier;
    const tier = getSmsTier(tierKey);
    if (!tier) return res.status(400).json({ error: 'Not an SMS checkout session' });
    if (session.status !== 'complete') return res.status(400).json({ error: 'Checkout not complete' });

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const customerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;

    await pool.query(
      `UPDATE companies
       SET stripe_sms_subscription_id = $1,
           stripe_customer_id = COALESCE($2, stripe_customer_id)
       WHERE id = $3`,
      [subscriptionId || null, customerId || null, companyId]
    );
    await setSmsPlan(pool, companyId, tier.key, { resetPeriod: true });

    res.json({ success: true });
  } catch (err) {
    console.error('[stripe/confirm-sms-checkout]', err);
    res.status(500).json({ error: err.message || 'Failed to confirm SMS plan' });
  }
});

// ─── POST /api/stripe/sms-cancel ─────────────────────────────────────────────
// Cancel (or resume) the SMS subscription at period end. Allowance stays until
// the period actually ends.
router.post('/sms-cancel', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const userId = req.user?.userId ?? req.user?.id;
    const companyId = await resolveCompanyIdForUser(pool, req.user, req.body?.companyId);
    if (!companyId) return res.status(404).json({ error: 'Company not found' });
    await assertCompanyOwner(pool, userId, companyId);

    const result = await pool.query(
      'SELECT stripe_sms_subscription_id FROM companies WHERE id = $1',
      [companyId]
    );
    const subscriptionId = result.rows[0]?.stripe_sms_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'No SMS subscription found' });

    const resume = !!req.body?.resume;
    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !resume,
    });

    res.json({
      success: true,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[stripe/sms-cancel]', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update SMS subscription' });
  }
});

// ─── POST /api/stripe/webhook ────────────────────────────────────────────────
// Receives Stripe webhook events.
// NOTE: This route must receive the RAW request body (Buffer), not the parsed
// JSON. The raw body middleware is applied in server.js before express.json().
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // SMS add-on subscription vs. main Pro subscription.
        if (session.metadata?.smsTier) {
          const companyId = session.metadata.companyId;
          const tier = getSmsTier(session.metadata.smsTier);
          if (companyId && tier) {
            const subId =
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id;
            await pool.query(
              `UPDATE companies SET stripe_sms_subscription_id = $1 WHERE id = $2`,
              [subId || null, companyId]
            );
            await setSmsPlan(pool, companyId, tier.key, { resetPeriod: true });
            console.log(`[stripe] Company ${companyId} SMS plan ${tier.key} activated`);
          }
        } else {
          await applyCheckoutSessionToCompany(pool, session);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;
        // SMS add-on changes must not touch the Pro plan / billing interval.
        if (sub.metadata?.smsTier) break;

        // Handle cancellation scheduled at period end: leave plan active until then
        if (sub.cancel_at_period_end) {
          await pool.query(
            `UPDATE companies SET billing_interval = $1 WHERE id = $2`,
            [sub.items.data[0]?.plan?.interval ?? 'month', companyId]
          );
        }

        // Subscription was cancelled mid-period (status = 'canceled') – demote
        if (sub.status === 'canceled') {
          await pool.query(
            `UPDATE companies
             SET plan = 'standard',
                 stripe_subscription_id = NULL,
                 expires_at             = NULL
             WHERE id = $1`,
            [companyId]
          );
          console.log(`[stripe] Company ${companyId} subscription cancelled – demoted to standard`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

        // SMS add-on subscription ended → cancel the SMS plan, leave Pro alone.
        if (sub.metadata?.smsTier) {
          await pool.query(
            `UPDATE companies SET stripe_sms_subscription_id = NULL WHERE id = $1`,
            [companyId]
          );
          await setSmsPlan(pool, companyId, null);
          console.log(`[stripe] Company ${companyId} SMS plan ended`);
          break;
        }

        await pool.query(
          `UPDATE companies
           SET plan = 'standard',
               stripe_subscription_id = NULL,
               expires_at             = NULL
           WHERE id = $1`,
          [companyId]
        );
        console.log(`[stripe] Company ${companyId} subscription deleted – demoted to standard`);
        break;
      }

      case 'invoice.payment_failed': {
        // Optional: you could notify the company owner via email here
        const invoice = event.data.object;
        console.warn(`[stripe] Payment failed for customer ${invoice.customer}`);
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[stripe/webhook] Handler error:', err);
    res.status(500).send('Webhook handler error');
  }
});

router.initStripeSchema = initStripeSchema;
module.exports = router;
