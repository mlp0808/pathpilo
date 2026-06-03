const express = require('express');
const { pool } = require('../utils/database');
const {
  fetchUserCompanies,
  fetchPendingInvitesForEmail,
  DEFAULT_LANGUAGE_CODE,
} = require('../utils/userLoginPayload');

const router = express.Router();

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

// GET /profile - Get user profile
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, role, language_code FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const companies = await fetchUserCompanies(userId);
    const pendingInvites = await fetchPendingInvitesForEmail(user.email);

    // Respect JWT active company — never auto-pick the first owned company for multi-company users.
    const jwtCompanyId = req.user.activeCompanyId;
    let activeCompany = null;
    if (jwtCompanyId) {
      activeCompany = companies.find((c) => c.id === jwtCompanyId) || null;
    }
    if (!activeCompany) {
      activeCompany =
        companies.find((c) => !c.suspendedAt) || (companies.length > 0 ? companies[0] : null);
    }

    const membershipRole = activeCompany?.role;

    const payload = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: membershipRole || user.role,
      languageCode: user.language_code || DEFAULT_LANGUAGE_CODE,
      companies,
      pendingInvites,
      activeCompany: activeCompany || null,
    };
    if (activeCompany) {
      payload.companyId = activeCompany.id;
      payload.companyName = activeCompany.name;
    }

    res.json({ user: payload });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET /api/users - Get company users (non-admin endpoint)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Use activeCompanyId from JWT — this is set correctly on login and company switch.
    // Never use LIMIT 1 without ordering: it returns an unpredictable company for multi-company users.
    let companyId = req.user.activeCompanyId;

    if (!companyId) {
      // Fallback: take the first company this user owns, then any company
      const result = await pool.query(`
        SELECT uc.company_id
        FROM user_companies uc
        JOIN companies c ON uc.company_id = c.id
        WHERE uc.user_id = $1
        ORDER BY CASE WHEN uc.role = 'owner' THEN 0 ELSE 1 END, uc.created_at ASC
        LIMIT 1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'No active company found' });
      }
      companyId = result.rows[0].company_id;
    }

    const usersResult = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, uc.role, u.created_at
      FROM users u
      JOIN user_companies uc ON u.id = uc.user_id
      WHERE uc.company_id = $1
      ORDER BY u.created_at ASC
    `, [companyId]);

    res.json({
      users: usersResult.rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /profile - Update user profile (mounted at /api/user)
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, email, languageCode } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already taken by another user' });
    }

    const result = await pool.query(
      'UPDATE users SET first_name = $1, last_name = $2, email = $3, language_code = COALESCE($4, language_code, \'en\'), updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, first_name, last_name, email, role, language_code',
      [
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        languageCode ? String(languageCode).trim().toLowerCase() : null,
        userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const updatedUser = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      languageCode: user.language_code || 'en',
      role: user.role
    };

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /api/users/:userId - Remove user from company
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;
    const currentUserCompanyId = req.user.activeCompanyId;

    if (!currentUserCompanyId) {
      return res.status(400).json({ error: 'No active company found' });
    }

    // Verify the user being removed is in the same company
    const userCompanyCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, currentUserCompanyId]
    );

    if (userCompanyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found in this company' });
    }

    const userRole = userCompanyCheck.rows[0].role;

    // Prevent removing owners
    if (userRole === 'owner') {
      return res.status(403).json({ error: 'Cannot remove company owner' });
    }

    // Prevent removing yourself
    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({ error: 'Cannot remove yourself from the company' });
    }

    // Remove user from company (delete from user_companies table)
    await pool.query(
      'DELETE FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, currentUserCompanyId]
    );

    res.json({
      message: 'User removed from company successfully'
    });
  } catch (error) {
    console.error('Error removing user from company:', error);
    res.status(500).json({ error: 'Failed to remove user from company' });
  }
});

module.exports = router;
