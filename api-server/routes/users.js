const express = require('express');
const { pool } = require('../utils/database');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('../utils/email');

const router = express.Router();

function buildInvitationEmail({ email, companyName, inviterName, role, inviteLink, expiresAt }) {
  const rolePretty = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Employee';
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fromName = process.env.FROM_NAME || 'Vevago';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to join ${companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding:0 0 24px 0;">
              <span style="display:inline-block;font-size:22px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px;">${fromName}</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

              <!-- Top accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:5px;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:20px 20px 0 0;"></td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:48px 48px 40px;">

                    <!-- Avatar icon -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="width:56px;height:56px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px;text-align:center;vertical-align:middle;">
                          <span style="font-size:28px;line-height:56px;">👋</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Headline -->
                    <p style="margin:0 0 8px;font-size:26px;font-weight:700;color:#111827;line-height:1.25;">You're invited!</p>
                    <p style="margin:0 0 28px;font-size:16px;color:#6b7280;line-height:1.6;">
                      <strong style="color:#374151;">${inviterName}</strong> has invited you to join
                      <strong style="color:#374151;">${companyName}</strong> on ${fromName} as a <strong style="color:#374151;">${rolePretty}</strong>.
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr><td style="height:1px;background:#f0f0f0;"></td></tr>
                    </table>

                    <!-- Info pills -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                      <tr>
                        <td style="padding:0 12px 0 0;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#f3f4f6;border-radius:10px;padding:10px 16px;">
                                <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;">Company</p>
                                <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${companyName}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td>
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#f3f4f6;border-radius:10px;padding:10px 16px;">
                                <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;">Your role</p>
                                <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827;">${rolePretty}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 4px 14px rgba(99,102,241,0.35);">
                          <a href="${inviteLink}" target="_blank"
                             style="display:inline-block;padding:16px 40px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.1px;">
                            Accept Invitation →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry notice -->
                    <p style="margin:0 0 28px;font-size:13px;color:#9ca3af;">
                      ⏳ This invitation expires on <strong style="color:#6b7280;">${expiryDate}</strong>.
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                      <tr><td style="height:1px;background:#f0f0f0;"></td></tr>
                    </table>

                    <!-- Fallback link -->
                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                      If the button doesn't work, copy and paste this link into your browser:<br/>
                      <a href="${inviteLink}" style="color:#6366f1;word-break:break-all;">${inviteLink}</a>
                    </p>
                    ${STANDARD_FOOTER_PLACEHOLDER}

                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You've been invited to join ${companyName} on ${fromName}

${inviterName} has invited you to join ${companyName} as a ${rolePretty}.

Accept your invitation here:
${inviteLink}

This invitation expires on ${expiryDate}.

If you weren't expecting this, you can safely ignore this email.`;

  return { html, text, subject: `You're invited to join ${companyName} on ${fromName}` };
}

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
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    // Fetch inviter name
    const inviterResult = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);
    const inviterName = inviterResult.rows.length > 0
      ? `${inviterResult.rows[0].first_name} ${inviterResult.rows[0].last_name}`
      : 'Your team';

    const { html, text, subject } = buildInvitationEmail({ email, companyName, inviterName, role, inviteLink, expiresAt });

    try {
      await sendEmail({ to: email, subject, html, text, companyId: parseInt(companyId, 10) });
      console.log(`✅ Invitation email sent to ${email} for ${companyName}`);
    } catch (emailErr) {
      console.error('⚠️ Invitation created but email failed to send:', emailErr.message || emailErr);
    }

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
