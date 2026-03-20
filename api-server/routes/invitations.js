const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// GET /api/invitations/:token — public, no auth needed
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT
        ci.id, ci.email, ci.role, ci.token, ci.expires_at,
        c.name  AS company_name,
        c.slug  AS company_slug,
        u.first_name AS invited_by_first,
        u.last_name  AS invited_by_last
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      LEFT JOIN users u ON ci.invited_by_user_id = u.id
      WHERE ci.token = $1
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const inv = result.rows[0];

    // Check if a user account already exists for this email
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [inv.email]);
    const userExists = userCheck.rows.length > 0;

    res.json({
      invitation: {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        companyName: inv.company_name,
        companySlug: inv.company_slug,
        invitedByName: inv.invited_by_first
          ? `${inv.invited_by_first} ${inv.invited_by_last}`.trim()
          : 'Your team',
        expiresAt: inv.expires_at,
        userExists,
      },
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    res.status(500).json({ error: 'Failed to load invitation' });
  }
});

// POST /api/invitations/:token/accept — requires auth
router.post('/:token/accept', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.userId;

    const inviteResult = await pool.query(`
      SELECT ci.*, c.name AS company_name, c.slug AS company_slug
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      WHERE ci.token = $1
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    // Verify the logged-in user's email matches the invitation
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation is not for your email address' });
    }

    // Link user to company
    await pool.query(`
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role
    `, [userId, invitation.company_id, invitation.role]);

    // Mark invitation accepted
    await pool.query(
      `UPDATE company_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invitation.id]
    );

    // Build a fresh JWT with the new company context
    const companiesResult = await pool.query(`
      SELECT uc.company_id AS id, uc.role, c.name, c.slug
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      ORDER BY uc.created_at ASC
    `, [userId]);

    const companies = companiesResult.rows;
    const activeCompany = companies.find(c => c.id === invitation.company_id) || companies[0];

    const newToken = jwt.sign(
      {
        userId,
        email: user.email,
        role: activeCompany?.role || 'employee',
        activeCompanyId: activeCompany?.id || null,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Invitation accepted successfully',
      token: newToken,
      user: {
        id: userId,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: activeCompany?.role || 'employee',
        activeCompany: activeCompany || null,
        companies,
      },
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

module.exports = router;
