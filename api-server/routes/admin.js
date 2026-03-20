const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../utils/database');
const { sendEmail } = require('../utils/email');

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

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.use(authenticateToken);
router.use(requireAdmin);

// Ensure required columns exist, then start auto-suspend loop
async function initAdminSchema() {
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP NULL`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trial_invites (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        company_name VARCHAR(255),
        trial_days INTEGER NOT NULL DEFAULT 14,
        token VARCHAR(255) UNIQUE NOT NULL,
        view_count INTEGER NOT NULL DEFAULT 0,
        viewed_at TIMESTAMP NULL,
        registered_at TIMESTAMP NULL,
        registered_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        registered_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE trial_invites ADD COLUMN IF NOT EXISTS email_sent_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE trial_invites ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP NULL`);
    // Run auto-suspend immediately after schema is ready, then every hour
    autoSuspendExpired();
    setInterval(autoSuspendExpired, 60 * 60 * 1000);
  } catch (err) {
    console.error('[admin] Schema init failed:', err.message);
  }
}

// Auto-suspend companies whose expires_at has passed
async function autoSuspendExpired() {
  try {
    const result = await pool.query(`
      UPDATE companies
      SET suspended_at = NOW(), updated_at = NOW()
      WHERE expires_at IS NOT NULL
        AND expires_at < NOW()
        AND suspended_at IS NULL
      RETURNING id, name
    `);
    if (result.rows.length > 0) {
      console.log(`[admin] Auto-suspended ${result.rows.length} expired company/companies:`, result.rows.map(r => r.name).join(', '));
    }
  } catch (err) {
    console.error('[admin] Auto-suspend check failed:', err.message);
  }
}

initAdminSchema();

// GET /api/admin/companies - List all companies
router.get('/companies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.country,
        c.cvr_number,
        c.address,
        c.city,
        c.zip_code,
        c.created_at,
        c.suspended_at,
        c.expires_at,
        u.first_name as owner_first_name,
        u.last_name  as owner_last_name,
        u.email      as owner_email,
        COUNT(uc.user_id)::int as user_count
      FROM companies c
      LEFT JOIN users u  ON c.owner_id  = u.id
      LEFT JOIN user_companies uc ON uc.company_id = c.id
      GROUP BY c.id, u.id
      ORDER BY c.created_at DESC
    `);

    res.json({
      companies: result.rows.map(c => ({
        id:          c.id,
        name:        c.name,
        slug:        c.slug,
        country:     c.country,
        cvrNumber:   c.cvr_number,
        address:     c.address,
        city:        c.city,
        zipCode:     c.zip_code,
        createdAt:   c.created_at,
        suspendedAt: c.suspended_at || null,
        expiresAt:   c.expires_at || null,
        userCount:   c.user_count,
        owner: {
          firstName: c.owner_first_name,
          lastName:  c.owner_last_name,
          email:     c.owner_email,
        },
      })),
    });
  } catch (error) {
    console.error('Error listing companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',   c.id,
              'name', c.name,
              'slug', c.slug,
              'role', uc.role
            ) ORDER BY c.created_at ASC
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS companies
      FROM users u
      LEFT JOIN user_companies uc ON uc.user_id  = u.id
      LEFT JOIN companies c       ON c.id        = uc.company_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: result.rows.map(u => ({
        id:        u.id,
        firstName: u.first_name,
        lastName:  u.last_name,
        email:     u.email,
        role:      u.role,
        createdAt: u.created_at,
        companies: u.companies,
      })),
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/companies/:companyId - Get single company details
router.get('/companies/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.country,
        c.cvr_number,
        c.address,
        c.zip_code,
        c.city,
        c.created_at,
        c.updated_at,
        c.suspended_at,
        c.expires_at,
        u.first_name as owner_first_name,
        u.last_name as owner_last_name,
        u.email as owner_email
      FROM companies c
      LEFT JOIN users u ON c.owner_id = u.id
      WHERE c.id = $1
    `, [companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = result.rows[0];

    res.json({
      company: {
        id: company.id,
        name: company.name,
        country: company.country,
        cvrNumber: company.cvr_number,
        address: company.address,
        zipCode: company.zip_code,
        city: company.city,
        createdAt: company.created_at,
        updatedAt: company.updated_at,
        suspendedAt: company.suspended_at || null,
        expiresAt: company.expires_at || null,
        owner: {
          firstName: company.owner_first_name,
          lastName: company.owner_last_name,
          email: company.owner_email
        }
      }
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// GET /api/admin/companies/:companyId/users - Get users for a company
router.get('/companies/:companyId/users', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(`
      SELECT 
        u.*,
        uc.role as company_role
      FROM users u
      JOIN user_companies uc ON u.id = uc.user_id
      WHERE uc.company_id = $1
      ORDER BY 
        CASE uc.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'employee' THEN 4
          ELSE 5
        END,
        u.created_at ASC
    `, [companyId]);

    res.json({
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching company users:', error);
    res.status(500).json({ error: 'Failed to fetch company users' });
  }
});

// GET /api/admin/companies/:companyId/services - Get services for a company
router.get('/companies/:companyId/services', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(
      'SELECT * FROM services WHERE company_id = $1 ORDER BY created_at DESC',
      [companyId]
    );

    res.json({
      services: result.rows
    });
  } catch (error) {
    console.error('Error fetching company services:', error);
    res.status(500).json({ error: 'Failed to fetch company services' });
  }
});

// GET /api/admin/companies/:companyId/clients - Get clients for a company
router.get('/companies/:companyId/clients', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(
      'SELECT * FROM clients WHERE company_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [companyId]
    );

    res.json({
      clients: result.rows
    });
  } catch (error) {
    console.error('Error fetching company clients:', error);
    res.status(500).json({ error: 'Failed to fetch company clients' });
  }
});

// ============================================
// Video Guides (admin CRUD)
// ============================================

// GET /api/admin/video-guides - List all (admin)
router.get('/video-guides', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, description, duration, video_id, sort_order, created_at
      FROM video_guides
      ORDER BY sort_order ASC, created_at ASC
    `);

    const videos = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      duration: row.duration || '0:00',
      videoId: row.video_id,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    }));

    res.json({ videos });
  } catch (error) {
    console.error('Error fetching video guides:', error);
    res.status(500).json({ error: 'Failed to fetch video guides' });
  }
});

// POST /api/admin/video-guides - Create
router.post('/video-guides', async (req, res) => {
  try {
    const { title, description, duration, videoId } = req.body;

    if (!title || !videoId) {
      return res.status(400).json({ error: 'Title and video ID are required' });
    }

    const maxResult = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM video_guides');
    const nextOrder = maxResult.rows[0]?.next_order || 1;

    const result = await pool.query(
      `INSERT INTO video_guides (title, description, duration, video_id, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, duration, video_id, sort_order, created_at`,
      [title, description || '', duration || '0:00', videoId, nextOrder]
    );

    const row = result.rows[0];
    res.status(201).json({
      video: {
        id: row.id,
        title: row.title,
        description: row.description || '',
        duration: row.duration || '0:00',
        videoId: row.video_id,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error('Error creating video guide:', error);
    res.status(500).json({ error: 'Failed to create video guide' });
  }
});

// PUT /api/admin/video-guides/:id - Update
router.put('/video-guides/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, duration, videoId, sortOrder } = req.body;

    const result = await pool.query(
      `UPDATE video_guides
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           duration = COALESCE($4, duration),
           video_id = COALESCE($5, video_id),
           sort_order = COALESCE($6, sort_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, title, description, duration, video_id, sort_order, created_at`,
      [id, title, description, duration, videoId, sortOrder]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video guide not found' });
    }

    const row = result.rows[0];
    res.json({
      video: {
        id: row.id,
        title: row.title,
        description: row.description || '',
        duration: row.duration || '0:00',
        videoId: row.video_id,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error('Error updating video guide:', error);
    res.status(500).json({ error: 'Failed to update video guide' });
  }
});

// DELETE /api/admin/video-guides/:id
router.delete('/video-guides/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM video_guides WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video guide not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting video guide:', error);
    res.status(500).json({ error: 'Failed to delete video guide' });
  }
});

// PATCH /api/admin/companies/:companyId/expiry — set or clear the access expiry date
router.patch('/companies/:companyId/expiry', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { expiresAt } = req.body; // ISO date string or null to clear

    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    const result = await pool.query(
      `UPDATE companies SET expires_at = $2, updated_at = NOW() WHERE id = $1
       RETURNING id, name, expires_at, suspended_at`,
      [companyId, expiresAt || null]
    );

    const company = result.rows[0];
    res.json({
      message: expiresAt ? 'Expiry date updated' : 'Expiry date cleared (access is now permanent)',
      company: {
        id: company.id,
        name: company.name,
        expiresAt: company.expires_at || null,
        suspendedAt: company.suspended_at || null,
      },
    });
  } catch (error) {
    console.error('Error updating expiry:', error);
    res.status(500).json({ error: 'Failed to update expiry date' });
  }
});

// PATCH /api/admin/companies/:companyId/hold — toggle suspension
router.patch('/companies/:companyId/hold', async (req, res) => {
  try {
    const { companyId } = req.params;

    const current = await pool.query('SELECT suspended_at FROM companies WHERE id = $1', [companyId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    const isSuspended = !!current.rows[0].suspended_at;
    const newValue = isSuspended ? null : 'NOW()';

    const result = await pool.query(
      `UPDATE companies SET suspended_at = ${newValue}, updated_at = NOW() WHERE id = $1
       RETURNING id, name, suspended_at`,
      [companyId]
    );

    const company = result.rows[0];
    res.json({
      message: isSuspended ? 'Company reactivated' : 'Company put on hold',
      company: { id: company.id, name: company.name, suspendedAt: company.suspended_at || null },
    });
  } catch (error) {
    console.error('Error toggling company hold:', error);
    res.status(500).json({ error: 'Failed to update company status' });
  }
});

// DELETE /api/admin/companies/:companyId — permanently delete company + all data
// Employees/users are NOT deleted — they are their own entity and can create new companies.
router.delete('/companies/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { confirmName } = req.body;

    // Verify company exists and get name for confirmation check
    const companyCheck = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
    if (companyCheck.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    const companyName = companyCheck.rows[0].name;

    // Require the caller to type the exact company name
    if (!confirmName || confirmName.trim() !== companyName.trim()) {
      return res.status(400).json({
        error: 'Confirmation name does not match',
        expected: companyName,
      });
    }

    // Null out owner_id first to avoid FK conflict when the company row is deleted
    await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);

    // Delete the company — all child tables (clients, jobs, invoices, services,
    // subscriptions, user_companies, etc.) cascade automatically via ON DELETE CASCADE.
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);

    res.json({ message: `Company "${companyName}" and all its data have been permanently deleted.` });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company: ' + error.message });
  }
});

// ── Trial invites ──────────────────────────────────────────────────────────

// GET /api/admin/trial-invites
router.get('/trial-invites', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ti.*,
        u.first_name  AS reg_first_name,
        u.last_name   AS reg_last_name,
        u.email       AS reg_email,
        c.name        AS reg_company_name,
        c.slug        AS reg_company_slug
      FROM trial_invites ti
      LEFT JOIN users     u ON u.id = ti.registered_user_id
      LEFT JOIN companies c ON c.id = ti.registered_company_id
      ORDER BY ti.created_at DESC
    `);
    res.json({ trials: result.rows });
  } catch (err) {
    console.error('[admin] trial list error:', err);
    res.status(500).json({ error: 'Failed to fetch trial invites' });
  }
});

// POST /api/admin/trial-invites
router.post('/trial-invites', async (req, res) => {
  try {
    const { email, firstName, lastName, companyName, trialDays } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, firstName and lastName are required' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const days  = parseInt(trialDays, 10) || 14;
    const result = await pool.query(
      `INSERT INTO trial_invites (email, first_name, last_name, company_name, trial_days, token)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [email.toLowerCase().trim(), firstName.trim(), lastName.trim(), companyName?.trim() || null, days, token]
    );
    res.status(201).json({ trial: result.rows[0] });
  } catch (err) {
    console.error('[admin] trial create error:', err);
    res.status(500).json({ error: 'Failed to create trial invite' });
  }
});

async function buildTrialInviteEmailPayload({ trial, req }) {
  const appUrl =
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';
  const normalizedAppUrl = appUrl.replace(/\/$/, '');
  const assetBaseUrl =
    process.env.EMAIL_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';
  const normalizedAssetBaseUrl = assetBaseUrl.replace(/\/$/, '');
  const registerUrl = `${normalizedAppUrl}/register?trial=${trial.token}`;
  const screenshot1Url = `${normalizedAssetBaseUrl}/email/trial/trial-01-overview.png`;
  const screenshot2Url = `${normalizedAssetBaseUrl}/email/trial/trial-02-route-planner.png`;
  const screenshot3Url = `${normalizedAssetBaseUrl}/email/trial/trial-03-job-details.png`;
  const firstName = trial.first_name || 'dig';
  const imageDir = path.resolve(__dirname, '../../public/email/trial');
  const requestedImages = [
    { filename: 'trial-01-overview.png', cid: 'trial-shot-1' },
    { filename: 'trial-02-route-planner.png', cid: 'trial-shot-2' },
    { filename: 'trial-03-job-details.png', cid: 'trial-shot-3' },
  ];
  const attachments = [];
  for (const img of requestedImages) {
    try {
      const content = await fs.readFile(path.join(imageDir, img.filename));
      attachments.push({
        filename: img.filename,
        content,
        type: 'image/png',
        disposition: 'inline',
        content_id: img.cid,
      });
    } catch {
      // Missing local image; fallback to URL in HTML.
    }
  }
  const hasCid = new Set(attachments.map((a) => a.content_id));
  const srcFor = (cid, fallbackUrl) => (hasCid.has(cid) ? `cid:${cid}` : fallbackUrl);

  const subject = `${firstName}, tak fordi du vil prøve Pathpilo`;
  const text = [
    `Hej ${firstName},`,
    '',
    'Tak fordi du vil prøve vores demo af Pathpilo.',
    `Din adgang er klar med ${trial.trial_days} dages gratis prøveperiode.`,
    '',
    'Med Pathpilo kan du blandt andet:',
    '- planlægge dagens opgaver hurtigere',
    '- optimere ruter og reducere køretid',
    '- holde styr på kunder, jobs og opfølgning samlet ét sted',
    '',
    `Kom i gang her: ${registerUrl}`,
    '',
    'Vi glæder os til at høre, hvad du synes.',
    '',
    'Venlig hilsen',
    'Team Pathpilo',
  ].join('\n');

  const html = `
    <div style="margin:0;padding:0;background:#f3faf5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:28px 28px 18px;background:linear-gradient(135deg,#159947,#3dd57a);">
                  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ddffe9;font-weight:700;">Pathpilo demo</div>
                  <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;">Hej ${firstName} - din demo er klar</h1>
                  <p style="margin:12px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">
                    Tak fordi du vil prøve Pathpilo. Vi har gjort en personlig <strong style="color:#ffffff;">${trial.trial_days}-dages prøveadgang</strong> klar${trial.company_name ? ` til <strong style="color:#ffffff;">${trial.company_name}</strong>` : ''}.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 28px;">
                  <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">
                    Pathpilo hjælper servicevirksomheder med at planlægge smartere, sætte de rigtige medarbejdere på de rigtige opgaver og spare tid i hverdagen.
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151;">
                    Klik herunder for at oprette din konto og teste systemet med det samme:
                  </p>
                  <a href="${registerUrl}" style="display:inline-block;background:#159947;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px;">
                    Start min demo
                  </a>
                  <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                    Hvis knappen ikke virker, kan du kopiere linket her:<br />
                    <span style="color:#0f7a3b;word-break:break-all;">${registerUrl}</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 28px 24px;">
                  <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Det her kan du forvente i demoen</h2>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="padding:0 0 10px;">
                        <img
                          src="${srcFor('trial-shot-1', screenshot1Url)}"
                          alt="Overblik i Pathpilo"
                          style="display:block;width:100%;height:auto;border:1px solid #dbe1ea;border-radius:12px;"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0 0 10px;">
                        <img
                          src="${srcFor('trial-shot-2', screenshot2Url)}"
                          alt="Ruteplanlægger i Pathpilo"
                          style="display:block;width:100%;height:auto;border:1px solid #dbe1ea;border-radius:12px;"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:0;">
                        <img
                          src="${srcFor('trial-shot-3', screenshot3Url)}"
                          alt="Jobdetaljer i Pathpilo"
                          style="display:block;width:100%;height:auto;border:1px solid #dbe1ea;border-radius:12px;"
                        />
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px 26px;">
                  <div style="border-top:1px solid #e5e7eb;padding-top:14px;color:#6b7280;font-size:12px;line-height:1.6;">
                    Du modtager denne mail, fordi der er oprettet en demo-invitation til ${trial.email}.<br />
                    Team Pathpilo
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html, registerUrl, attachments };
}

// GET /api/admin/trial-invites/:id/email-preview
router.get('/trial-invites/:id/email-preview', async (req, res) => {
  try {
    const trialId = parseInt(req.params.id, 10);
    if (!Number.isFinite(trialId) || trialId <= 0) {
      return res.status(400).json({ error: 'Invalid trial id' });
    }

    const trialResult = await pool.query(
      `SELECT id, email, first_name, last_name, company_name, trial_days, token, registered_at
       FROM trial_invites
       WHERE id = $1`,
      [trialId]
    );
    if (trialResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trial invite not found' });
    }

    const trial = trialResult.rows[0];
    const payload = await buildTrialInviteEmailPayload({ trial, req });
    return res.json({
      success: true,
      to: trial.email,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      registerUrl: payload.registerUrl,
    });
  } catch (err) {
    console.error('[admin] trial preview-email error:', err);
    return res.status(500).json({ error: 'Failed to build trial email preview' });
  }
});

// POST /api/admin/trial-invites/:id/send-email
router.post('/trial-invites/:id/send-email', async (req, res) => {
  try {
    const trialId = parseInt(req.params.id, 10);
    if (!Number.isFinite(trialId) || trialId <= 0) {
      return res.status(400).json({ error: 'Invalid trial id' });
    }

    const rawTestEmail = typeof req.body?.testEmail === 'string' ? req.body.testEmail.trim() : '';
    const isTestSend = !!rawTestEmail;

    const trialResult = await pool.query(
      `SELECT id, email, first_name, last_name, company_name, trial_days, token, registered_at
       FROM trial_invites
       WHERE id = $1`,
      [trialId]
    );
    if (trialResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trial invite not found' });
    }

    const trial = trialResult.rows[0];
    if (trial.registered_at && !isTestSend) {
      return res.status(400).json({ error: 'User already registered from this trial invite' });
    }

    const { subject, text, html, attachments } = await buildTrialInviteEmailPayload({ trial, req });
    const targetEmail = isTestSend ? rawTestEmail : trial.email;

    if (isTestSend && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ error: 'Invalid test email address' });
    }

    await sendEmail({
      to: targetEmail,
      subject: isTestSend ? `[TEST] ${subject}` : subject,
      text,
      html,
      attachments,
    });

    if (!isTestSend) {
      await pool.query(
        `UPDATE trial_invites
         SET email_sent_count = COALESCE(email_sent_count, 0) + 1,
             last_email_sent_at = NOW()
         WHERE id = $1`,
        [trialId]
      );
    }

    return res.json({
      success: true,
      message: isTestSend ? `Test email sent to ${targetEmail}` : 'Trial email sent',
      isTestSend,
      sentTo: targetEmail,
    });
  } catch (err) {
    console.error('[admin] trial send-email error:', err);
    return res.status(500).json({ error: 'Failed to send trial email' });
  }
});

// DELETE /api/admin/trial-invites/:id
router.delete('/trial-invites/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM trial_invites WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] trial delete error:', err);
    res.status(500).json({ error: 'Failed to delete trial invite' });
  }
});

module.exports = router;
