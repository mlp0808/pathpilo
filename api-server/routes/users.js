const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// GET /api/admin/users - Get all users (admin only)
router.get('/', async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.created_at,
        COUNT(DISTINCT uc.company_id) as company_count,
        COUNT(DISTINCT j.id) as job_count
      FROM users u
      LEFT JOIN user_companies uc ON u.id = uc.user_id
      LEFT JOIN jobs j ON u.id = j.assigned_user_id
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.created_at
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/companies/:companyId/invite - Invite user to company
router.post('/companies/:companyId/invite', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { email, role } = req.body;
    const userId = req.user.userId;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // Verify user has permission to invite (owner or admin)
    const permissionCheck = await pool.query(`
      SELECT uc.role, c.name as company_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2 AND uc.is_active = true
    `, [userId, companyId]);

    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const userRole = permissionCheck.rows[0].role;
    if (userRole !== 'owner' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can invite users' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    let invitedUserId;
    if (existingUser.rows.length > 0) {
      invitedUserId = existingUser.rows[0].id;

      // Check if user is already in the company
      const companyCheck = await pool.query(`
        SELECT id FROM user_companies
        WHERE user_id = $1 AND company_id = $2
      `, [invitedUserId, companyId]);

      if (companyCheck.rows.length > 0) {
        return res.status(400).json({ error: 'User is already a member of this company' });
      }
    }

    // Generate invitation token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Create invitation
    const inviteResult = await pool.query(`
      INSERT INTO company_invitations
      (company_id, email, role, token, expires_at, invited_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [companyId, email, role, token, expiresAt, userId]);

    // Send invitation email
    const companyName = permissionCheck.rows[0].company_name;
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invitations/${token}`;

    // Email sending logic would go here
    console.log(`Invitation sent to ${email} for ${companyName} with role ${role}`);
    console.log(`Invite link: ${inviteLink}`);

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: inviteResult.rows[0].id,
        email,
        role,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// GET /api/companies/:companyId/invitations - Get company invitations
router.get('/companies/:companyId/invitations', async (req, res) => {
  try {
    const { companyId } = req.params;
    const userId = req.user.userId;

    // Verify user has access to company
    const accessCheck = await pool.query(`
      SELECT role FROM user_companies
      WHERE user_id = $1 AND company_id = $2
    `, [userId, companyId]);

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const result = await pool.query(`
      SELECT
        ci.*,
        u.first_name as invited_by_name,
        u.last_name as invited_by_last_name
      FROM company_invitations ci
      LEFT JOIN users u ON ci.invited_by = u.id
      WHERE ci.company_id = $1
      ORDER BY ci.created_at DESC
    `, [companyId]);

    res.json({
      invitations: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// GET /api/invitations/:token - Get invitation details
router.get('/invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT
        ci.*,
        c.name as company_name,
        c.slug as company_slug,
        u.first_name as invited_by_name,
        u.last_name as invited_by_last_name
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      LEFT JOIN users u ON ci.invited_by = u.id
      WHERE ci.token = $1 AND ci.status = 'pending' AND ci.expires_at > NOW()
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = result.rows[0];

    res.json({
      invitation: {
        id: invitation.id,
        companyName: invitation.company_name,
        companySlug: invitation.company_slug,
        email: invitation.email,
        role: invitation.role,
        invitedBy: `${invitation.invited_by_name} ${invitation.invited_by_last_name}`,
        expiresAt: invitation.expires_at
      }
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    res.status(500).json({ error: 'Failed to fetch invitation' });
  }
});

// POST /api/invitations/:token/accept - Accept invitation
router.post('/invitations/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.userId;

    // Find and validate invitation
    const inviteResult = await pool.query(`
      SELECT ci.*, c.name as company_name
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      WHERE ci.token = $1 AND ci.status = 'pending' AND ci.expires_at > NOW()
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    // Check if current user matches invitation email
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0].email !== invitation.email) {
      return res.status(403).json({ error: 'This invitation is not for your email address' });
    }

    // Link user to company
    await pool.query(`
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, company_id) DO UPDATE SET role = $3
    `, [userId, invitation.company_id, invitation.role]);

    // Mark invitation as accepted
    await pool.query(`
      UPDATE company_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = $1
    `, [invitation.id]);

    res.json({
      message: 'Invitation accepted successfully',
      company: {
        id: invitation.company_id,
        name: invitation.company_name
      }
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

module.exports = router;
