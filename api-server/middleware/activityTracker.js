/**
 * Records one analytics event for every successful write request
 * (POST / PUT / PATCH / DELETE) made by a signed-in user. Reads are not
 * recorded; page views arrive separately from the browser via /api/events.
 */

const jwt = require('jsonwebtoken');
const { trackEvent, touchSession, isDuplicate, trackingEnabled } = require('../utils/activityEvents');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Background / automatic / noise endpoints that are not user decisions.
const EXCLUDED = [
  /^\/api\/auth\//,
  /^\/api\/admin(\/|$)/,
  /^\/api\/events(\/|$)/,
  /^\/api\/notifications\//,
  /^\/api\/public\//,
  /^\/api\/stripe\/webhook/,
  /^\/api\/companies\/getting-started\/visit/,
  /^\/api\/companies\/switch/,
  /\/materialize$/,
  /^\/api\/jobs\/[^/]+\/coordinates$/,
  /^\/api\/invoices\/[^/]+\/online-link$/,
  /^\/api\/maps\/routes\/calculate/,
  /^\/api\/mobile\//,
];

/** Friendly names for the writes that matter most. Keys are "METHOD /normalized/path". */
const NAMED = {
  'POST /jobs': 'job.created',
  'PUT /jobs/:id': 'job.updated',
  'DELETE /jobs/:id': 'job.deleted',
  'PUT /jobs/:id/status': 'job.status_changed',
  'POST /jobs/:id/start': 'job.started',
  'POST /jobs/:id/complete-remaining': 'job.completed',
  'POST /jobs/:id/notify-on-way': 'job.on_my_way_sent',
  'PUT /jobs/:id/move': 'job.rescheduled',
  'PUT /jobs/:id/time': 'job.rescheduled',
  'PUT /jobs/:id/assignee': 'job.assigned',
  'POST /jobs/:id/notes': 'job.note_added',
  'POST /jobs/:id/services': 'job.service_added',
  'PUT /jobs/reorder': 'route.reordered',
  'PUT /jobs/route-order': 'route.reordered',

  'POST /clients': 'client.created',
  'PUT /clients/:id': 'client.updated',
  'DELETE /clients/:id': 'client.deleted',
  'POST /clients/:id/invoices': 'invoice.created',
  'POST /clients/:id/secure-notes': 'client.secure_note_added',

  'POST /offers': 'offer.created',
  'PATCH /offers/:id': 'offer.updated',
  'POST /offers/:id/send': 'offer.sent',
  'POST /offers/:id/confirm': 'offer.confirmed',
  'POST /offers/:id/archive': 'offer.archived',
  'POST /offers/:id/restore': 'offer.restored',
  'DELETE /offers/:id': 'offer.deleted',

  'PUT /invoices/:id': 'invoice.updated',
  'POST /invoices/:id/send': 'invoice.sent',
  'PUT /invoices/:id/status': 'invoice.status_changed',
  'POST /invoices/:id/send-reminder': 'invoice.reminder_sent',
  'POST /invoices/:id/transactions': 'invoice.payment_recorded',
  'DELETE /invoices/:id': 'invoice.deleted',

  'POST /subscriptions': 'subscription.created',
  'PUT /subscriptions/:id': 'subscription.updated',
  'DELETE /subscriptions/:id': 'subscription.deleted',
  'PATCH /subscriptions/:id/pause': 'subscription.paused',

  'POST /services': 'service.created',
  'PUT /services/:id': 'service.updated',
  'DELETE /services/:id': 'service.deleted',
  'PUT /services/cancellation-fee': 'settings.cancellation_fee_updated',

  'POST /rounds': 'round.created',
  'POST /rounds/from-day': 'round.created',
  'PATCH /rounds/:id': 'round.updated',
  'DELETE /rounds/:id': 'round.deleted',
  'POST /rounds/:id/stops': 'round.stop_added',
  'POST /rounds/:id/save': 'round.saved',
  'POST /rounds/:id/place': 'round.scheduled',
  'POST /round-templates': 'round_template.created',

  'POST /leads': 'lead.created',
  'PUT /leads/:id': 'lead.updated',
  'POST /leads/:id/convert': 'lead.converted',
  'DELETE /leads/:id': 'lead.deleted',

  'POST /route-planner/optimize-day': 'route.optimized',
  'POST /route-planner/optimize-week': 'route.week_optimized',
  'POST /route-planner/apply-week': 'route.week_applied',

  'PUT /companies/profile': 'settings.business_updated',
  'POST /companies/profile/logo': 'settings.logo_uploaded',
  'DELETE /companies/profile/logo': 'settings.logo_removed',
  'PUT /companies/invoice-defaults': 'settings.invoice_options_updated',
  'PATCH /companies/slug': 'settings.workspace_url_updated',
  'PUT /lead-form': 'settings.lead_form_updated',
  'PUT /email-templates': 'settings.email_templates_updated',
  'PUT /work-hours/:id': 'settings.work_hours_updated',
  'PUT /company-defaults/work-hours': 'settings.work_hours_updated',
  'PUT /user/profile': 'settings.profile_updated',
  'PUT /users/profile': 'settings.profile_updated',

  'POST /companies/:id/invite': 'team.invite_sent',
  'POST /companies/:id/invitations/:id/resend': 'team.invite_resent',
  'DELETE /companies/:id/invitations/:id': 'team.invite_cancelled',
  'DELETE /users/:id': 'team.member_removed',
  'POST /invitations/:id/accept': 'team.invite_accepted',

  'POST /companies/onboarding/progress': 'onboarding.step_completed',
  'POST /companies/onboarding/complete': 'onboarding.completed',
  'POST /companies/onboarding/select-plan': 'onboarding.plan_selected',
  'PUT /companies/getting-started/active-mission': 'getting_started.mission_selected',
  'PUT /companies/getting-started/skip-mission': 'getting_started.mission_skipped',
  'PUT /companies/getting-started/skip': 'getting_started.skipped',
  'PUT /companies/getting-started/dismissed': 'getting_started.dismissed',

  'POST /stripe/checkout': 'billing.checkout_started',
  'POST /stripe/confirm-checkout': 'billing.subscribed',
  'POST /stripe/cancel': 'billing.cancelled',
  'POST /stripe/resume': 'billing.resumed',
  'POST /stripe/portal': 'billing.portal_opened',
  'POST /stripe/sms-checkout': 'billing.sms_checkout_started',
  'POST /stripe/confirm-sms-checkout': 'billing.sms_subscribed',
  'POST /stripe/sms-cancel': 'billing.sms_cancelled',

  'POST /guest-route/claim': 'signup.guest_route_claimed',
};

const NAMED_PATTERNS = [
  [/^PUT \/integrations\/[^/]+\/config$/, 'settings.integration_updated'],
];

const RESOURCE_TYPES = {
  jobs: 'job', clients: 'client', offers: 'offer', invoices: 'invoice',
  subscriptions: 'subscription', services: 'service', rounds: 'round',
  'round-templates': 'round_template', leads: 'lead', 'item-groups': 'item_group',
  appointments: 'appointment', 'employee-leave': 'leave', 'daily-routes': 'daily_route',
  users: 'user', companies: 'company', invitations: 'invitation', integrations: 'integration',
};

// Request body fields worth keeping as event properties (small, non-sensitive).
const PROP_KEYS = ['status', 'step', 'plan', 'interval', 'paused', 'isPaused', 'role', 'usageGoals'];

function isIdSegment(seg) {
  return /^\d+$/.test(seg)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)
    || /^[0-9a-f]{20,}$/i.test(seg);
}

function decodeActor(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = Number(payload.userId || payload.id);
    if (!userId || payload.role === 'admin') return null;
    return {
      userId,
      companyId: Number(payload.activeCompanyId) || null,
      overwatch: !!payload.overwatch,
    };
  } catch {
    return null;
  }
}

function describe(method, apiPath) {
  const segments = apiPath.replace(/^\/api\//, '').split('/').filter(Boolean);
  const ids = [];
  const normalized = segments.map((s) => {
    if (isIdSegment(s)) { ids.push(s); return ':id'; }
    return s;
  });
  const key = `${method} /${normalized.join('/')}`;

  let event = NAMED[key];
  if (!event) {
    const hit = NAMED_PATTERNS.find(([rx]) => rx.test(key));
    if (hit) event = hit[1];
  }

  const root = normalized[0] || 'unknown';
  const resource = RESOURCE_TYPES[root] || root.replace(/-/g, '_');

  if (!event) {
    const tail = normalized.slice(1).filter((s) => s !== ':id');
    if (tail.length === 0) {
      const verb = method === 'POST' ? 'created' : method === 'DELETE' ? 'deleted' : 'updated';
      event = `${resource}.${verb}`;
    } else {
      event = `${resource}.${tail.join('_').replace(/-/g, '_')}${method === 'DELETE' ? '_removed' : ''}`;
    }
  }

  let entityType = event.split('.')[0];
  if (entityType === 'settings' || entityType === 'onboarding' || entityType === 'billing') entityType = null;
  // Invitation path ids are secret tokens, never store them.
  const entityId = root === 'invitations' ? null : ids[0] || null;

  return { event, key, entityType, entityId, root };
}

function pickProps(body, key) {
  const props = {};
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const k of PROP_KEYS) {
      if (body[k] === undefined || body[k] === null || body[k] === '') continue;
      const v = body[k];
      if (Array.isArray(v)) props[k] = v.slice(0, 10);
      else if (typeof v !== 'object') props[k] = v;
    }
  }
  const provider = key.match(/^PUT \/integrations\/([^/]+)\/config$/);
  if (provider) props.provider = provider[1];
  return props;
}

const ENTITY_KEYS = ['job', 'client', 'offer', 'invoice', 'subscription', 'service', 'round', 'lead', 'data', 'item'];

function sniffEntity(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') return {};
  let obj = responseBody;
  for (const k of ENTITY_KEYS) {
    if (responseBody[k] && typeof responseBody[k] === 'object' && !Array.isArray(responseBody[k])) {
      obj = responseBody[k];
      break;
    }
  }
  const id = obj.id ?? null;
  const person = [obj.first_name || obj.firstName, obj.last_name || obj.lastName].filter(Boolean).join(' ');
  const label =
    obj.title ||
    obj.invoice_number || obj.invoiceNumber ||
    (obj.name ? [obj.name, obj.last_name || obj.lastName].filter(Boolean).join(' ') : '') ||
    person ||
    null;
  return { id, label };
}

function activityTracker(req, res, next) {
  if (!WRITE_METHODS.has(req.method) || !trackingEnabled()) return next();
  const apiPath = req.path;
  if (!apiPath.startsWith('/api/') || EXCLUDED.some((rx) => rx.test(apiPath))) return next();

  const actor = decodeActor(req);
  if (!actor) return next();

  const originalJson = res.json.bind(res);
  let responseBody;
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      const d = describe(req.method, apiPath);
      const created = d.event.endsWith('.created');
      const sniffed = sniffEntity(responseBody);
      const entityId = created && sniffed.id != null ? String(sniffed.id) : d.entityId;

      if (!created && isDuplicate(`${actor.userId}|${d.event}|${entityId || ''}`)) return;

      const props = pickProps(req.body, d.key);
      if (d.event === 'subscription.paused' && (req.body?.paused === false || req.body?.isPaused === false)) {
        d.event = 'subscription.resumed';
      }

      trackEvent({
        event: d.event,
        userId: actor.userId,
        companyId: actor.companyId,
        entityType: d.entityType,
        entityId,
        label: sniffed.label,
        props: Object.keys(props).length ? props : undefined,
        source: actor.overwatch ? 'overwatch' : 'app',
        req,
      });
      if (!actor.overwatch) {
        touchSession({ userId: actor.userId, companyId: actor.companyId, req }).catch(() => {});
      }
    } catch (err) {
      console.warn('[activityTracker] failed to record event:', err.message);
    }
  });

  next();
}

module.exports = { activityTracker, describe, decodeActor };
