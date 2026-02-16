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

// Helper function to get active company ID
const getActiveCompanyId = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT uc.company_id, c.name as company_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return { error: 'No active company found', status: 400 };
    }

    return { companyId: result.rows[0].company_id };
  } catch (error) {
    console.error('Error getting active company:', error);
    return { error: 'Failed to get company access', status: 500 };
  }
};

// GET /api/leads - Get all leads
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(`
      SELECT * FROM leads
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [companyId]);

    res.json({
      leads: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// PUT /api/leads/:leadId - Update lead
router.put('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    // Get user's company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify lead belongs to user's company
    const leadCheck = await pool.query(
      'SELECT id FROM leads WHERE id = $1 AND company_id = $2',
      [leadId, companyId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or access denied' });
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

    values.push(leadId);

    const updateQuery = `
      UPDATE leads
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      message: 'Lead updated successfully',
      lead: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

module.exports = router;
