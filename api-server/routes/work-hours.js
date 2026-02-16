const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// Helper function to get active company ID
const getActiveCompanyId = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT uc.company_id, uc.role
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return { error: 'No active company found', status: 400 };
    }

    return { companyId: result.rows[0].company_id, userRole: result.rows[0].role };
  } catch (error) {
    console.error('Error getting active company:', error);
    return { error: 'Failed to get company access', status: 500 };
  }
};

// Authentication middleware
function authenticateToken(req, res, next) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
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

// GET /api/work-hours/:userId - Get work hours for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const targetUserCheck = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (targetUserCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    const result = await pool.query(
      'SELECT * FROM user_company_work_hours WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (result.rows.length === 0) {
      const defaultHours = {
        user_id: parseInt(userId),
        company_id: companyId,
        monday_hours: 7.5,
        tuesday_hours: 7.5,
        wednesday_hours: 7.5,
        thursday_hours: 7.5,
        friday_hours: 7.0,
        saturday_hours: 0.0,
        sunday_hours: 0.0
      };
      return res.json({ workHours: defaultHours });
    }

    res.json({ workHours: result.rows[0] });
  } catch (error) {
    console.error('Error fetching work hours:', error);
    res.status(500).json({ error: 'Failed to fetch work hours' });
  }
});

// PUT /api/work-hours/:userId - Update work hours for a user
router.put('/:userId', async (req, res) => {
  try {
    const { workHours } = req.body;
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const currentUserRole = companyAccess.userRole;

    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only owners and admins can edit work hours' });
    }

    const targetUserCheck = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (targetUserCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    const { monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours } = workHours;

    const result = await pool.query(`
      INSERT INTO user_company_work_hours 
      (user_id, company_id, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET
        monday_hours = EXCLUDED.monday_hours,
        tuesday_hours = EXCLUDED.tuesday_hours,
        wednesday_hours = EXCLUDED.wednesday_hours,
        thursday_hours = EXCLUDED.thursday_hours,
        friday_hours = EXCLUDED.friday_hours,
        saturday_hours = EXCLUDED.saturday_hours,
        sunday_hours = EXCLUDED.sunday_hours,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, companyId, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours]);

    res.json({
      message: 'Work hours updated successfully',
      workHours: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating work hours:', error);
    res.status(500).json({ error: 'Failed to update work hours' });
  }
});

module.exports = router;
