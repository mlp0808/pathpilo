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
    invoices: [],
    error: null,
  };

  if (!snapshot.configured || !company.stripe_customer_id) {
    return snapshot;
  }

  try {
    const stripe = getStripe();

    // Subscription (live status, current period, amount)
    if (company.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
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

        // Derive the next invoice from the subscription unless it's ending.
        if (!sub.cancel_at_period_end && ['active', 'trialing', 'past_due'].includes(sub.status)) {
          snapshot.nextInvoice = {
            date: toIso(sub.current_period_end),
            amount: money(unitAmount, sub.currency),
            periodStart: toIso(sub.current_period_end),
            periodEnd: toIso(sub.current_period_end ? sub.current_period_end + secondsInInterval(snapshot.subscription.interval) : null),
          };
        }
      } catch (subErr) {
        // Subscription may have been deleted in Stripe — leave subscription null.
        snapshot.subscriptionError = subErr.message;
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

function secondsInInterval(interval) {
  if (interval === 'year') return 365 * 24 * 60 * 60;
  if (interval === 'week') return 7 * 24 * 60 * 60;
  if (interval === 'day') return 24 * 60 * 60;
  return 30 * 24 * 60 * 60; // month (approx — display only)
}

module.exports = {
  getStripe,
  isStripeConfigured,
  getStripeBillingSnapshot,
};
