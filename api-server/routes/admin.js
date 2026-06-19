const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../utils/database');
const { sendEmail } = require('../utils/email');
const {
  VIDEO_GUIDE_TOPICS,
  DEFAULT_VIDEO_GUIDE_TOPIC,
  normalizeVideoGuideTopic,
} = require('../utils/videoGuideTopics');
const { getStripeBillingSnapshot } = require('../utils/stripeBilling');
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
    await pool.query(`ALTER TABLE trial_invites ADD COLUMN IF NOT EXISTS email_sent_count INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE trial_invites ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP NULL`);
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

// ─── Activity (login sessions + daily active companies) ───────────────────────

// GET /api/admin/activity/logins — recent session starts (last login log)
router.get('/activity/logins', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10) || 200));

    const result = await pool.query(
      `SELECT
         e.id,
         e.created_at,
         e.ip,
         e.user_agent,
         u.id AS user_id,
         u.email AS user_email,
         u.first_name,
         u.last_name,
         c.id AS company_id,
         c.name AS company_name,
         c.slug AS company_slug
       FROM user_login_events e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.created_at >= NOW() - ($1::int * INTERVAL '1 day')
       ORDER BY e.created_at DESC
       LIMIT $2`,
      [days, limit]
    );

    res.json({
      logins: result.rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        ip: r.ip,
        userAgent: r.user_agent,
        user: r.user_id
          ? {
              id: r.user_id,
              email: r.user_email,
              firstName: r.first_name,
              lastName: r.last_name,
            }
          : null,
        company: r.company_id
          ? { id: r.company_id, name: r.company_name, slug: r.company_slug }
          : null,
      })),
    });
  } catch (error) {
    console.error('[admin/activity/logins]', error);
    res.status(500).json({ error: 'Failed to load login activity' });
  }
});

// GET /api/admin/activity/monthly-logins?year=2026&month=6
// Returns the 20 most-active users for a given month with their active day numbers.
router.get('/activity/monthly-logins', async (req, res) => {
  try {
    const now = new Date();
    const year  = Math.max(2020, Math.min(2030, parseInt(String(req.query.year  || now.getUTCFullYear()), 10) || now.getUTCFullYear()));
    const month = Math.max(1,    Math.min(12,   parseInt(String(req.query.month || now.getUTCMonth() + 1), 10) || now.getUTCMonth() + 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    // Check total rows in the table for the requested period (debug)
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM user_login_events
       WHERE EXTRACT(YEAR  FROM created_at AT TIME ZONE 'UTC') = $1
         AND EXTRACT(MONTH FROM created_at AT TIME ZONE 'UTC') = $2`,
      [year, month]
    );
    console.log(`[monthly-logins] ${year}-${month}: ${countRes.rows[0].count} total events in table`);

    const result = await pool.query(`
      WITH month_events AS (
        SELECT
          e.user_id,
          e.company_id,
          e.created_at,
          EXTRACT(DAY FROM e.created_at AT TIME ZONE 'UTC')::int AS day_num
        FROM user_login_events e
        WHERE EXTRACT(YEAR  FROM e.created_at AT TIME ZONE 'UTC') = $1
          AND EXTRACT(MONTH FROM e.created_at AT TIME ZONE 'UTC') = $2
      ),
      user_stats AS (
        SELECT
          user_id,
          ARRAY_AGG(DISTINCT day_num ORDER BY day_num) AS active_days,
          COUNT(DISTINCT day_num)::int AS active_day_count,
          MAX(created_at) AS last_seen,
          (ARRAY_AGG(company_id ORDER BY created_at DESC))[1] AS latest_company_id
        FROM month_events
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      )
      SELECT
        u.id        AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        us.active_days,
        us.active_day_count,
        us.last_seen,
        c.name      AS company_name,
        c.slug      AS company_slug,
        c.country_code
      FROM user_stats us
      JOIN users u ON u.id = us.user_id
      LEFT JOIN companies c ON c.id = us.latest_company_id
      ORDER BY us.active_day_count DESC, us.last_seen DESC
      LIMIT 20
    `, [year, month]);

    const totalEventsInPeriod = parseInt(countRes.rows[0].count, 10);
    res.json({
      year,
      month,
      daysInMonth,
      totalEventsInPeriod,
      rows: result.rows.map((r) => ({
        userId: r.user_id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || `User ${r.user_id}`,
        email: r.email,
        company: r.company_name || null,
        companySlug: r.company_slug || null,
        activeDays: Array.isArray(r.active_days) ? r.active_days.map(Number) : [],
        loginCount: r.active_day_count,
        lastSeen: r.last_seen,
      })),
    });
  } catch (error) {
    console.error('[admin/activity/monthly-logins]', error);
    res.status(500).json({ error: 'Failed to load monthly logins' });
  }
});

// GET /api/admin/activity/daily-companies — one company counts once per day
router.get('/activity/daily-companies', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, parseInt(String(req.query.days || '90'), 10) || 90));

    const result = await pool.query(
      `SELECT
         (created_at AT TIME ZONE 'UTC')::date AS day,
         COUNT(DISTINCT company_id)::int AS active_companies
       FROM user_login_events
       WHERE company_id IS NOT NULL
         AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC') - ($1::int - 1) * INTERVAL '1 day'
       GROUP BY 1
       ORDER BY 1`,
      [days]
    );

    // Fill missing days with zero so the chart is continuous
    const byDay = new Map(
      result.rows.map((r) => [String(r.day).slice(0, 10), r.active_companies])
    );
    const series = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      series.push({ day: key, activeCompanies: byDay.get(key) ?? 0 });
    }

    res.json({ days, series });
  } catch (error) {
    console.error('[admin/activity/daily-companies]', error);
    res.status(500).json({ error: 'Failed to load daily activity' });
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

    const startedRes = await pool.query(`
      SELECT
        r.email,
        MAX(r.created_at) AS started_at,
        MAX(r.expires_at) AS expires_at,
        BOOL_OR(r.verify_token_hash IS NOT NULL) AS code_verified
      FROM registration_verification_codes r
      LEFT JOIN users u ON LOWER(u.email) = LOWER(r.email)
      WHERE r.consumed_at IS NULL
        AND u.id IS NULL
      GROUP BY LOWER(r.email), r.email
      ORDER BY MAX(r.created_at) DESC
    `);

    const draftRes = await pool.query(`
      SELECT
        d.client_session_id,
        d.first_name,
        d.last_name,
        d.email,
        d.step,
        d.created_at,
        d.updated_at
      FROM signup_progress_drafts d
      LEFT JOIN users u ON d.email IS NOT NULL AND LOWER(TRIM(d.email)) = LOWER(u.email)
      WHERE u.id IS NULL
        AND (
          d.email IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM registration_verification_codes r
            WHERE LOWER(r.email) = LOWER(TRIM(d.email))
              AND r.consumed_at IS NULL
          )
        )
      ORDER BY d.updated_at DESC
    `);

    const verificationRows = startedRes.rows.map((s) => ({
      kind: 'verification',
      email: s.email,
      firstName: null,
      lastName: null,
      sessionId: null,
      step: s.code_verified ? 'code_verified' : 'code_sent',
      codeVerified: !!s.code_verified,
      startedAt: s.started_at,
      updatedAt: s.started_at,
      expiresAt: s.expires_at,
    }));

    const draftRows = draftRes.rows.map((d) => ({
      kind: 'draft',
      email: d.email,
      firstName: d.first_name,
      lastName: d.last_name,
      sessionId: d.client_session_id,
      step: d.step,
      codeVerified: false,
      startedAt: d.created_at,
      expiresAt: null,
      updatedAt: d.updated_at,
    }));

    const ownerWizardRes = await pool.query(`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        c.id AS company_id,
        c.name AS company_name,
        COALESCE(c.onboarding_step, 'company') AS onboarding_step,
        COALESCE(c.plan, 'standard') AS plan,
        c.updated_at
      FROM companies c
      INNER JOIN users u ON u.id = c.owner_id
      WHERE COALESCE(c.onboarding_completed, false) = false
      ORDER BY c.updated_at DESC
    `);

    const ownerWizardRows = ownerWizardRes.rows.map((r) => {
      let step = 'wizard_company';
      if (r.onboarding_step === 'services') step = 'wizard_services';
      else if (r.onboarding_step === 'clients') step = 'wizard_clients';
      else if (r.onboarding_step === 'plan') step = 'wizard_completed';
      return {
        kind: 'owner_wizard',
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        sessionId: null,
        step,
        codeVerified: true,
        startedAt: r.updated_at,
        updatedAt: r.updated_at,
        expiresAt: null,
        companyName: r.company_name,
        userId: r.user_id,
      };
    });

    const startedSignups = [...verificationRows, ...draftRows, ...ownerWizardRows].sort((a, b) => {
      const ta = new Date(b.updatedAt || b.startedAt).getTime();
      const tb = new Date(a.updatedAt || a.startedAt).getTime();
      return ta - tb;
    });

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
      startedSignups,
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/funnel — unified lead funnel for the admin Lead Funnel page
router.get('/funnel', requireAdmin, async (req, res) => {
  try {
    // 1. Pre-account drafts (no user account yet)
    const draftRes = await pool.query(`
      SELECT
        d.client_session_id,
        d.first_name,
        d.last_name,
        d.email,
        d.step,
        d.created_at,
        d.updated_at
      FROM signup_progress_drafts d
      LEFT JOIN users u ON d.email IS NOT NULL AND LOWER(TRIM(d.email)) = LOWER(u.email)
      WHERE u.id IS NULL
      ORDER BY d.updated_at DESC
      LIMIT 200
    `);

    // 2. Pending email verifications (no account yet)
    const verRes = await pool.query(`
      SELECT
        r.email,
        MAX(r.created_at) AS started_at,
        BOOL_OR(r.verify_token_hash IS NOT NULL) AS code_verified
      FROM registration_verification_codes r
      LEFT JOIN users u ON LOWER(u.email) = LOWER(r.email)
      WHERE r.consumed_at IS NULL AND u.id IS NULL
      GROUP BY LOWER(r.email), r.email
      ORDER BY MAX(r.created_at) DESC
      LIMIT 200
    `);

    // 3. Owners currently in wizard (incomplete onboarding)
    const wizardRes = await pool.query(`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        c.id AS company_id,
        c.name AS company_name,
        COALESCE(c.onboarding_step, 'clients') AS onboarding_step,
        false AS onboarding_completed,
        c.updated_at
      FROM companies c
      INNER JOIN users u ON u.id = c.owner_id
      WHERE COALESCE(c.onboarding_completed, false) = false
      ORDER BY c.updated_at DESC
      LIMIT 500
    `);

    // 4. Recently completed owners (last 60 days)
    const completedRes = await pool.query(`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        c.id AS company_id,
        c.name AS company_name,
        'done' AS onboarding_step,
        true AS onboarding_completed,
        c.updated_at
      FROM companies c
      INNER JOIN users u ON u.id = c.owner_id
      WHERE COALESCE(c.onboarding_completed, true) = true
        AND c.updated_at >= NOW() - INTERVAL '60 days'
      ORDER BY c.updated_at DESC
      LIMIT 200
    `);

    // Map each source to a unified shape
    // Step meanings (matches nudgeEmails.ts STEP_LABELS):
    //   1 = Enter Email (draft, only typed email — no name/password yet)
    //   2 = Create Account (submitted registration form, email verification pending)
    //   3 = Add Client (email verified, logged in, hasn't added a customer)
    //   4 = Add Job (has customer, no job yet)
    //   5 = Setup Business (added job, saw route, hasn't filled business name)
    //   6 = Complete
    const STEP_NAMES = {
      1: 'Enter Email',
      2: 'Create Account',
      3: 'Add Client',
      4: 'Add Job',
      5: 'Setup Business',
      6: 'Complete',
    };

    function calcStep(entry) {
      if (entry.onboarding_completed) return 6;
      if (entry.onboarding_step === 'business' || entry.onboarding_step === 'route') return 5;
      if (entry.onboarding_step === 'jobs') return 4;
      if (entry.onboarding_step === 'clients' || entry.onboarding_step === 'company' ||
          entry.onboarding_step === 'services' || entry.onboarding_step === 'plan') return 3;
      if (entry.draft_step === 'code_sent' || entry.kind === 'verification') return 2;
      return 1;
    }

    const leads = [];

    // Pre-account drafts
    for (const d of draftRes.rows) {
      const entry = { kind: 'draft', draft_step: d.step, onboarding_step: null, onboarding_completed: false };
      const step = calcStep(entry);
      leads.push({
        id: `draft-${d.client_session_id}`,
        kind: 'draft',
        firstName: d.first_name || null,
        lastName: d.last_name || null,
        email: d.email || null,
        companyName: null,
        userId: null,
        companyId: null,
        funnelStep: step,
        funnelStepName: STEP_NAMES[step],
        updatedAt: d.updated_at,
        createdAt: d.created_at,
      });
    }

    // Pending verifications
    for (const v of verRes.rows) {
      const entry = { kind: 'verification', draft_step: null, onboarding_step: null, onboarding_completed: false };
      const step = calcStep(entry);
      leads.push({
        id: `ver-${v.email}`,
        kind: 'verification',
        firstName: null,
        lastName: null,
        email: v.email,
        companyName: null,
        userId: null,
        companyId: null,
        funnelStep: step,
        funnelStepName: STEP_NAMES[step],
        updatedAt: v.started_at,
        createdAt: v.started_at,
      });
    }

    // Wizard + completed owners (deduplicate by user_id)
    const seenUserIds = new Set();
    for (const r of [...wizardRes.rows, ...completedRes.rows]) {
      if (seenUserIds.has(r.user_id)) continue;
      seenUserIds.add(r.user_id);
      const entry = {
        kind: 'owner',
        draft_step: null,
        onboarding_step: r.onboarding_step,
        onboarding_completed: r.onboarding_completed,
      };
      const step = calcStep(entry);
      leads.push({
        id: `owner-${r.user_id}`,
        kind: 'owner',
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        email: r.email,
        companyName: r.company_name || null,
        userId: r.user_id,
        companyId: r.company_id,
        funnelStep: step,
        funnelStepName: STEP_NAMES[step],
        updatedAt: r.updated_at,
        createdAt: r.updated_at,
      });
    }

    // Deduplicate by email: same email can appear in multiple sources (draft + verification).
    // Keep the entry with the highest funnelStep; on tie prefer owner > draft > verification.
    const kindOrder = { owner: 0, draft: 1, verification: 2 };
    const emailMap = new Map(); // normalised email → lead
    for (const lead of leads) {
      if (!lead.email) continue; // no email → always keep (can't dedup)
      const key = lead.email.toLowerCase().trim();
      const existing = emailMap.get(key);
      if (!existing) { emailMap.set(key, lead); continue; }
      const betterStep = lead.funnelStep > existing.funnelStep;
      const sameStep = lead.funnelStep === existing.funnelStep;
      const betterKind = (kindOrder[lead.kind] ?? 9) < (kindOrder[existing.kind] ?? 9);
      if (betterStep || (sameStep && betterKind)) emailMap.set(key, lead);
    }
    // Replace leads with deduped list, keeping no-email entries
    const noEmailLeads = leads.filter(l => !l.email);
    leads.length = 0;
    leads.push(...noEmailLeads, ...emailMap.values());

    // Sort: most recently updated first
    leads.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // Batch-fetch sent nudge IDs for all leads that have an email
    const emailsWithAddress = leads.filter(l => l.email).map(l => l.email.toLowerCase().trim());
    const sentNudgeMap = {}; // email → nudge_id[]
    if (emailsWithAddress.length > 0) {
      const sentRes = await pool.query(
        `SELECT LOWER(TRIM(email)) AS email, nudge_id
         FROM funnel_nudge_sends
         WHERE LOWER(TRIM(email)) = ANY($1::text[])`,
        [emailsWithAddress]
      );
      for (const row of sentRes.rows) {
        if (!sentNudgeMap[row.email]) sentNudgeMap[row.email] = [];
        sentNudgeMap[row.email].push(row.nudge_id);
      }
    }

    // Attach sentNudgeIds to each lead
    for (const lead of leads) {
      const key = lead.email ? lead.email.toLowerCase().trim() : null;
      lead.sentNudgeIds = key ? (sentNudgeMap[key] || []) : [];
    }

    res.json({ leads, stepNames: STEP_NAMES });
  } catch (error) {
    console.error('Error loading funnel:', error);
    res.status(500).json({ error: 'Failed to load funnel' });
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

// DELETE /api/admin/pending-signups — drop test/noise rows from incomplete signup lists
router.delete('/pending-signups', async (req, res) => {
  try {
    const { kind, email, sessionId } = req.body || {};

    if (kind === 'verification') {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !normalized.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      const del = await pool.query(
        `DELETE FROM registration_verification_codes
         WHERE LOWER(TRIM(email)) = $1 AND consumed_at IS NULL
         RETURNING id`,
        [normalized]
      );
      return res.json({
        deleted: del.rowCount,
        message: del.rowCount > 0 ? 'Removed pending verification row(s)' : 'Nothing matched to delete',
      });
    }

    if (kind === 'draft') {
      const sid = String(sessionId || '').trim();
      if (!sid || sid.length > 128) {
        return res.status(400).json({ error: 'Valid sessionId is required' });
      }
      const del = await pool.query(
        `DELETE FROM signup_progress_drafts WHERE client_session_id = $1 RETURNING id`,
        [sid]
      );
      return res.json({
        deleted: del.rowCount,
        message: del.rowCount > 0 ? 'Removed signup draft' : 'Nothing matched to delete',
      });
    }

    return res.status(400).json({ error: 'kind must be "verification" or "draft"' });
  } catch (error) {
    console.error('Error deleting pending signup:', error);
    res.status(500).json({ error: 'Failed to delete pending signup' });
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

// PATCH /api/admin/companies/:companyId/expiry — set or clear the access expiry date
router.patch('/companies/:companyId/expiry', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { expiresAt } = req.body; // ISO date string or null/empty to clear
    const expiresValue = expiresAt == null || expiresAt === '' ? null : expiresAt;

    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Company not found' });

    // When trial/access is extended to the future (or cleared), clear auto-expiry suspension.
    // When set to a past time, ensure suspended_at reflects expired access.
    const result = await pool.query(
      `UPDATE companies SET
         expires_at = $2::timestamptz,
         suspended_at = CASE
           WHEN $2::timestamptz IS NULL THEN NULL
           WHEN $2::timestamptz > NOW() THEN NULL
           ELSE COALESCE(suspended_at, NOW())
         END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, expires_at, suspended_at`,
      [companyId, expiresValue]
    );

    const company = result.rows[0];
    res.json({
      message: expiresValue
        ? 'Expiry date updated (suspension cleared if access is now valid)'
        : 'Expiry date cleared (access is now permanent; suspension cleared)',
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

// POST /api/admin/funnel-nudges/:nudgeId/send
// Force-sends this nudge immediately to all eligible leads (ignores afterHours delay).
// Returns { sent, skipped, errors }
router.post('/funnel-nudges/:nudgeId/send', async (req, res) => {
  const { nudgeId } = req.params;
  const { ensureFunnelNudgeSchema, sendNudgeNow } = require('../utils/funnelNudges');
  try {
    await ensureFunnelNudgeSchema();
    const result = await sendNudgeNow(nudgeId);
    res.json(result);
  } catch (err) {
    console.error('[admin] funnel-nudge send error:', err);
    res.status(500).json({ error: err.message || 'Send failed' });
  }
});

// POST /api/admin/funnel-nudges/:nudgeId/send-one
// Force-sends this nudge to one specific email address immediately.
// Allows re-sending. Body: { email: string }
router.post('/funnel-nudges/:nudgeId/send-one', async (req, res) => {
  const { nudgeId } = req.params;
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }
  const { ensureFunnelNudgeSchema, sendNudgeToEmail } = require('../utils/funnelNudges');
  try {
    await ensureFunnelNudgeSchema();
    const result = await sendNudgeToEmail(nudgeId, email.trim());
    res.json(result);
  } catch (err) {
    const msg = err?.message || String(err) || 'Send failed';
    console.error(`[admin] funnel-nudge send-one error (${nudgeId} → ${email}):`, msg, err?.stack || '');
    res.status(500).json({ error: msg });
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
