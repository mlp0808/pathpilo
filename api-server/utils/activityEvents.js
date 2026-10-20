/**
 * Product analytics event stream (GA-style) for the superadmin.
 *
 * Every row is one thing that happened: who (user), where (company), what
 * (event name + entity) and when. Writes are buffered in memory and flushed
 * as one multi-row INSERT every couple of seconds, so request latency is never
 * affected. Set ACTIVITY_TRACKING=off to stop recording entirely.
 */

const { pool } = require('./database');

const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH = 250;
const MAX_QUEUE = 5000;
const SESSION_GAP_MS = 30 * 60 * 1000;
const LAST_ACTIVE_WRITE_MS = 5 * 60 * 1000;
const DEDUPE_WINDOW_MS = 20 * 1000;

const COLUMNS = [
  'occurred_at', 'event', 'user_id', 'company_id', 'anonymous_id',
  'entity_type', 'entity_id', 'label', 'props', 'source', 'ip', 'user_agent',
];

function trackingEnabled() {
  const flag = String(process.env.ACTIVITY_TRACKING || '').trim().toLowerCase();
  if (['off', '0', 'false', 'no', 'disabled'].includes(flag)) return false;
  if (/^(1|true|yes)$/i.test(String(process.env.ACTIVITY_TRACKING_DISABLED || ''))) return false;
  return true;
}

let schemaReady = null;

function ensureActivityEventsSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id           BIGSERIAL PRIMARY KEY,
        occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event        VARCHAR(80) NOT NULL,
        user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        anonymous_id VARCHAR(128),
        entity_type  VARCHAR(40),
        entity_id    VARCHAR(64),
        label        TEXT,
        props        JSONB,
        source       VARCHAR(20) NOT NULL DEFAULT 'app',
        ip           TEXT,
        user_agent   TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_events_time ON activity_events (occurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_events_company ON activity_events (company_id, occurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events (user_id, occurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_events_event ON activity_events (event, occurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_events_anon ON activity_events (anonymous_id) WHERE anonymous_id IS NOT NULL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`);
    await backfillHistory();
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/**
 * One-time import of history that already exists in other tables, so the
 * admin charts are not empty on day one. Marked with source = 'backfill'.
 */
async function backfillHistory() {
  const done = await pool.query(`SELECT 1 FROM activity_events WHERE source = 'backfill' LIMIT 1`);
  if (done.rows.length) return;

  const safe = async (label, sql) => {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn(`[activityEvents] backfill ${label} skipped:`, err.message);
    }
  };

  await safe('signups', `
    INSERT INTO activity_events (occurred_at, event, user_id, company_id, source)
    SELECT u.created_at, 'signup.account_created', u.id,
           (SELECT uc.company_id FROM user_companies uc WHERE uc.user_id = u.id ORDER BY uc.company_id LIMIT 1),
           'backfill'
    FROM users u WHERE u.created_at IS NOT NULL
  `);
  await safe('logins', `
    INSERT INTO activity_events (occurred_at, event, user_id, company_id, source, ip, user_agent)
    SELECT created_at, 'auth.login', user_id, company_id, 'backfill', ip, user_agent
    FROM user_login_events
  `);
  await safe('clients', `
    INSERT INTO activity_events (occurred_at, event, company_id, entity_type, entity_id, label, source)
    SELECT created_at, 'client.created', company_id, 'client', id::text, name, 'backfill'
    FROM clients WHERE created_at IS NOT NULL
  `);
  await safe('jobs', `
    INSERT INTO activity_events (occurred_at, event, company_id, entity_type, entity_id, label, source)
    SELECT created_at, 'job.created', company_id, 'job', id::text, title, 'backfill'
    FROM jobs WHERE created_at IS NOT NULL AND COALESCE(is_generated, false) = false
  `);
  await safe('offers', `
    INSERT INTO activity_events (occurred_at, event, company_id, entity_type, entity_id, label, source)
    SELECT created_at, 'offer.created', company_id, 'offer', id::text, title, 'backfill'
    FROM offers WHERE created_at IS NOT NULL
  `);
  await safe('invoices', `
    INSERT INTO activity_events (occurred_at, event, user_id, company_id, entity_type, entity_id, label, source)
    SELECT i.created_at, 'invoice.created',
           CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = i.created_by) THEN i.created_by END,
           i.company_id, 'invoice', i.id::text, i.invoice_number, 'backfill'
    FROM invoices i WHERE i.created_at IS NOT NULL
  `);
  await safe('subscriptions', `
    INSERT INTO activity_events (occurred_at, event, company_id, entity_type, entity_id, label, source)
    SELECT created_at, 'subscription.created', company_id, 'subscription', id::text, title, 'backfill'
    FROM recurring_jobs WHERE created_at IS NOT NULL
  `);
  // Guarantees the marker row exists even if every import above was empty.
  await safe('marker', `
    INSERT INTO activity_events (occurred_at, event, source) VALUES (NOW(), 'system.backfill_completed', 'backfill')
  `);
}

// ── Buffered writer ─────────────────────────────────────────────────────────

let queue = [];
let flushing = false;

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function clip(v, max) {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Queue one event. Never throws, never awaits the database.
 * @param {object} e
 * @param {string} e.event        e.g. 'job.created'
 * @param {number} [e.userId]
 * @param {number} [e.companyId]
 * @param {string} [e.anonymousId] signup session id before an account exists
 * @param {string} [e.entityType]
 * @param {string|number} [e.entityId]
 * @param {string} [e.label]      human readable, e.g. job title
 * @param {object} [e.props]
 * @param {string} [e.source]     'app' | 'system' | 'overwatch' | 'signup'
 * @param {object} [e.req]        express request, used for ip / user agent
 */
function trackEvent(e) {
  if (!trackingEnabled() || !e || !e.event) return;
  if (queue.length >= MAX_QUEUE) return;
  const meta = e.req ? requestMeta(e.req) : {};
  queue.push({
    occurred_at: e.occurredAt ? new Date(e.occurredAt) : new Date(),
    event: clip(e.event, 80),
    user_id: toIntOrNull(e.userId),
    company_id: toIntOrNull(e.companyId),
    anonymous_id: clip(e.anonymousId, 128),
    entity_type: clip(e.entityType, 40),
    entity_id: e.entityId == null ? null : clip(e.entityId, 64),
    label: clip(e.label, 300),
    props: e.props && Object.keys(e.props).length ? JSON.stringify(e.props) : null,
    source: clip(e.source || 'app', 20),
    ip: clip(e.ip || meta.ip, 64),
    user_agent: clip(e.userAgent || meta.userAgent, 400),
  });
}

async function flushEvents() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    await ensureActivityEventsSchema();
    while (queue.length) {
      const batch = queue.splice(0, MAX_BATCH);
      const values = [];
      const rows = batch.map((row, i) => {
        COLUMNS.forEach((c) => values.push(row[c]));
        const base = i * COLUMNS.length;
        return `(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ')})`;
      });
      try {
        await pool.query(
          `INSERT INTO activity_events (${COLUMNS.join(', ')}) VALUES ${rows.join(', ')}`,
          values
        );
      } catch (err) {
        // A deleted user/company between queue and flush breaks the FK; retry row by row once.
        if (err.code === '23503') {
          for (const row of batch) {
            await pool.query(
              `INSERT INTO activity_events (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((_, j) => `$${j + 1}`).join(', ')})`,
              COLUMNS.map((c) => row[c])
            ).catch(() => {});
          }
        } else {
          console.warn('[activityEvents] flush failed, dropped', batch.length, 'events:', err.message);
        }
      }
    }
  } catch (err) {
    console.warn('[activityEvents] schema not ready, dropped', queue.length, 'events:', err.message);
    queue = [];
  } finally {
    flushing = false;
  }
}

const flushTimer = setInterval(() => { flushEvents(); }, FLUSH_INTERVAL_MS);
if (flushTimer.unref) flushTimer.unref();

process.once('beforeExit', () => { flushEvents(); });

// ── Sessions & last-active ──────────────────────────────────────────────────

const lastSeenByUser = new Map();
const lastActiveWriteByUser = new Map();
const pendingLookups = new Map();

async function lastSeenFromDb(userId) {
  if (pendingLookups.has(userId)) return pendingLookups.get(userId);
  const p = pool
    .query(`SELECT last_active_at FROM users WHERE id = $1`, [userId])
    .then((r) => {
      const ts = r.rows[0]?.last_active_at;
      return ts ? new Date(ts).getTime() : 0;
    })
    .catch(() => 0)
    .finally(() => pendingLookups.delete(userId));
  pendingLookups.set(userId, p);
  return p;
}

/**
 * Mark a user as active right now. Emits `session.started` when this is the
 * first activity after a 30 minute gap (same definition Google Analytics uses).
 */
async function touchSession({ userId, companyId, req, path }) {
  const uid = toIntOrNull(userId);
  if (!uid || !trackingEnabled()) return;
  const now = Date.now();

  let last = lastSeenByUser.get(uid);
  if (last === undefined) {
    lastSeenByUser.set(uid, now);
    await ensureActivityEventsSchema().catch(() => {});
    last = await lastSeenFromDb(uid);
  }
  lastSeenByUser.set(uid, now);

  if (!last || now - last > SESSION_GAP_MS) {
    trackEvent({
      event: 'session.started',
      userId: uid,
      companyId,
      req,
      props: {
        ...(path ? { landing: path } : {}),
        ...(last ? { idleMinutes: Math.round((now - last) / 60000) } : {}),
      },
    });
  }

  const lastWrite = lastActiveWriteByUser.get(uid) || 0;
  if (now - lastWrite > LAST_ACTIVE_WRITE_MS) {
    lastActiveWriteByUser.set(uid, now);
    pool.query(`UPDATE users SET last_active_at = NOW() WHERE id = $1`, [uid]).catch(() => {});
  }
}

// ── Duplicate suppression (autosave, drag & drop spam) ─────────────────────

const recentKeys = new Map();

function isDuplicate(key) {
  const now = Date.now();
  const prev = recentKeys.get(key);
  recentKeys.set(key, now);
  return prev !== undefined && now - prev < DEDUPE_WINDOW_MS;
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS;
  for (const [k, ts] of recentKeys) if (ts < cutoff) recentKeys.delete(k);
}, 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

// ── Signup identity stitching ───────────────────────────────────────────────

/**
 * Attach every anonymous pre-account event (same browser session or same
 * email) to the account that was just created, so the timeline reads
 * "entered email → came back 3 days later → created account → …".
 */
async function linkAnonymousEvents({ anonymousId, email, userId, companyId }) {
  const uid = toIntOrNull(userId);
  if (!uid || !trackingEnabled()) return;
  for (const row of queue) {
    if (!row.user_id && row.anonymous_id && row.anonymous_id === anonymousId) {
      row.user_id = uid;
      row.company_id = row.company_id || toIntOrNull(companyId);
    }
  }
  await ensureActivityEventsSchema();
  const em = String(email || '').trim().toLowerCase();
  await pool.query(
    `UPDATE activity_events
        SET user_id = $1, company_id = COALESCE(company_id, $2)
      WHERE user_id IS NULL
        AND anonymous_id IS NOT NULL
        AND (anonymous_id = $3
             OR anonymous_id IN (SELECT client_session_id FROM signup_progress_drafts WHERE LOWER(TRIM(email)) = $4))`,
    [uid, toIntOrNull(companyId), anonymousId || '', em || '\u0000']
  );
}

function requestMeta(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    req.headers?.['cf-connecting-ip'] ||
    req.ip ||
    null;
  return { ip, userAgent: req.headers?.['user-agent'] || null };
}

module.exports = {
  trackingEnabled,
  ensureActivityEventsSchema,
  trackEvent,
  flushEvents,
  touchSession,
  isDuplicate,
  linkAnonymousEvents,
  SESSION_GAP_MS,
};
