const express = require('express');
const { pool } = require('../utils/database');

// Idempotently make sure the services table has the columns we need for
// the "archive on delete" flow (keep the row + the foreign keys; hide it
// from pickers). Runs once per process the first time the route fires.
let serviceLifecycleMigrationDone = false;
async function ensureServiceLifecycleColumns() {
  if (serviceLifecycleMigrationDone) return;
  serviceLifecycleMigrationDone = true;
  try {
    await pool.query(
      `ALTER TABLE services ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
    );
  } catch (e) {
    serviceLifecycleMigrationDone = false;
    console.warn('ensureServiceLifecycleColumns failed:', e?.message || e);
  }
}

const router = express.Router();

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Helper function to get active company ID from JWT token
const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }

  return { companyId: activeCompanyId };
};

// GET /api/services - Get all services for the company.
//
// Archived services (archived_at IS NOT NULL) are excluded by default so
// they disappear from job/subscription pickers but still resolve when an
// older job_services row joins back. Pass ?include_archived=true to also
// list archived ones (used by the admin "Archived services" view).
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    await ensureServiceLifecycleColumns();
    const includeArchived =
      String(req.query.include_archived || '').toLowerCase() === 'true';

    const result = await pool.query(`
      SELECT
        s.*,
        COUNT(js.id) as usage_count
      FROM services s
      LEFT JOIN job_services js ON s.id = js.service_id
      LEFT JOIN jobs j ON js.job_id = j.id
      WHERE s.company_id = $1
      ${includeArchived ? '' : 'AND s.archived_at IS NULL'}
      GROUP BY s.id
      ORDER BY s.title ASC
    `, [companyId]);

    res.json({
      services: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services: ' + error.message });
  }
});

// POST /api/services - Create new service
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      title,
      description,
      price,
      duration_minutes,
      category,
      // Optional chart-of-accounts code for bookkeeping integrations.
      bookkeeping_account
    } = req.body;
    const userId = req.user?.userId || req.user?.id;

    // Accept either name or title for the service name
    const serviceName = (name ?? title ?? '').toString().trim();
    const priceVal = price !== undefined && price !== null && price !== '' ? Number(price) : undefined;
    const durationVal = duration_minutes !== undefined && duration_minutes !== null && duration_minutes !== '' ? Number(duration_minutes) : undefined;

    // Validate required fields
    if (!serviceName || priceVal === undefined || durationVal === undefined || isNaN(priceVal) || isNaN(durationVal)) {
      return res.status(400).json({ error: 'Name, price, and duration are required' });
    }

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const bookkeepingAccountVal =
      bookkeeping_account === undefined || bookkeeping_account === null || String(bookkeeping_account).trim() === ''
        ? null
        : String(bookkeeping_account).trim().slice(0, 32);

    const result = await pool.query(`
      INSERT INTO services
      (company_id, title, price, duration_minutes, bookkeeping_account)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [companyId, serviceName, priceVal, durationVal, bookkeepingAccountVal]);

    res.status(201).json({
      message: 'Service created successfully',
      service: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service: ' + error.message });
  }
});

// PUT /api/services/:serviceId - Update service
router.put('/:serviceId', authenticateToken, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const updates = req.body;
    const userId = req.user?.userId || req.user?.id;

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify service belongs to user's company
    const serviceCheck = await pool.query(
      'SELECT id FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    // Build update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'id' && key !== 'company_id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(serviceId);

    const updateQuery = `
      UPDATE services
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      message: 'Service updated successfully',
      service: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service: ' + error.message });
  }
});

// DELETE /api/services/:serviceId - Archive a service.
//
// We KEEP the row so old job_services rows that reference this service still
// resolve their title/price. The service just disappears from "active"
// pickers because GET /services filters out archived_at IS NOT NULL. Pass
// ?hard=true for a real DELETE; that still fails if anything references it.
router.delete('/:serviceId', authenticateToken, async (req, res) => {
  try {
    const { serviceId } = req.params;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    await ensureServiceLifecycleColumns();

    const serviceCheck = await pool.query(
      'SELECT id, archived_at FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId],
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }
    if (serviceCheck.rows[0].archived_at) {
      return res.json({
        message: 'Service is already archived',
        already_archived: true,
      });
    }

    const wantsHardDelete = String(req.query.hard || '').toLowerCase() === 'true';

    if (wantsHardDelete) {
      const usageCheck = await pool.query(
        'SELECT COUNT(*) as usage_count FROM job_services WHERE service_id = $1',
        [serviceId],
      );
      if (Number(usageCheck.rows[0].usage_count) > 0) {
        return res.status(400).json({
          error:
            'Cannot hard-delete a service that is used in existing jobs. Archive it instead.',
        });
      }
      await pool.query('DELETE FROM services WHERE id = $1', [serviceId]);
      return res.json({ message: 'Service deleted', hard: true });
    }

    await pool.query(
      `UPDATE services
         SET archived_at = NOW(),
             updated_at  = NOW()
       WHERE id = $1`,
      [serviceId],
    );

    return res.json({
      message: 'Service archived',
      archived: true,
    });

  } catch (error) {
    console.error('Error archiving service:', error);
    res.status(500).json({ error: 'Failed to archive service: ' + error.message });
  }
});

// POST /api/services/:serviceId/restore - Restore an archived service.
router.post('/:serviceId/restore', authenticateToken, async (req, res) => {
  try {
    const { serviceId } = req.params;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    await ensureServiceLifecycleColumns();

    const serviceCheck = await pool.query(
      'SELECT id FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId],
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    const result = await pool.query(
      `UPDATE services
         SET archived_at = NULL,
             updated_at  = NOW()
       WHERE id = $1
       RETURNING *`,
      [serviceId],
    );

    res.json({
      message: 'Service restored',
      service: result.rows[0],
    });
  } catch (error) {
    console.error('Error restoring service:', error);
    res.status(500).json({ error: 'Failed to restore service: ' + error.message });
  }
});

module.exports = router;
