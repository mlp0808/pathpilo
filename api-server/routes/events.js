/**
 * Browser-reported analytics events.
 *
 *   POST /api/events  { events: [{ name, path?, props? }], anonymousId? }
 *
 * Signed-in users may report page views and client-only feature usage.
 * Anonymous visitors may only report that they opened the signup form, and
 * that is only stored when they already started a signup earlier (so random
 * visitors never end up in the log).
 */

const express = require('express');
const { pool } = require('../utils/database');
const { decodeActor } = require('../middleware/activityTracker');
const { trackEvent, touchSession, trackingEnabled, isDuplicate, SESSION_GAP_MS } = require('../utils/activityEvents');

const router = express.Router();

const USER_EVENTS = new Set(['page.viewed', 'feature.used']);
const MAX_EVENTS_PER_REQUEST = 20;

function normalizePath(raw) {
  const p = String(raw || '').split('?')[0].slice(0, 200);
  return p
    .split('/')
    .map((s) => (/^\d+$/.test(s) || /^[0-9a-f-]{20,}$/i.test(s) ? ':id' : s))
    .join('/') || '/';
}

function cleanProps(props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(props).slice(0, 8)) {
    if (['string', 'number', 'boolean'].includes(typeof v)) out[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  return Object.keys(out).length ? out : undefined;
}

router.post('/', async (req, res) => {
  res.status(204).end();
  if (!trackingEnabled()) return;

  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
  if (!events.length) return;

  const actor = decodeActor(req);
  if (actor) {
    for (const e of events) {
      if (!USER_EVENTS.has(e?.name)) continue;
      const path = e.path ? normalizePath(e.path) : null;
      if (e.name === 'page.viewed' && isDuplicate(`${actor.userId}|pv|${path}`)) continue;
      if (!actor.overwatch) {
        await touchSession({ userId: actor.userId, companyId: actor.companyId, req, path }).catch(() => {});
      }
      trackEvent({
        event: e.name,
        userId: actor.userId,
        companyId: actor.companyId,
        props: { ...(path ? { path } : {}), ...(cleanProps(e.props) || {}) },
        source: actor.overwatch ? 'overwatch' : 'app',
        req,
      });
    }
    return;
  }

  const anonymousId = String(req.body?.anonymousId || '').trim().slice(0, 128);
  if (!anonymousId || !events.some((e) => e?.name === 'signup.form_viewed')) return;
  try {
    const draft = await pool.query(
      `SELECT email, step, user_id, company_id, updated_at
         FROM signup_progress_drafts WHERE client_session_id = $1`,
      [anonymousId]
    );
    const row = draft.rows[0];
    if (!row || row.user_id) return;
    const idleMs = Date.now() - new Date(row.updated_at).getTime();
    if (idleMs < SESSION_GAP_MS) return;
    trackEvent({
      event: 'signup.returned',
      anonymousId,
      label: row.email || null,
      props: { lastStep: row.step, idleHours: Math.round(idleMs / 3600000) },
      source: 'signup',
      req,
    });
    await pool.query(
      `UPDATE signup_progress_drafts SET updated_at = NOW() WHERE client_session_id = $1`,
      [anonymousId]
    );
  } catch (err) {
    console.warn('[events] signup return check failed:', err.message);
  }
});

module.exports = router;
