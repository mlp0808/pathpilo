const express = require('express');
const { pool } = require('../utils/database');
const {
  VIDEO_GUIDE_TOPICS,
  DEFAULT_VIDEO_GUIDE_TOPIC,
  normalizeVideoGuideTopic,
} = require('../utils/videoGuideTopics');
const { getStripeBillingSnapshot } = require('../utils/stripeBilling');
const { ensureCompanyOnboardingSchema } = require('../utils/companyOnboardingSchema');
const {
  initSmsSchema,
  setSmsPlan,
  recordSmsUsage,
  getSmsBillingSnapshot,
} = require('../utils/smsBilling');
const { SMS_PLAN_TIERS } = require('../config/smsPlans');
const {
  listPromotionCodes,
  createPromotionCode,
  deactivatePromotionCode,
} = require('../utils/stripeCoupons');
const { initActivitySchema } = require('../utils/activityLog');

const TRIAL_DAYS = 14;

/** Days from now → ISO timestamp (used for trial / comped access). */
function daysFromNowIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

/** Classify how a company currently gets access, for the admin UI. */
function deriveBillingSource(company, stripe) {
  if (stripe?.subscription && ['active', 'past_due'].includes(stripe.subscription.status)) {
    return 'paid';
  }
  if (stripe?.subscription && stripe.subscription.status === 'trialing') {
    return 'stripe-trial';
  }
  if ((company.plan || 'standard') === 'pro' && company.expires_at) {
    return 'trial';
  }
  if ((company.plan || 'standard') === 'pro') {
    return 'comp';
  }
  return 'free';
}

const router = express.Router();
const SUPPORTED_VIDEO_LANGUAGES = new Set(['en', 'da', 'de', 'sv', 'no']);

function normalizeVideoLanguageCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('da')) return 'da';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('sv')) return 'sv';
  if (raw.startsWith('no') || raw.startsWith('nb') || raw.startsWith('nn')) return 'no';
  return 'en';
}

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
    // Plan column — 'standard' (Solo, free) or 'pro' (Company, paid)
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'standard'`);
    await pool.query(`UPDATE companies SET plan = 'standard' WHERE plan IS NULL OR plan = ''`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_guides (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration VARCHAR(20) NOT NULL DEFAULT '0:00',
        video_id VARCHAR(100) NOT NULL,
        language_code VARCHAR(10) NOT NULL DEFAULT 'en',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE video_guides ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) NOT NULL DEFAULT 'en'`);
    await pool.query(`ALTER TABLE video_guides ADD COLUMN IF NOT EXISTS guide_link TEXT`);
    await pool.query(
      `ALTER TABLE video_guides ADD COLUMN IF NOT EXISTS topic VARCHAR(50) NOT NULL DEFAULT '${DEFAULT_VIDEO_GUIDE_TOPIC}'`
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registration_verification_codes (
        id SERIAL PRIMARY KEY,
        email VARCHAR(320) NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        verify_token_hash VARCHAR(255),
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup_progress_drafts (
        id SERIAL PRIMARY KEY,
        client_session_id VARCHAR(128) NOT NULL UNIQUE,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(320),
        step VARCHAR(32) NOT NULL DEFAULT 'name_entered',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // SMS add-on billing tables (plan + usage metering)
    await initSmsSchema(pool).catch((e) =>
      console.warn('[admin] SMS schema init failed:', e.message)
    );
    await initActivitySchema(pool).catch((e) =>
      console.warn('[admin] activity schema init failed:', e.message)
    );
    // Run expiry handler immediately after schema is ready, then every hour
    autoHandleExpiry();
    setInterval(autoHandleExpiry, 60 * 60 * 1000);
  } catch (err) {
    console.error('[admin] Schema init failed:', err.message);
  }
}

// Handle expired companies. Trials/expiry are a PRO-only concept now:
//   - Pro plan trial expired → demote to standard (free, not suspended)
//   - Standard plan is free forever → it never expires; clear any stale expiry
//     left over from the old "trial on a free plan" behaviour.
async function autoHandleExpiry() {
  try {
    // 1. Pro trial expired: demote to standard, clear expiry
    const demoted = await pool.query(`
      UPDATE companies
      SET plan = 'standard', expires_at = NULL, billing_interval = NULL, updated_at = NOW()
      WHERE COALESCE(plan, 'standard') = 'pro'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
        AND suspended_at IS NULL
        AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '')
      RETURNING id, name
    `);
    if (demoted.rows.length > 0) {
      console.log(`[admin] Demoted ${demoted.rows.length} expired pro trial(s) to standard:`, demoted.rows.map(r => r.name).join(', '));
    }

    // 2. Standard plan is free forever — drop any leftover trial/expiry date so
    //    it is never auto-suspended. (Previously standard companies with an
    //    admin-set expiry were suspended; that behaviour is intentionally gone.)
    const cleared = await pool.query(`
      UPDATE companies
      SET expires_at = NULL, updated_at = NOW()
      WHERE COALESCE(plan, 'standard') = 'standard'
        AND expires_at IS NOT NULL
      RETURNING id, name
    `);
    if (cleared.rows.length > 0) {
      console.log(`[admin] Cleared stale expiry on ${cleared.rows.length} standard company/companies (standard is free forever).`);
    }
  } catch (err) {
    console.error('[admin] autoHandleExpiry failed:', err.message);
  }
}

initAdminSchema();

// GET /api/admin/companies - List all companies
router.get('/companies', async (req, res) => {
  try {
    await ensureCompanyOnboardingSchema(pool);
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
        c.industry,
        c.website,
        COALESCE(c.usage_goals, '[]'::jsonb) AS usage_goals,
        c.created_at,
        c.suspended_at,
        c.expires_at,
        COALESCE(c.plan, 'standard') AS plan,
        c.billing_interval,
        c.stripe_subscription_id,
        sp.tier_key      AS sms_tier_key,
        sp.status        AS sms_status,
        u.first_name as owner_first_name,
        u.last_name  as owner_last_name,
        u.email      as owner_email,
        COUNT(uc.user_id)::int as user_count
      FROM companies c
      LEFT JOIN users u  ON c.owner_id  = u.id
      LEFT JOIN user_companies uc ON uc.company_id = c.id
      LEFT JOIN company_sms_plans sp ON sp.company_id = c.id
      GROUP BY c.id, u.id, sp.tier_key, sp.status
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
        industry:    c.industry || null,
        website:     c.website || null,
        usageGoals:  Array.isArray(c.usage_goals) ? c.usage_goals : [],
        createdAt:   c.created_at,
        suspendedAt: c.suspended_at || null,
        expiresAt:   c.expires_at || null,
        plan:        c.plan || 'standard',
        billingInterval: c.billing_interval || null,
        hasStripeSubscription: !!c.stripe_subscription_id,
        smsTierKey:  c.sms_status === 'active' ? c.sms_tier_key : null,
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

// POST /api/admin/companies/:companyId/overwatch/start
// Creates a temporary owner-level token for support access without creating membership.
router.post('/companies/:companyId/overwatch/start', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { superPassword } = req.body || {};
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const configuredSuperPassword =
      process.env.ADMIN_PASSWORD !== undefined && process.env.ADMIN_PASSWORD !== null
        ? String(process.env.ADMIN_PASSWORD).trim()
        : '';

    if (!configuredSuperPassword) {
      return res.status(500).json({ error: 'Super password is not configured on the server' });
    }

    if (String(superPassword || '').trim() !== configuredSuperPassword) {
      return res.status(401).json({ error: 'Invalid super password' });
    }

    const companyResult = await pool.query(
      `
      SELECT c.id, c.name, c.slug, c.owner_id, c.country_code
      FROM companies c
      WHERE c.id = $1
      `,
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
    if (!company.owner_id) {
      return res.status(400).json({ error: 'Company has no owner account to impersonate' });
    }

    const ownerResult = await pool.query(
      `
      SELECT id, first_name, last_name, email, language_code
      FROM users
      WHERE id = $1
      `,
      [company.owner_id]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company owner account not found' });
    }

    const owner = ownerResult.rows[0];
    const adminEmail = String(req.user?.email || '').trim();
    const adminUserId = Number(req.user?.userId || 0);

    const token = jwt.sign(
      {
        userId: owner.id,
        email: owner.email,
        firstName: owner.first_name,
        lastName: owner.last_name,
        activeCompanyId: company.id,
        role: 'owner',
        overwatch: true,
        overwatchAdminEmail: adminEmail || null,
        overwatchAdminUserId: Number.isFinite(adminUserId) ? adminUserId : 0,
        overwatchCompanyId: company.id,
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    res.json({
      message: 'Overwatch session started',
      token,
      user: {
        id: owner.id,
        firstName: owner.first_name,
        lastName: owner.last_name,
        email: owner.email,
        languageCode: owner.language_code || 'en',
        role: 'owner',
        companyId: company.id,
        companyName: company.name,
        companies: [
          {
            id: company.id,
            name: company.name,
            slug: company.slug,
            countryCode: company.country_code || 'DK',
            role: 'owner',
            isOwner: true,
          },
        ],
        activeCompany: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          countryCode: company.country_code || 'DK',
          role: 'owner',
          isOwner: true,
        },
        overwatch: {
          active: true,
          adminEmail: adminEmail || null,
          companyId: company.id,
          companyName: company.name,
        },
      },
    });
  } catch (error) {
    console.error('Error starting overwatch session:', error);
    res.status(500).json({ error: 'Failed to start overwatch session' });
  }
});

/** Remove a user and owned companies so they can sign up again with the same email. */
async function purgeUserCompletely(client, user) {
  const userId = user.id;
  const normalizedEmail = String(user.email || '').trim().toLowerCase();

  await client.query(`UPDATE invoices SET created_by = NULL WHERE created_by = $1`, [userId]);
  await client.query(`UPDATE secure_notes SET updated_by = NULL WHERE updated_by = $1`, [userId]);
  await client.query(`UPDATE secure_notes_audit SET user_id = NULL WHERE user_id = $1`, [userId]);
  await client.query(`UPDATE employee_appointments SET declined_by = NULL WHERE declined_by = $1`, [userId]);
  await client.query(`UPDATE employee_appointments SET requested_by = NULL WHERE requested_by = $1`, [userId]);
  await client.query(`UPDATE employee_appointments SET approved_by = NULL WHERE approved_by = $1`, [userId]);

  const owned = await client.query(`SELECT id FROM companies WHERE owner_id = $1`, [userId]);
  for (const row of owned.rows) {
    await client.query(`UPDATE companies SET owner_id = NULL WHERE id = $1`, [row.id]);
    await client.query(`DELETE FROM companies WHERE id = $1`, [row.id]);
  }

  if (normalizedEmail) {
    await client.query(
      `DELETE FROM registration_verification_codes WHERE LOWER(TRIM(email)) = $1`,
      [normalizedEmail],
    );
    await client.query(
      `DELETE FROM signup_progress_drafts
       WHERE email IS NOT NULL AND LOWER(TRIM(email)) = $1`,
      [normalizedEmail],
    );
  }

  const del = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
  return del.rowCount > 0;
}

// DELETE /api/admin/users/:userId — permanently delete user (and companies they own)
router.delete('/users/:userId', async (req, res) => {
  const userId = parseInt(String(req.params.userId), 10);
  if (!Number.isFinite(userId) || userId < 1) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { confirmEmail } = req.body || {};
  const client = await pool.connect();

  try {
    const userRes = await client.query(
      `SELECT id, email, first_name, last_name, role FROM users WHERE id = $1`,
      [userId],
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot be deleted from this panel' });
    }

    const adminUserId = Number(req.user?.userId || 0);
    if (adminUserId > 0 && adminUserId === userId) {
      return res.status(400).json({ error: 'You cannot delete your own account while logged in' });
    }

    const expectedEmail = String(user.email || '').trim().toLowerCase();
    const typedEmail = String(confirmEmail || '').trim().toLowerCase();
    if (!typedEmail || typedEmail !== expectedEmail) {
      return res.status(400).json({
        error: 'Confirmation email does not match',
        expected: user.email,
      });
    }

    const ownedCount = (
      await client.query(`SELECT COUNT(*)::int AS n FROM companies WHERE owner_id = $1`, [userId])
    ).rows[0].n;

    await client.query('BEGIN');
    const deleted = await purgeUserCompletely(client, user);
    if (!deleted) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    await client.query('COMMIT');

    res.json({
      message: `User "${user.email}" has been permanently deleted.`,
      deletedCompanies: ownedCount,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  } finally {
    client.release();
  }
});

// GET /api/admin/companies/:companyId - Get single company details
router.get('/companies/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    await ensureCompanyOnboardingSchema(pool);

    const result = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.country,
        c.cvr_number,
        c.address,
        c.zip_code,
        c.city,
        c.industry,
        c.website,
        COALESCE(c.usage_goals, '[]'::jsonb) AS usage_goals,
        c.created_at,
        c.updated_at,
        c.suspended_at,
        c.expires_at,
        COALESCE(c.plan, 'standard') AS plan,
        c.billing_interval,
        c.stripe_customer_id,
        c.stripe_subscription_id,
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
        industry: company.industry || null,
        website: company.website || null,
        usageGoals: Array.isArray(company.usage_goals) ? company.usage_goals : [],
        createdAt: company.created_at,
        updatedAt: company.updated_at,
        suspendedAt: company.suspended_at || null,
        expiresAt: company.expires_at || null,
        plan: company.plan || 'standard',
        billingInterval: company.billing_interval || null,
        hasStripeCustomer: !!company.stripe_customer_id,
        hasStripeSubscription: !!company.stripe_subscription_id,
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

// ============================================
// Video Guides (admin CRUD)
// ============================================

// GET /api/admin/video-guides - List all (admin)
router.get('/video-guides', async (req, res) => {
  try {
    const languageCode = normalizeVideoLanguageCode(req.query.languageCode || req.query.language_code || 'en');
    const result = await pool.query(`
      SELECT id, title, description, duration, video_id, sort_order, created_at, language_code, guide_link, topic
      FROM video_guides
      WHERE language_code = $1
      ORDER BY sort_order ASC, created_at ASC
    `, [languageCode]);

    const videos = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      duration: row.duration || '0:00',
      videoId: row.video_id,
      languageCode: row.language_code || 'en',
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      guideLink: row.guide_link || '',
      topic: normalizeVideoGuideTopic(row.topic),
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
    const { title, description, duration, videoId, guideLink, topic, languageCode: rawLanguageCode, language_code: rawLanguageCodeSnake } = req.body;
    const languageCode = normalizeVideoLanguageCode(rawLanguageCode || rawLanguageCodeSnake);
    const topicValue = normalizeVideoGuideTopic(topic);

    if (!title || !videoId) {
      return res.status(400).json({ error: 'Title and video ID are required' });
    }
    if (!SUPPORTED_VIDEO_LANGUAGES.has(languageCode)) {
      return res.status(400).json({ error: 'Unsupported language code' });
    }
    if (!VIDEO_GUIDE_TOPICS.includes(topicValue)) {
      return res.status(400).json({ error: 'Unsupported topic' });
    }

    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM video_guides WHERE language_code = $1',
      [languageCode]
    );
    const nextOrder = maxResult.rows[0]?.next_order || 1;

    const result = await pool.query(
      `INSERT INTO video_guides (title, description, duration, video_id, sort_order, language_code, guide_link, topic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, description, duration, video_id, sort_order, created_at, language_code, guide_link, topic`,
      [title, description || '', duration || '0:00', videoId, nextOrder, languageCode, guideLink || null, topicValue]
    );

    const row = result.rows[0];
    res.status(201).json({
      video: {
        id: row.id,
        title: row.title,
        description: row.description || '',
        duration: row.duration || '0:00',
        videoId: row.video_id,
        languageCode: row.language_code || 'en',
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        guideLink: row.guide_link || '',
        topic: normalizeVideoGuideTopic(row.topic),
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
    const {
      title,
      description,
      duration,
      videoId,
      guideLink,
      sortOrder,
      topic,
      languageCode: rawLanguageCode,
      language_code: rawLanguageCodeSnake,
    } = req.body;
    const rawLang = rawLanguageCode != null ? rawLanguageCode : rawLanguageCodeSnake;
    const languageCode = rawLang != null ? normalizeVideoLanguageCode(rawLang) : null;
    const topicValue = topic != null ? normalizeVideoGuideTopic(topic) : null;
    if (languageCode && !SUPPORTED_VIDEO_LANGUAGES.has(languageCode)) {
      return res.status(400).json({ error: 'Unsupported language code' });
    }
    if (topicValue && !VIDEO_GUIDE_TOPICS.includes(topicValue)) {
      return res.status(400).json({ error: 'Unsupported topic' });
    }

    const result = await pool.query(
      `UPDATE video_guides
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           duration = COALESCE($4, duration),
           video_id = COALESCE($5, video_id),
           sort_order = COALESCE($6, sort_order),
           language_code = COALESCE($7, language_code),
           guide_link = $8,
           topic = COALESCE($9, topic),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, title, description, duration, video_id, sort_order, created_at, language_code, guide_link, topic`,
      [id, title, description, duration, videoId, sortOrder, languageCode, guideLink || null, topicValue]
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
        languageCode: row.language_code || 'en',
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        guideLink: row.guide_link || '',
        topic: normalizeVideoGuideTopic(row.topic),
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

// PATCH /api/admin/companies/:companyId/plan — set the company plan.
// Body: { plan: 'standard' | 'pro', accessMode?, trialDays?, expiresAt?, billingInterval? }
//   - standard: free forever; clears any expiry/trial and billing interval.
//   - pro + accessMode 'trial': sets expires_at = now + trialDays (default 14).
//   - pro + accessMode 'permanent' (comp): pro with no expiry.
//   - pro + explicit expiresAt: sets that date.
// This is a MANUAL grant — it never touches Stripe. Real paying customers are
// governed by their Stripe subscription + webhooks.
router.patch('/companies/:companyId/plan', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { plan, accessMode, trialDays, expiresAt, billingInterval } = req.body;
    const VALID_PLANS = ['standard', 'pro'];
    if (!plan || !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
    }

    const exists = await pool.query('SELECT stripe_subscription_id FROM companies WHERE id = $1', [companyId]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    let nextExpiry = null; // null => permanent / cleared
    let nextInterval = null;
    let summary;

    if (plan === 'standard') {
      // Standard is free forever — no trial/expiry, no billing interval.
      nextExpiry = null;
      nextInterval = null;
      summary = 'Downgraded to Standard (free, no expiry)';
    } else {
      // pro
      const mode = accessMode || (expiresAt ? 'date' : (trialDays != null ? 'trial' : 'permanent'));
      if (mode === 'permanent') {
        nextExpiry = null;
        summary = 'Set to Pro (comped — permanent, no expiry)';
      } else if (mode === 'date') {
        nextExpiry = expiresAt ? new Date(expiresAt).toISOString() : null;
        summary = nextExpiry ? `Set to Pro until ${nextExpiry.split('T')[0]}` : 'Set to Pro (permanent)';
      } else {
        const days = Number.isFinite(Number(trialDays)) && Number(trialDays) > 0 ? Number(trialDays) : TRIAL_DAYS;
        nextExpiry = daysFromNowIso(days);
        summary = `Set to Pro trial (${days} days)`;
      }
      nextInterval = billingInterval === 'year' ? 'year' : billingInterval === 'month' ? 'month' : null;
    }

    const result = await pool.query(
      `UPDATE companies SET
         plan = $2,
         expires_at = $3::timestamptz,
         billing_interval = $4,
         suspended_at = CASE
           WHEN $3::timestamptz IS NULL THEN NULL
           WHEN $3::timestamptz > NOW() THEN NULL
           ELSE COALESCE(suspended_at, NOW())
         END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, plan, expires_at, billing_interval, suspended_at`,
      [companyId, plan, nextExpiry, nextInterval]
    );

    const company = result.rows[0];
    res.json({
      message: summary,
      company: {
        id: company.id,
        name: company.name,
        plan: company.plan,
        expiresAt: company.expires_at || null,
        billingInterval: company.billing_interval || null,
        suspendedAt: company.suspended_at || null,
      },
    });
  } catch (error) {
    console.error('Error updating company plan:', error);
    res.status(500).json({ error: 'Failed to update company plan' });
  }
});

// GET /api/admin/billing/config — plan + SMS tier reference for the UI
router.get('/billing/config', async (req, res) => {
  res.json({
    smsTiers: SMS_PLAN_TIERS,
    trialDaysDefault: TRIAL_DAYS,
  });
});

// GET /api/admin/companies/:companyId/billing — full billing snapshot
// (plan, trial, live Stripe subscription/invoices, and SMS add-on).
router.get('/companies/:companyId/billing', async (req, res) => {
  try {
    const { companyId } = req.params;
    const result = await pool.query(
      `SELECT id, name, COALESCE(plan, 'standard') AS plan, expires_at, suspended_at,
              created_at, billing_interval, stripe_customer_id, stripe_subscription_id
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Company not found' });
    const company = result.rows[0];

    const stripe = await getStripeBillingSnapshot(company);

    // Trial / access info (pro-only concept now)
    let trial = null;
    if (company.plan === 'pro' && company.expires_at) {
      const msLeft = new Date(company.expires_at).getTime() - Date.now();
      trial = {
        expiresAt: company.expires_at,
        daysLeft: Math.max(0, Math.ceil(msLeft / 86400000)),
        expired: msLeft <= 0,
      };
    }

    const sms = await getSmsBillingSnapshot(pool, companyId);

    res.json({
      companyId: company.id,
      plan: company.plan,
      billingInterval: company.billing_interval || null,
      expiresAt: company.expires_at || null,
      suspendedAt: company.suspended_at || null,
      createdAt: company.created_at,
      billingSource: deriveBillingSource(company, stripe),
      trial,
      stripe,
      sms,
    });
  } catch (error) {
    console.error('Error building billing snapshot:', error);
    res.status(500).json({ error: 'Failed to load billing details' });
  }
});

// PUT /api/admin/companies/:companyId/sms-plan — assign / change / cancel SMS add-on.
// Body: { tierKey: string | null, resetPeriod?: boolean }
router.put('/companies/:companyId/sms-plan', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { tierKey, resetPeriod } = req.body || {};

    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    await setSmsPlan(pool, companyId, tierKey || null, { resetPeriod: !!resetPeriod });
    const sms = await getSmsBillingSnapshot(pool, companyId);
    res.json({
      message: tierKey ? 'SMS plan updated' : 'SMS plan cancelled',
      sms,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Error updating SMS plan:', error);
    res.status(status).json({ error: error.message || 'Failed to update SMS plan' });
  }
});

// POST /api/admin/companies/:companyId/sms-usage/adjust — manual usage correction.
// Body: { segments: number (may be negative), note?: string }
router.post('/companies/:companyId/sms-usage/adjust', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { segments, note } = req.body || {};
    const seg = Math.trunc(Number(segments));
    if (!Number.isFinite(seg) || seg === 0) {
      return res.status(400).json({ error: 'segments must be a non-zero integer' });
    }

    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    await recordSmsUsage(pool, companyId, seg, {
      source: 'manual-adjust',
      note: note ? String(note).slice(0, 500) : `Manual adjustment by admin (${req.user?.email || 'admin'})`,
    });
    const sms = await getSmsBillingSnapshot(pool, companyId);
    res.json({ message: 'Usage adjusted', sms });
  } catch (error) {
    console.error('Error adjusting SMS usage:', error);
    res.status(500).json({ error: 'Failed to adjust SMS usage' });
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

// ─── Discount coupons (Stripe Promotion Codes) ───────────────────────────────

// GET /api/admin/coupons
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await listPromotionCodes();
    res.json({ coupons });
  } catch (err) {
    console.error('[admin] list coupons error:', err);
    const status = err.message?.includes('STRIPE_SECRET_KEY') ? 503 : 500;
    res.status(status).json({ error: err.message || 'Failed to list coupons' });
  }
});

// POST /api/admin/coupons
// Body: { code, percentOff?, amountOff?, durationMonths, appliesTo, maxRedemptions?, name? }
router.post('/coupons', async (req, res) => {
  try {
    const {
      code,
      percentOff,
      amountOff,
      durationMonths,
      appliesTo = 'month',
      maxRedemptions,
      name,
    } = req.body || {};

    const coupon = await createPromotionCode({
      code,
      percentOff,
      amountOff,
      durationMonths,
      appliesTo,
      maxRedemptions,
      name,
    });
    res.status(201).json({ coupon });
  } catch (err) {
    console.error('[admin] create coupon error:', err);
    const status = err.status || (err.message?.includes('STRIPE') ? 502 : 500);
    res.status(status).json({ error: err.message || 'Failed to create coupon' });
  }
});

// POST /api/admin/coupons/:promotionCodeId/deactivate
router.post('/coupons/:promotionCodeId/deactivate', async (req, res) => {
  try {
    const coupon = await deactivatePromotionCode(req.params.promotionCodeId);
    res.json({ coupon });
  } catch (err) {
    console.error('[admin] deactivate coupon error:', err);
    res.status(500).json({ error: err.message || 'Failed to deactivate coupon' });
  }
});

module.exports = router;
