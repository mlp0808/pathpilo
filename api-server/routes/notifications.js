/**
 *   GET  /api/notifications            { notifications, unread, attention }
 *   POST /api/notifications/:id/read
 *   POST /api/notifications/read-all
 *
 * `attention` counts pipeline items waiting on the admin; the rules mirror
 * app/lib/pipeline.ts.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensurePipelineSchema } = require('../utils/pipelineSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const STALE_DAYS = 7;

router.use((req, res, next) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
});

function scope(req, res) {
  const companyId = req.user?.activeCompanyId;
  if (!companyId) {
    res.status(400).json({ error: 'No active company found in token' });
    return null;
  }
  return { companyId, userId: req.user.userId };
}

async function attentionCounts(companyId) {
  const out = { leads: 0, offers: 0, bookings: 0 };
  const leadNeedsAdmin = `l.company_id = $1
       AND l.status NOT IN ('won', 'lost')
       AND (l.client_id IS NOT NULL OR l.status = 'new'
            OR COALESCE(l.updated_at, l.created_at) < NOW() - ($2 * INTERVAL '1 day'))`;
  let leads;
  try {
    leads = await pool.query(
      `SELECT COUNT(*)::int AS n FROM leads l
       WHERE ${leadNeedsAdmin}
         AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.lead_id = l.id AND o.status <> 'revoked')`,
      [companyId, STALE_DAYS]
    );
  } catch (_) {
    leads = await pool.query(`SELECT COUNT(*)::int AS n FROM leads l WHERE ${leadNeedsAdmin}`, [companyId, STALE_DAYS]);
  }
  out.leads = leads.rows[0]?.n || 0;
  try {
    const offers = await pool.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE status = 'draft' OR status = 'declined'
              OR (status = 'sent' AND (valid_until < CURRENT_DATE
                  OR COALESCE(sent_at, created_at) < NOW() - ($2 * INTERVAL '1 day')))
         )::int AS offers,
         COUNT(*) FILTER (WHERE status = 'accepted' AND confirmed_at IS NULL)::int AS bookings
       FROM offers
       WHERE company_id = $1 AND archived_at IS NULL AND status <> 'revoked'`,
      [companyId, STALE_DAYS]
    );
    out.offers = offers.rows[0]?.offers || 0;
    out.bookings = offers.rows[0]?.bookings || 0;
  } catch (_) {
    // Offers table/columns appear on first use of the offers API.
  }
  return out;
}

router.get('/', async (req, res) => {
  try {
    const s = scope(req, res);
    if (!s) return;
    await ensurePipelineSchema(pool);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '30'), 10) || 30, 1), 100);

    const [list, unread, attention] = await Promise.all([
      pool.query(
        `SELECT n.id, n.type, n.entity_type, n.entity_id, n.meta, n.created_at,
                (r.notification_id IS NOT NULL) AS read
         FROM notifications n
         LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $2
         WHERE n.company_id = $1
         ORDER BY n.created_at DESC
         LIMIT $3`,
        [s.companyId, s.userId, limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM notifications n
         WHERE n.company_id = $1
           AND NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $2)`,
        [s.companyId, s.userId]
      ),
      attentionCounts(s.companyId),
    ]);

    res.json({ notifications: list.rows, unread: unread.rows[0]?.n || 0, attention });
  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const s = scope(req, res);
    if (!s) return;
    await ensurePipelineSchema(pool);
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $2 FROM notifications n WHERE n.company_id = $1
       ON CONFLICT DO NOTHING`,
      [s.companyId, s.userId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const s = scope(req, res);
    if (!s) return;
    await ensurePipelineSchema(pool);
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $3 FROM notifications n WHERE n.id = $1 AND n.company_id = $2
       ON CONFLICT DO NOTHING`,
      [req.params.id, s.companyId, s.userId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

module.exports = router;
