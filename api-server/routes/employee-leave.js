const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

function authenticateToken(req, res, next) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

const getActiveCompanyId = async (req) => {
  const userId = req.user.userId;
  const result = await pool.query(
    `SELECT uc.company_id, uc.role FROM user_companies uc WHERE uc.user_id = $1 LIMIT 1`,
    [userId]
  );
  if (result.rows.length === 0) return { error: 'No active company found', status: 400 };
  return { companyId: result.rows[0].company_id, userRole: result.rows[0].role };
};

// Auto-migrate: create employee_leave table if it doesn't exist
async function ensureLeaveTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_leave (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        leave_date DATE NOT NULL,
        leave_type VARCHAR(30) NOT NULL DEFAULT 'full_day'
          CHECK (leave_type IN ('full_day', 'half_day_morning', 'half_day_afternoon', 'custom_hours')),
        hours_off DECIMAL(4,1),
        category VARCHAR(30) NOT NULL DEFAULT 'holiday'
          CHECK (category IN ('holiday', 'sick', 'personal', 'public_holiday', 'other')),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, company_id, leave_date)
      )
    `);
  } catch (e) {
    console.error('employee_leave table migration error:', e.message);
  }
}
ensureLeaveTable();

router.use(authenticateToken);

// GET /api/employee-leave/:userId?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    const companyAccess = await getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    // Verify user belongs to company
    const check = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: 'User not in same company' });

    let query = `
      SELECT id, user_id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date,
             leave_type, hours_off, category, note, created_at
      FROM employee_leave
      WHERE user_id = $1 AND company_id = $2
    `;
    const params = [userId, companyId];

    if (from) { query += ` AND leave_date >= $${params.length + 1}`; params.push(from); }
    if (to)   { query += ` AND leave_date <= $${params.length + 1}`; params.push(to); }

    query += ' ORDER BY leave_date ASC';

    const result = await pool.query(query, params);
    res.json({ leave: result.rows });
  } catch (error) {
    console.error('Error fetching employee leave:', error);
    res.status(500).json({ error: 'Failed to fetch leave' });
  }
});

// POST /api/employee-leave/:userId
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { leave_date, leave_type = 'full_day', hours_off, category = 'holiday', note } = req.body;

    if (!leave_date) return res.status(400).json({ error: 'leave_date is required' });

    const companyAccess = await getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId, userRole } = companyAccess;

    // Only owners/admins can set leave for others; anyone can set for themselves
    if (String(req.user.userId) !== String(userId) && userRole !== 'owner' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can manage leave for others' });
    }

    const check = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (check.rows.length === 0) return res.status(403).json({ error: 'User not in same company' });

    const result = await pool.query(`
      INSERT INTO employee_leave (user_id, company_id, leave_date, leave_type, hours_off, category, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, company_id, leave_date)
      DO UPDATE SET
        leave_type = EXCLUDED.leave_type,
        hours_off  = EXCLUDED.hours_off,
        category   = EXCLUDED.category,
        note       = EXCLUDED.note,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, to_char(leave_date, 'YYYY-MM-DD') AS leave_date, leave_type, hours_off, category, note
    `, [userId, companyId, leave_date, leave_type, hours_off || null, category, note || null]);

    res.status(201).json({ leave: result.rows[0] });
  } catch (error) {
    console.error('Error creating employee leave:', error);
    res.status(500).json({ error: 'Failed to create leave entry' });
  }
});

// DELETE /api/employee-leave/:userId/:leaveId
router.delete('/:userId/:leaveId', async (req, res) => {
  try {
    const { userId, leaveId } = req.params;

    const companyAccess = await getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId, userRole } = companyAccess;

    if (String(req.user.userId) !== String(userId) && userRole !== 'owner' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can manage leave for others' });
    }

    const result = await pool.query(
      'DELETE FROM employee_leave WHERE id = $1 AND user_id = $2 AND company_id = $3 RETURNING id',
      [leaveId, userId, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Leave entry not found' });
    res.json({ message: 'Leave entry deleted' });
  } catch (error) {
    console.error('Error deleting employee leave:', error);
    res.status(500).json({ error: 'Failed to delete leave entry' });
  }
});

module.exports = router;
