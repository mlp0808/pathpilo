const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

// GET /api/lead-form - Get lead form settings
router.get('/', async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(
      'SELECT token, settings FROM lead_forms WHERE company_id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.json({ form: { token: null, settings: null } });
    }

    res.json({ 
      form: {
        token: result.rows[0].token,
        settings: result.rows[0].settings
      }
    });
  } catch (error) {
    console.error('Error fetching lead form:', error);
    res.status(500).json({ error: 'Failed to fetch lead form settings' });
  }
});

// PUT /api/lead-form - Update lead form settings
router.put('/', async (req, res) => {
  try {
    const { settings } = req.body;

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Check if lead form exists
    const existing = await pool.query(
      'SELECT token FROM lead_forms WHERE company_id = $1',
      [companyId]
    );

    let token;
    if (existing.rows.length === 0) {
      // Generate new token for new lead form
      token = crypto.randomBytes(32).toString('hex');
      await pool.query(`
        INSERT INTO lead_forms (company_id, token, settings)
        VALUES ($1, $2, $3)
      `, [companyId, token, JSON.stringify(settings)]);
    } else {
      // Use existing token
      token = existing.rows[0].token;
      await pool.query(`
        UPDATE lead_forms 
        SET settings = $1, updated_at = NOW()
        WHERE company_id = $2
      `, [JSON.stringify(settings), companyId]);
    }

    res.json({
      message: 'Lead form settings updated successfully',
      form: {
        token,
        settings
      }
    });
  } catch (error) {
    console.error('Error updating lead form:', error);
    res.status(500).json({ error: 'Failed to update lead form settings' });
  }
});

module.exports = router;
