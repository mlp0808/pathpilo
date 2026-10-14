const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensurePipelineSchema, LEAD_STATUSES } = require('../utils/pipelineSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

router.use(authenticateToken);

// Resolve active company (prefer JWT activeCompanyId, verify membership).
const resolveCompanyId = async (req) => {
  const userId = req.user.userId;
  let companyId = req.user.activeCompanyId;
  if (companyId) {
    const member = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (member.rows.length === 0) {
      return { error: 'Not a member of the active company', status: 403 };
    }
    return { companyId };
  }
  const result = await pool.query(
    'SELECT company_id FROM user_companies WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (result.rows.length === 0) {
    return { error: 'No active company found', status: 400 };
  }
  return { companyId: result.rows[0].company_id };
};

// Idempotently ensure conversion columns exist (safe for older databases).
let columnsEnsured = false;
async function ensureLeadColumns() {
  if (columnsEnsured) return;
  await pool
    .query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL')
    .catch(() => {});
  await pool.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP NULL').catch(() => {});
  await ensurePipelineSchema(pool);
  columnsEnsured = true;
}

// quoted = an offer is out; won = booked; lost = archived.
const VALID_STATUSES = LEAD_STATUSES;
// Columns an authenticated admin is allowed to edit directly.
const EDITABLE_FIELDS = [
  'status',
  'notes',
  'first_name',
  'last_name',
  'country',
  'address',
  'zip_code',
  'city',
  'email',
  'phone',
  'message',
  'client_id',
];

// GET /api/leads?status=new — list leads for the active company
router.get('/', async (req, res) => {
  try {
    await ensureLeadColumns();
    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;

    const status = req.query.status;
    const params = [companyId];
    let where = 'WHERE company_id = $1';
    if (status && VALID_STATUSES.includes(String(status))) {
      params.push(String(status));
      where += ` AND status = $2`;
    }

    const result = await pool.query(
      `SELECT * FROM leads ${where} ORDER BY created_at DESC`,
      params
    );

    // Status counts for the pipeline tabs (ignores the active filter).
    const counts = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM leads WHERE company_id = $1 GROUP BY status`,
      [companyId]
    );
    const byStatus = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));
    counts.rows.forEach((r) => {
      if (byStatus[r.status] !== undefined) byStatus[r.status] = r.n;
    });

    res.json({
      leads: result.rows,
      total: result.rows.length,
      counts: byStatus,
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// POST /api/leads — admin-entered lead (phone call, walk-in, …)
router.post('/', async (req, res) => {
  try {
    await ensureLeadColumns();
    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const body = req.body || {};
    const str = (v, max = 500) => {
      const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
      return s || null;
    };
    const firstName = str(body.first_name, 120);
    const phone = str(body.phone, 60);
    const email = str(body.email, 200);
    if (!firstName && !phone && !email) {
      return res.status(400).json({ error: 'Add a name, phone or email' });
    }
    const status = VALID_STATUSES.includes(String(body.status)) ? String(body.status) : 'new';
    const result = await pool.query(
      `INSERT INTO leads (company_id, source, status, first_name, last_name, email, phone,
                          address, zip_code, city, message)
       VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        resolved.companyId, status, firstName, str(body.last_name, 120), email, phone,
        str(body.address), str(body.zip_code, 20), str(body.city, 100), str(body.message, 4000),
      ]
    );
    res.status(201).json({ lead: result.rows[0] });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:leadId — update an allowlisted set of fields
router.put('/:leadId', async (req, res) => {
  try {
    await ensureLeadColumns();
    const { leadId } = req.params;
    const updates = req.body || {};

    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;

    const leadCheck = await pool.query(
      'SELECT id FROM leads WHERE id = $1 AND company_id = $2',
      [leadId, companyId]
    );
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    const fields = [];
    const values = [];
    let p = 1;

    for (const key of EDITABLE_FIELDS) {
      if (updates[key] === undefined) continue;
      if (key === 'status' && !VALID_STATUSES.includes(String(updates[key]))) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (key === 'client_id') {
        const cid = updates[key] == null || updates[key] === '' ? null : Number(updates[key]);
        if (cid != null) {
          if (!Number.isFinite(cid)) {
            return res.status(400).json({ error: 'Invalid client' });
          }
          const owned = await pool.query(
            'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
            [cid, companyId]
          );
          if (owned.rows.length === 0) {
            return res.status(400).json({ error: 'Client not found' });
          }
        }
        fields.push(`${key} = $${p++}`);
        values.push(cid);
        continue;
      }
      fields.push(`${key} = $${p++}`);
      values.push(updates[key]);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(leadId);
    const result = await pool.query(
      `UPDATE leads SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${p} RETURNING *`,
      values
    );

    res.json({ message: 'Lead updated', lead: result.rows[0] });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// POST /api/leads/:leadId/convert — create a client from the lead. Status is
// left alone: the lead only counts as won once a job is actually booked.
router.post('/:leadId/convert', async (req, res) => {
  try {
    await ensureLeadColumns();
    const { leadId } = req.params;

    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;

    const leadResult = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND company_id = $2',
      [leadId, companyId]
    );
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }
    const lead = leadResult.rows[0];

    if (lead.client_id) {
      const existing = await pool.query('SELECT * FROM clients WHERE id = $1', [lead.client_id]);
      if (existing.rows.length > 0) {
        return res.json({
          message: 'Lead already converted',
          client: existing.rows[0],
          lead,
          alreadyConverted: true,
        });
      }
    }

    const name = (lead.first_name && lead.first_name.trim()) || (lead.email && lead.email.trim()) || 'New client';

    if (!String(lead.address || '').trim()) {
      return res.status(400).json({
        error: 'Address is required to book a job for this lead',
        code: 'LEAD_ADDRESS_REQUIRED',
      });
    }

    const clientResult = await pool.query(
      `
      INSERT INTO clients
        (company_id, name, last_name, client_type, country, address, zip_code, city, email, phone)
      VALUES ($1, $2, $3, 'person', $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
      [
        companyId,
        name,
        lead.last_name || null,
        lead.country || null,
        lead.address || null,
        lead.zip_code || null,
        lead.city || null,
        lead.email || null,
        lead.phone || null,
      ]
    );
    const client = clientResult.rows[0];

    const updatedLead = await pool.query(
      `UPDATE leads SET client_id = $1, converted_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [client.id, leadId]
    );

    res.status(201).json({
      message: 'Lead converted to client',
      client,
      lead: updatedLead.rows[0],
    });
  } catch (error) {
    console.error('Error converting lead:', error);
    res.status(500).json({ error: 'Failed to convert lead: ' + error.message });
  }
});

// DELETE /api/leads/:leadId
router.delete('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;

    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 AND company_id = $2 RETURNING id',
      [leadId, companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
    }

    res.json({ message: 'Lead deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
