const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  fetchUserCompanies,
  fetchPendingInvitesForEmail,
  DEFAULT_LANGUAGE_CODE,
} = require('../utils/userLoginPayload');

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
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))',
      [inv.email]
    );
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
      'SELECT id, first_name, last_name, email, role, language_code FROM users WHERE id = $1',
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

    const companies = await fetchUserCompanies(userId);
    const pendingInvites = await fetchPendingInvitesForEmail(user.email);
    const activeCompany =
      companies.find((c) => c.id === invitation.company_id) ||
      companies.find((c) => !c.suspendedAt) ||
      companies[0] ||
      null;

    const newToken = jwt.sign(
      {
        userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: activeCompany?.role || 'employee',
        activeCompanyId: activeCompany?.id || null,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: userId,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      languageCode: user.language_code || DEFAULT_LANGUAGE_CODE,
      role: activeCompany?.role || 'employee',
      companies,
      pendingInvites,
      activeCompany,
    };
    if (activeCompany) {
      userPayload.companyId = activeCompany.id;
      userPayload.companyName = activeCompany.name;
    }

    res.json({
      message: 'Invitation accepted successfully',
      token: newToken,
      user: userPayload,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// POST /api/invitations/:token/decline — requires auth; marks invite cancelled for this email
router.post('/:token/decline', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.userId;

    const inviteResult = await pool.query(
      `
      SELECT ci.id, ci.email
      FROM company_invitations ci
      WHERE ci.token = $1
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
    `,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, role, language_code FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation is not for your email address' });
    }

    await pool.query(
      `UPDATE company_invitations SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
      [invitation.id]
    );

    const companies = await fetchUserCompanies(userId);
    const pendingInvites = await fetchPendingInvitesForEmail(user.email);
    const activeCompany =
      companies.find((c) => !c.suspendedAt) || (companies.length > 0 ? companies[0] : null);

    const newToken = jwt.sign(
      {
        userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: activeCompany?.role || user.role || 'employee',
        activeCompanyId: activeCompany?.id || null,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userPayload = {
      id: userId,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      languageCode: user.language_code || DEFAULT_LANGUAGE_CODE,
      role: activeCompany?.role || user.role || 'employee',
      companies,
      pendingInvites,
      activeCompany: activeCompany || null,
    };
    if (activeCompany) {
      userPayload.companyId = activeCompany.id;
      userPayload.companyName = activeCompany.name;
    }

    res.json({
      message: 'Invitation declined',
      token: newToken,
      user: userPayload,
    });
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

module.exports = router;
