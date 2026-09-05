/**
 * Offers — Phase 2/3 of the map multitool.
 *
 * An offer is a set of 3–4 proposed visit dates (picked from the map tool's
 * nearest-routes suggestions) sent to a prospect or existing client via a
 * public token link (/o/{token}). When the recipient accepts a date, a real
 * job is created on that day for the suggested employee, so it lands directly
 * in the route planner.
 *
 * Authenticated (company-scoped):
 *   POST   /api/offers
 *   GET    /api/offers
 *   GET    /api/offers/:id
 *   DELETE /api/offers/:id           (revoke — only while not accepted)
 *
 * Public (token link, mounted at /api/public/offers):
 *   GET  /:token
 *   POST /:token/accept   { date }
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../utils/database');
const mapTool = require('../services/mapTool');

const router = express.Router();
const publicRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) return { error: 'No active company found in token', status: 400 };
  return { companyId: activeCompanyId };
};

// ── Schema (idempotent) ─────────────────────────────────────────────────────
let schemaEnsured = false;
async function ensureOffersSchema() {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      lead_id INTEGER,
      token VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'sent',
      title TEXT,
      message TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      zip_code TEXT,
      city TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      service_minutes INTEGER,
      price NUMERIC,
      proposed_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      accepted_date DATE,
      accepted_user_id INTEGER,
      created_job_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_offers_company ON offers(company_id)`);
  schemaEnsured = true;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeProposedDates(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const d of raw.slice(0, 4)) {
    if (!d || typeof d !== 'object') return null;
    if (!DATE_RE.test(String(d.date || ''))) return null;
    const userId = parseInt(String(d.user_id), 10);
    if (!Number.isFinite(userId)) return null;
    out.push({
      date: String(d.date),
      user_id: userId,
      user_name: typeof d.user_name === 'string' ? d.user_name.slice(0, 120) : null,
      time_hint: typeof d.time_hint === 'string' ? d.time_hint.slice(0, 40) : null,
    });
  }
  return out.length > 0 ? out : null;
}

// ── Authenticated routes ────────────────────────────────────────────────────
router.use(authenticateToken);

// POST /api/offers — create an offer with proposed dates
router.post('/', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const {
      client_id, lead_id, title, message,
      contact_name, contact_email, contact_phone,
      address, zip_code, city, lat, lng,
      service_minutes, price, proposed_dates,
    } = req.body || {};

    const dates = sanitizeProposedDates(proposed_dates);
    if (!dates) {
      return res.status(400).json({ error: 'proposed_dates must be 1–4 entries of { date, user_id }' });
    }
    if (!client_id && !String(contact_name || '').trim()) {
      return res.status(400).json({ error: 'contact_name is required when no client is linked' });
    }

    // If linked to an existing client, verify company ownership.
    if (client_id) {
      const check = await pool.query(
        'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
        [client_id, companyId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const result = await pool.query(
      `INSERT INTO offers
         (company_id, client_id, lead_id, token, status, title, message,
          contact_name, contact_email, contact_phone,
          address, zip_code, city, lat, lng,
          service_minutes, price, proposed_dates)
       VALUES ($1,$2,$3,$4,'sent',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        companyId, client_id || null, lead_id || null, token,
        title || null, message || null,
        contact_name || null, contact_email || null, contact_phone || null,
        address || null, zip_code || null, city || null,
        Number.isFinite(Number(lat)) ? Number(lat) : null,
        Number.isFinite(Number(lng)) ? Number(lng) : null,
        Number.isFinite(parseInt(service_minutes, 10)) ? parseInt(service_minutes, 10) : null,
        Number.isFinite(Number(price)) ? Number(price) : null,
        JSON.stringify(dates),
      ]
    );

    res.status(201).json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// GET /api/offers — list company offers (newest first)
router.get('/', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const result = await pool.query(
      `SELECT o.*, c.name AS client_name, c.last_name AS client_last_name
       FROM offers o
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.company_id = $1
       ORDER BY o.created_at DESC
       LIMIT 200`,
      [companyAccess.companyId]
    );
    res.json({ offers: result.rows });
  } catch (error) {
    console.error('Error listing offers:', error);
    res.status(500).json({ error: 'Failed to list offers' });
  }
});

// GET /api/offers/:id
router.get('/:id', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const result = await pool.query(
      'SELECT * FROM offers WHERE id = $1 AND company_id = $2',
      [req.params.id, companyAccess.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    res.json({ offer: result.rows[0] });
  } catch (error) {
    console.error('Error fetching offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

// DELETE /api/offers/:id — revoke (not allowed once accepted)
router.delete('/:id', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    const result = await pool.query(
      `DELETE FROM offers WHERE id = $1 AND company_id = $2 AND status != 'accepted' RETURNING id`,
      [req.params.id, companyAccess.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found or already accepted' });
    }
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

// ── Public token routes (no auth) ───────────────────────────────────────────

async function findOfferByToken(token) {
  await ensureOffersSchema();
  const result = await pool.query(
    `SELECT o.*, co.name AS company_name,
            c.name AS client_name, c.last_name AS client_last_name
     FROM offers o
     JOIN companies co ON co.id = o.company_id
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

// GET /api/public/offers/:token — recipient view
publicRouter.get('/:token', async (req, res) => {
  try {
    const offer = await findOfferByToken(String(req.params.token));
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    const proposed = Array.isArray(offer.proposed_dates)
      ? offer.proposed_dates
      : JSON.parse(offer.proposed_dates || '[]');

    res.json({
      offer: {
        company_name: offer.company_name,
        title: offer.title,
        message: offer.message,
        recipient_name: offer.client_name
          ? `${offer.client_name}${offer.client_last_name ? ' ' + offer.client_last_name : ''}`
          : offer.contact_name,
        address: [offer.address, offer.zip_code, offer.city].filter(Boolean).join(', '),
        price: offer.price,
        status: offer.status,
        accepted_date: offer.accepted_date,
        // Never leak internal employee ids to the public page beyond what's needed.
        proposed_dates: proposed.map((d) => ({ date: d.date, time_hint: d.time_hint || null })),
      },
    });
  } catch (error) {
    console.error('Error fetching public offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

// POST /api/public/offers/:token/accept — pick a date, auto-schedule the job
publicRouter.post('/:token/accept', async (req, res) => {
  try {
    const offer = await findOfferByToken(String(req.params.token));
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status === 'accepted') {
      return res.status(409).json({ error: 'Offer already accepted', accepted_date: offer.accepted_date });
    }

    const chosenDate = String(req.body?.date || '');
    const proposed = Array.isArray(offer.proposed_dates)
      ? offer.proposed_dates
      : JSON.parse(offer.proposed_dates || '[]');
    const chosen = proposed.find((d) => d.date === chosenDate);
    if (!chosen) return res.status(400).json({ error: 'Chosen date is not one of the proposed dates' });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Ensure a client exists (prospects become clients on acceptance).
      let clientId = offer.client_id;
      if (!clientId) {
        const clientResult = await dbClient.query(
          `INSERT INTO clients
             (company_id, name, client_type, address, zip_code, city, email, phone, lat, lng)
           VALUES ($1, $2, 'person', $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            offer.company_id,
            offer.contact_name || 'New client',
            offer.address, offer.zip_code, offer.city,
            offer.contact_email, offer.contact_phone,
            offer.lat, offer.lng,
          ]
        );
        clientId = clientResult.rows[0].id;
      }

      // Place at the end of the chosen employee's day.
      const maxSortResult = await dbClient.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM jobs
         WHERE company_id = $1 AND scheduled_date = $2 AND assigned_user_id = $3`,
        [offer.company_id, chosen.date, chosen.user_id]
      );
      const nextSortOrder = (maxSortResult.rows[0]?.max_sort || 0) + 1;

      const jobResult = await dbClient.query(
        `INSERT INTO jobs
           (company_id, client_id, assigned_user_id, title, scheduled_date, sort_order, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          offer.company_id, clientId, chosen.user_id,
          offer.title || 'Offer job', chosen.date, nextSortOrder,
          offer.lat, offer.lng,
        ]
      );
      const jobId = jobResult.rows[0].id;

      // One service line so price/duration flow into the planner and invoicing.
      await dbClient.query(
        `INSERT INTO job_services (job_id, custom_title, custom_price, custom_duration_minutes, status)
         VALUES ($1, $2, $3, $4, 'scheduled')`,
        [jobId, offer.title || 'Offered service', offer.price, offer.service_minutes]
      );

      await dbClient.query(
        `UPDATE offers
         SET status = 'accepted', accepted_date = $1, accepted_user_id = $2,
             created_job_id = $3, client_id = $4, updated_at = NOW()
         WHERE id = $5`,
        [chosen.date, chosen.user_id, jobId, clientId, offer.id]
      );

      await dbClient.query('COMMIT');

      // New job changes route-day candidates — drop cached snapshots.
      mapTool.invalidateCompany(offer.company_id);

      res.json({ accepted: true, date: chosen.date });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
