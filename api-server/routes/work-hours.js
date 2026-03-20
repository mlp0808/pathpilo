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

// Auto-migrate: add location columns to user_company_work_hours if they don't exist
async function ensureLocationColumns() {
  try {
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS start_address TEXT');
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS end_address TEXT');
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS use_company_default_location BOOLEAN DEFAULT TRUE');
  } catch (e) {
    // ignore
  }
}
ensureLocationColumns();

// GET /api/work-hours/:userId - Get work hours + location settings for a user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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
      return res.json({
        workHours: {
          user_id: parseInt(userId),
          company_id: companyId,
          monday_hours: 7.5,
          tuesday_hours: 7.5,
          wednesday_hours: 7.5,
          thursday_hours: 7.5,
          friday_hours: 7.0,
          saturday_hours: 0.0,
          sunday_hours: 0.0,
          start_address: null,
          end_address: null,
          use_company_default_location: true,
        }
      });
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
    const workHours = req.body && req.body.workHours;
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const currentUserRole = companyAccess.userRole;

    const isOwnerOrAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';
    const isEditingSelf = String(userId) === String(currentUserId);
    if (!isOwnerOrAdmin && !isEditingSelf) {
      return res.status(403).json({ error: 'Access denied: Only owners and admins can edit other users, or you can edit your own' });
    }

    const targetUserCheck = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (targetUserCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    // If only location is being updated, fetch existing work hours so we don't overwrite with undefined
    let monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours;
    if (workHours && typeof workHours === 'object') {
      ({ monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours } = workHours);
    } else {
      const existing = await pool.query(
        'SELECT monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours FROM user_company_work_hours WHERE user_id = $1 AND company_id = $2',
        [userId, companyId]
      );
      if (existing.rows.length > 0) {
        const r = existing.rows[0];
        monday_hours = r.monday_hours; tuesday_hours = r.tuesday_hours; wednesday_hours = r.wednesday_hours;
        thursday_hours = r.thursday_hours; friday_hours = r.friday_hours; saturday_hours = r.saturday_hours; sunday_hours = r.sunday_hours;
      } else {
        monday_hours = 7.5; tuesday_hours = 7.5; wednesday_hours = 7.5; thursday_hours = 7.5; friday_hours = 7; saturday_hours = 0; sunday_hours = 0;
      }
    }
    const start_address = req.body.start_address !== undefined ? req.body.start_address : null;
    const end_address = req.body.end_address !== undefined ? req.body.end_address : null;
    const use_company_default_location = req.body.use_company_default_location !== undefined
      ? Boolean(req.body.use_company_default_location)
      : true;

    const result = await pool.query(`
      INSERT INTO user_company_work_hours
      (user_id, company_id, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours, start_address, end_address, use_company_default_location)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET
        monday_hours = EXCLUDED.monday_hours,
        tuesday_hours = EXCLUDED.tuesday_hours,
        wednesday_hours = EXCLUDED.wednesday_hours,
        thursday_hours = EXCLUDED.thursday_hours,
        friday_hours = EXCLUDED.friday_hours,
        saturday_hours = EXCLUDED.saturday_hours,
        sunday_hours = EXCLUDED.sunday_hours,
        start_address = EXCLUDED.start_address,
        end_address = EXCLUDED.end_address,
        use_company_default_location = EXCLUDED.use_company_default_location,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, companyId, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours, start_address, end_address, use_company_default_location]);

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
