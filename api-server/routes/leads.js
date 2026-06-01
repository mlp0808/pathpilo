const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

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
  columnsEnsured = true;
}

const VALID_STATUSES = ['new', 'contacted', 'won', 'lost'];
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
    const byStatus = { new: 0, contacted: 0, won: 0, lost: 0 };
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

// PUT /api/leads/:leadId — update an allowlisted set of fields
router.put('/:leadId', async (req, res) => {
  try {
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

// POST /api/leads/:leadId/convert — create a client from the lead
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
      `UPDATE leads SET client_id = $1, converted_at = NOW(), status = 'won', updated_at = NOW()
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
