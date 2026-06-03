const express = require('express');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { resolveCompanyIdForUser } = require('../utils/resolveCompanyId');

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
      ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS billing_interval       TEXT DEFAULT 'month';
  `);
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
      `SELECT plan, expires_at, stripe_customer_id, stripe_subscription_id, billing_interval
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
          interval: sub.items.data[0]?.plan?.interval ?? company.billing_interval ?? 'month',
        };
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
      `SELECT id, name, slug, plan, expires_at, stripe_customer_id, stripe_subscription_id
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

    // In-app Pro trial: charge starts when they subscribe — no second Stripe trial.
    const includeStripeTrial =
      company.plan !== 'pro' && !company.stripe_subscription_id;

    const sessionParams = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBase}${billingPath}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}${billingPath}?cancelled=true`,
      metadata: { companyId: String(company.id), interval },
      subscription_data: {
        metadata: { companyId: String(company.id) },
      },
      allow_promotion_codes: true,
    };

    if (includeStripeTrial) {
      sessionParams.subscription_data.trial_period_days = 14;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    const status = err.status || 500;
    res.status(status).json({ error: stripeErrorMessage(err) });
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
        if (session.mode !== 'subscription') break;

        const companyId = session.metadata?.companyId;
        const interval  = session.metadata?.interval ?? 'month';
        if (!companyId) break;

        await pool.query(
          `UPDATE companies
           SET plan = 'pro',
               stripe_customer_id     = $1,
               stripe_subscription_id = $2,
               billing_interval       = $3,
               expires_at             = NULL,
               suspended_at           = NULL
           WHERE id = $4`,
          [session.customer, session.subscription, interval, companyId]
        );
        console.log(`[stripe] ✅ Company ${companyId} upgraded to pro (${interval})`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

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
