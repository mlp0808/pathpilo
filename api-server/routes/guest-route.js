const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const MAX_STOPS = 25;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

/** Decode the base64 guest-route payload produced by the marketing free tool. */
function decodeGuestRoute(encoded) {
  try {
    const json = Buffer.from(String(encoded), 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.stops)) return null;
    return parsed.stops;
  } catch {
    return null;
  }
}

function sanitizeStops(rawStops) {
  if (!Array.isArray(rawStops)) return [];
  return rawStops
    .map((s) => ({
      name: String(s?.name || '').trim().slice(0, 200),
      address: String(s?.address || '').trim().slice(0, 300),
      zip_code: s?.zip_code ? String(s.zip_code).trim().slice(0, 40) : null,
      city: s?.city ? String(s.city).trim().slice(0, 120) : null,
      lat: Number(s?.lat),
      lng: Number(s?.lng),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(s?.date || '')) ? String(s.date) : null,
    }))
    .filter(
      (s) =>
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng) &&
        s.lat >= -90 &&
        s.lat <= 90 &&
        s.lng >= -180 &&
        s.lng <= 180,
    )
    .slice(0, MAX_STOPS);
}

/**
 * POST /api/guest-route/claim
 * Body: { guestRoute?: base64String, stops?: [{ name, address, zip_code, city, lat, lng, date? }], date?: 'YYYY-MM-DD' }
 *
 * Converts a route/week planned in the free marketing tool (no login) into real
 * clients + jobs for the newly registered user's active company. Each stop is
 * scheduled on its own day (falling back to the request date, then today) and
 * ordered per-day exactly as the guest arranged them in the week planner.
 */
router.post('/claim', authenticateToken, async (req, res) => {
  const companyId = req.user?.activeCompanyId;
  const userId = req.user?.userId;
  if (!companyId || !userId) {
    return res.status(400).json({ error: 'No active company found in token' });
  }

  const stops = req.body?.guestRoute
    ? sanitizeStops(decodeGuestRoute(req.body.guestRoute))
    : sanitizeStops(req.body?.stops);

  if (stops.length === 0) {
    return res.status(400).json({ error: 'No valid stops to claim' });
  }

  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || ''))
    ? String(req.body.date)
    : null;

  const dbClient = await pool.connect();
  try {
    // Confirm the caller really belongs to the active company.
    const member = await dbClient.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId],
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of the active company' });
    }

    await dbClient.query('BEGIN');

    const createdJobIds = [];
    let clientsCreated = 0;
    // Per-day counters so each day's jobs are ordered independently, matching
    // how the guest arranged them in the week planner.
    const orderByDate = {};

    for (let i = 0; i < stops.length; i += 1) {
      const stop = stops[i];
      const clientName = stop.name || stop.address || `Route stop ${i + 1}`;
      // Effective scheduled date: the stop's own day, else the request-level
      // fallback date, else today (CURRENT_DATE on the DB).
      const effDate = stop.date || dateStr || null;
      const orderKey = effDate || '__today__';
      const dayOrder = orderByDate[orderKey] ?? 0;
      orderByDate[orderKey] = dayOrder + 1;

      const clientResult = await dbClient.query(
        `INSERT INTO clients
           (company_id, name, last_name, client_type, address, zip_code, city, email, phone, lat, lng, company_number)
         VALUES ($1, $2, NULL, 'company', $3, $4, $5, NULL, NULL, $6, $7, NULL)
         RETURNING id`,
        [companyId, clientName, stop.address || null, stop.zip_code, stop.city, stop.lat, stop.lng],
      );
      const clientId = clientResult.rows[0].id;
      clientsCreated += 1;

      const jobResult = await dbClient.query(
        `INSERT INTO jobs
           (company_id, client_id, assigned_user_id, title, note, scheduled_date,
            scheduled_time_from, scheduled_time_to, recurring_job_id, is_generated,
            sort_order, route_order)
         VALUES ($1, $2, $3, $4, NULL::text, ${effDate ? '$5::date' : 'CURRENT_DATE'},
                 NULL, NULL, NULL, false, $${effDate ? 6 : 5}, $${effDate ? 6 : 5})
         RETURNING id`,
        effDate
          ? [companyId, clientId, userId, clientName, effDate, dayOrder]
          : [companyId, clientId, userId, clientName, dayOrder],
      );
      createdJobIds.push(jobResult.rows[0].id);
    }

    await dbClient.query('COMMIT');

    return res.json({
      ok: true,
      clientsCreated,
      jobsCreated: createdJobIds.length,
      jobIds: createdJobIds,
      assignedUserId: userId,
    });
  } catch (error) {
    try {
      await dbClient.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[guest-route] claim failed', error);
    return res.status(500).json({ error: 'Failed to claim guest route' });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
