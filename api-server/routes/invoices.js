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

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }
  return { companyId: activeCompanyId };
};

// GET /api/invoices - List all invoices for the active company
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    let result;
    try {
      result = await pool.query(`
        SELECT
          i.id,
          i.invoice_number,
          i.title,
          i.client_id,
          i.due_date,
          i.total,
          i.currency,
          i.status,
          i.created_at,
          c.name as client_name,
          c.last_name as client_last_name
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        WHERE i.company_id = $1
        ORDER BY i.created_at DESC
      `, [companyId]);
    } catch (colErr) {
      if (colErr.code === '42703') {
        result = await pool.query(`
          SELECT
            i.id,
            i.invoice_number,
            '' as title,
            i.client_id,
            i.due_date,
            i.total,
            i.currency,
            i.status,
            i.created_at,
            c.name as client_name,
            c.last_name as client_last_name
          FROM invoices i
          JOIN clients c ON i.client_id = c.id
          WHERE i.company_id = $1
          ORDER BY i.created_at DESC
        `, [companyId]);
      } else {
        throw colErr;
      }
    }

    const invoices = result.rows.map(row => ({
      ...row,
      client_name: [row.client_name, row.client_last_name].filter(Boolean).join(' ').trim() || '—',
    }));

    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching company invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// GET /api/invoices/:invoiceId - Get single invoice with items (must be after GET /)
router.get('/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const invoiceResult = await pool.query(`
      SELECT i.*,
             c.name,
             c.last_name,
             c.address,
             c.zip_code,
             c.city,
             c.email,
             c.phone,
             c.billing_address,
             c.billing_zip_code,
             c.billing_city,
             c.billing_email,
             c.billing_phone,
             u.first_name as created_by_first_name,
             u.last_name as created_by_last_name
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [invoiceId, companyId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const row = invoiceResult.rows[0];
    const client_name = [row.name, row.last_name].filter(Boolean).join(' ').trim() || '—';
    const created_by_name = row.created_by_first_name && row.created_by_last_name
      ? `${row.created_by_first_name} ${row.created_by_last_name}`
      : null;

    const itemsResult = await pool.query(`
      SELECT ii.*,
             j.title as job_title,
             COALESCE(s.title, ii.description) as service_title
      FROM invoice_items ii
      JOIN jobs j ON ii.job_id = j.id
      LEFT JOIN services s ON ii.service_id = s.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.id ASC
    `, [invoiceId]);

    const invoice = {
      ...row,
      client_name,
      created_by_name,
      items: itemsResult.rows,
    };

    res.json({ invoice });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
});

const ALLOWED_STATUSES = ['draft', 'sent', 'paid', 'credited', 'overdue', 'cancelled'];

// PUT /api/invoices/:invoiceId/status - Update invoice status
router.put('/:invoiceId/status', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use: draft, sent, paid, credited, overdue, cancelled' });
    }

    const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];

    if (status === 'sent') {
      updateFields.push('sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)');
    } else if (status === 'paid') {
      updateFields.push('paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)');
    }

    const result = await pool.query(`
      UPDATE invoices
      SET ${updateFields.join(', ')}
      WHERE id = $2 AND company_id = $3
      RETURNING *
    `, [...values, invoiceId, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status', details: error.message });
  }
});

module.exports = router;
