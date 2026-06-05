// Shared Stripe helpers for the admin control panel (read-only view).
//
// Stripe is the source of truth for subscriptions and invoices — we don't store
// invoice history locally. These helpers fetch a live snapshot for a company
// and degrade gracefully when Stripe isn't configured or the company has no
// Stripe customer yet (e.g. trials and comped pro grants).

const Stripe = require('stripe');

let cachedStripe = null;

function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!cachedStripe) {
    cachedStripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return cachedStripe;
}

function toIso(unixSeconds) {
  if (!unixSeconds && unixSeconds !== 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function money(amount, currency) {
  if (amount == null) return null;
  return {
    amount: amount / 100,
    currency: (currency || 'gbp').toUpperCase(),
  };
}

function mapInvoice(inv) {
  return {
    id: inv.id,
    number: inv.number || null,
    status: inv.status, // draft | open | paid | uncollectible | void
    paid: !!inv.paid,
    amountDue: money(inv.amount_due, inv.currency),
    amountPaid: money(inv.amount_paid, inv.currency),
    total: money(inv.total, inv.currency),
    created: toIso(inv.created),
    periodStart: toIso(inv.period_start),
    periodEnd: toIso(inv.period_end),
    dueDate: toIso(inv.due_date),
    hostedInvoiceUrl: inv.hosted_invoice_url || null,
    invoicePdf: inv.invoice_pdf || null,
  };
}

/** Map a Stripe PaymentMethod (card) to a small UI-safe object. */
function mapCard(pm) {
  if (!pm || !pm.card) return null;
  return {
    id: pm.id,
    brand: pm.card.brand || null, // visa | mastercard | amex ...
    last4: pm.card.last4 || null,
    expMonth: pm.card.exp_month || null,
    expYear: pm.card.exp_year || null,
    wallet: pm.card.wallet?.type || null,
  };
}

/** Resolve the customer's default card: subscription PM → customer default → first card on file. */
async function resolveDefaultCard(stripe, customerId, subscription) {
  // 1. Subscription default payment method
  const subPm = subscription?.default_payment_method;
  if (subPm && typeof subPm === 'object' && subPm.card) {
    return mapCard(subPm);
  }
  if (typeof subPm === 'string') {
    try {
      return mapCard(await stripe.paymentMethods.retrieve(subPm));
    } catch (_) { /* fall through */ }
  }

  // 2. Customer invoice_settings.default_payment_method
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    const defPm = customer?.invoice_settings?.default_payment_method;
    if (defPm && typeof defPm === 'object' && defPm.card) {
      return mapCard(defPm);
    }
  } catch (_) { /* fall through */ }

  // 3. First card attached to the customer
  try {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
    if (list.data?.[0]) return mapCard(list.data[0]);
  } catch (_) { /* ignore */ }

  return null;
}

/**
 * Build a billing snapshot for a company from Stripe.
 * @param {object} company - row with stripe_customer_id, stripe_subscription_id, billing_interval
 * @returns {Promise<object>} snapshot (never throws; errors captured in `error`)
 */
async function getStripeBillingSnapshot(company) {
  const snapshot = {
    configured: isStripeConfigured(),
    hasCustomer: !!company.stripe_customer_id,
    customerId: company.stripe_customer_id || null,
    subscription: null,
    nextInvoice: null,
    upcomingInvoice: null,
    card: null,
    invoices: [],
    error: null,
  };

  if (!snapshot.configured || !company.stripe_customer_id) {
    return snapshot;
  }

  try {
    const stripe = getStripe();
    let subscription = null;

    // Subscription (live status, current period, amount)
    if (company.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id, {
          expand: ['default_payment_method', 'discount'],
        });
        subscription = sub;
        const item = sub.items?.data?.[0];
        const price = item?.price;
        const quantity = item?.quantity || 1;
        const unitAmount = price?.unit_amount != null ? price.unit_amount * quantity : null;

        snapshot.subscription = {
          id: sub.id,
          status: sub.status, // trialing | active | past_due | canceled | unpaid | incomplete
          interval: price?.recurring?.interval || company.billing_interval || 'month',
          startedAt: toIso(sub.start_date || sub.created),
          currentPeriodStart: toIso(sub.current_period_start),
          currentPeriodEnd: toIso(sub.current_period_end),
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          canceledAt: toIso(sub.canceled_at),
          trialEnd: toIso(sub.trial_end),
          amount: money(unitAmount, sub.currency),
        };
      } catch (subErr) {
        // Subscription may have been deleted in Stripe — leave subscription null.
        snapshot.subscriptionError = subErr.message;
      }
    }

    // Default card on file
    snapshot.card = await resolveDefaultCard(stripe, company.stripe_customer_id, subscription);

    // Upcoming invoice (real Stripe preview — reflects discounts, proration, trial → first charge)
    try {
      // Stripe SDK v18+ renamed invoices.retrieveUpcoming → invoices.createPreview.
      const previewFn = stripe.invoices.createPreview
        ? (params) => stripe.invoices.createPreview(params)
        : (params) => stripe.invoices.retrieveUpcoming(params);
      const upcoming = await previewFn({ customer: company.stripe_customer_id });
      snapshot.upcomingInvoice = {
        amountDue: money(upcoming.amount_due, upcoming.currency),
        total: money(upcoming.total, upcoming.currency),
        periodStart: toIso(upcoming.period_start),
        periodEnd: toIso(upcoming.period_end),
        nextPaymentAttempt: toIso(upcoming.next_payment_attempt),
        date: toIso(upcoming.next_payment_attempt || upcoming.period_end),
      };
      snapshot.nextInvoice = snapshot.upcomingInvoice;
    } catch (_) {
      // No upcoming invoice (e.g. cancelled / no subscription) — fall back to subscription period.
      const sub = snapshot.subscription;
      if (sub && !sub.cancelAtPeriodEnd && ['active', 'trialing', 'past_due'].includes(sub.status)) {
        snapshot.nextInvoice = {
          date: sub.trialEnd || sub.currentPeriodEnd,
          amount: sub.amount,
          periodStart: sub.currentPeriodEnd,
          periodEnd: null,
        };
      }
    }

    // Invoice history (most recent first)
    const invoices = await stripe.invoices.list({
      customer: company.stripe_customer_id,
      limit: 24,
    });
    snapshot.invoices = (invoices.data || []).map(mapInvoice);
  } catch (err) {
    snapshot.error = err.message;
  }

  return snapshot;
}

module.exports = {
  getStripe,
  isStripeConfigured,
  getStripeBillingSnapshot,
};
