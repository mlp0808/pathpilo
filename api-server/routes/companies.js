const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('../utils/email');

const router = express.Router();
const DEFAULT_COUNTRY_CODE = 'DK';
const DEFAULT_LANGUAGE_CODE = 'en';

function normalizeCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized.length === 2 ? normalized : DEFAULT_COUNTRY_CODE;
}

function buildInvitationEmail({ email, companyName, inviterName, role, inviteLink, expiresAt }) {
  const rolePretty = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Employee';
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fromName = process.env.FROM_NAME || 'Vevago';

  // Brand colours
  const dark    = '#193434';  // sidebar / primary
  const green   = '#3DD57A';  // accent
  const offWhite = '#F6F9F7'; // page background

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to join ${companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:${offWhite};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${offWhite};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- Logo / Brand header -->
          <tr>
            <td style="background:${dark};border-radius:16px 16px 0 0;padding:24px 36px;text-align:left;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${fromName}</span>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background:#ffffff;padding:40px 36px 36px;border-left:1px solid #e8ede8;border-right:1px solid #e8ede8;border-bottom:1px solid #e8ede8;border-radius:0 0 16px 16px;">

              <!-- Green accent line -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="height:3px;width:48px;background:${green};border-radius:2px;"></td>
                </tr>
              </table>

              <!-- Headline -->
              <p style="margin:0 0 6px;font-size:24px;font-weight:700;color:${dark};line-height:1.2;">
                You've been invited
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#5a7272;line-height:1.65;">
                <strong style="color:${dark};">${inviterName}</strong> has added you to
                <strong style="color:${dark};">${companyName}</strong> on ${fromName}.
                Your role will be <strong style="color:${dark};">${rolePretty}</strong>.
              </p>

              <!-- Info cards row -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td width="48%" style="background:${offWhite};border-radius:10px;padding:14px 16px;border:1px solid #e2eae2;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#7a9a9a;text-transform:uppercase;letter-spacing:0.8px;">Company</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:${dark};">${companyName}</p>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:${offWhite};border-radius:10px;padding:14px 16px;border:1px solid #e2eae2;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#7a9a9a;text-transform:uppercase;letter-spacing:0.8px;">Your role</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:${dark};">${rolePretty}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:${green};border-radius:10px;box-shadow:0 4px 12px rgba(61,213,122,0.3);">
                    <a href="${inviteLink}" target="_blank"
                       style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:${dark};text-decoration:none;letter-spacing:0.1px;">
                      Accept invitation &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry -->
              <p style="margin:0 0 28px;font-size:13px;color:#8aaaaa;line-height:1.5;">
                This invitation expires on <strong style="color:#5a7272;">${expiryDate}</strong>.
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr><td style="height:1px;background:#eaf0ea;"></td></tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0;font-size:12px;color:#aabcbc;line-height:1.7;">
                Button not working? Copy and paste this into your browser:<br/>
                <a href="${inviteLink}" style="color:${dark};word-break:break-all;">${inviteLink}</a>
              </p>
              ${STANDARD_FOOTER_PLACEHOLDER}

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `You've been invited to join ${companyName} on ${fromName}\n\n${inviterName} has added you to ${companyName} as a ${rolePretty}.\n\nAccept your invitation here:\n${inviteLink}\n\nThis invitation expires on ${expiryDate}.\n\nIf you weren't expecting this, you can safely ignore this email.`;

  return { html, text, subject: `You've been invited to join ${companyName}` };
}

// JWT Secret - should match auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authentication middleware
function authenticateToken(req, res, next) {
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

// Helper function to get active company ID
const getActiveCompanyId = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT uc.company_id, c.name as company_name, c.slug
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return { error: 'No active company found', status: 400 };
    }

    return { companyId: result.rows[0].company_id, company: result.rows[0] };
  } catch (error) {
    console.error('Error getting active company:', error);
    return { error: 'Failed to get company access', status: 500 };
  }
};

// GET /api/companies - Get user's companies
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        COALESCE(c.slug, LOWER(REGEXP_REPLACE(c.name, '[^a-z0-9]+', '-', 'g'))) as slug,
        c.country_code,
        uc.role as user_role,
        c.owner_id,
        CASE WHEN c.owner_id = $1 THEN true ELSE false END as is_owner,
        c.created_at
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = $1
      ORDER BY is_owner DESC, c.created_at ASC
    `, [userId]);

    res.json({
      companies: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        countryCode: c.country_code || DEFAULT_COUNTRY_CODE,
        role: c.user_role,
        isOwner: c.is_owner
      })),
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies: ' + error.message });
  }
});

// GET /api/companies/slug/:slug - Resolve company by slug
router.get('/slug/:slug', authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT c.id, c.name, c.slug, c.suspended_at, c.country_code
      FROM companies c
      JOIN user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND c.slug = $2
    `, [userId, slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const company = result.rows[0];
    res.json({
      company: {
        id:          company.id,
        name:        company.name,
        slug:        company.slug,
        countryCode: company.country_code || DEFAULT_COUNTRY_CODE,
        suspendedAt: company.suspended_at || null,
      }
    });
  } catch (error) {
    console.error('Error resolving company by slug:', error);
    res.status(500).json({ error: 'Failed to resolve company' });
  }
});

// GET /api/companies/check-slug?slug=xxx&excludeId=123
// Returns { available: true/false }
router.get('/check-slug', authenticateToken, async (req, res) => {
  try {
    const { slug, excludeId } = req.query;
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const normalized = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    if (!normalized) return res.json({ available: false, error: 'Invalid slug' });

    const query = excludeId
      ? 'SELECT id FROM companies WHERE slug = $1 AND id != $2'
      : 'SELECT id FROM companies WHERE slug = $1';
    const params = excludeId ? [normalized, excludeId] : [normalized];
    const result = await pool.query(query, params);
    res.json({ available: result.rows.length === 0, normalized });
  } catch (error) {
    console.error('Error checking slug:', error);
    res.status(500).json({ error: 'Failed to check slug' });
  }
});

// PATCH /api/companies/slug — Change the active company's slug (owner only)
// Returns a new JWT so the frontend can navigate to the new URL immediately.
router.patch('/slug', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const companyId = req.user?.activeCompanyId;
    const { slug } = req.body || {};

    if (!companyId) return res.status(400).json({ error: 'No active company in token' });
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const normalized = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    if (!normalized || normalized.length < 2) {
      return res.status(400).json({ error: 'Slug must be at least 2 characters' });
    }

    // Verify ownership
    const roleCheck = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can change the URL slug' });
    }

    // Uniqueness check (excluding current company)
    const conflict = await pool.query(
      'SELECT id FROM companies WHERE slug = $1 AND id != $2',
      [normalized, companyId]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'That URL is already taken. Please choose another.' });
    }

    // Update
    const result = await pool.query(
      'UPDATE companies SET slug = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, slug',
      [normalized, companyId]
    );
    const company = result.rows[0];

    // Build a fresh JWT with the same companyId (slug lives in companies table, not token, but we reload the user)
    const userResult = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const userRole = roleCheck.rows[0].role;

    const allCompaniesResult = await pool.query(`
      SELECT c.id, c.name, COALESCE(c.slug, '') as slug, uc.role as user_role, c.owner_id,
             CASE WHEN c.owner_id = $1 THEN true ELSE false END as is_owner
      FROM user_companies uc JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 ORDER BY is_owner DESC, c.created_at ASC
    `, [userId]);

    const allCompanies = allCompaniesResult.rows.map(c => ({
      id: c.id, name: c.name, slug: c.slug, role: c.user_role, isOwner: c.is_owner
    }));

    const token = jwt.sign(
      { userId, email: user.email, firstName: user.first_name, lastName: user.last_name, activeCompanyId: companyId, role: userRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Company URL updated',
      slug: normalized,
      token,
      user: {
        id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email,
        role: userRole, companyId: company.id, companyName: company.name,
        companies: allCompanies,
        activeCompany: { id: company.id, name: company.name, slug: normalized, role: userRole, isOwner: true }
      }
    });
  } catch (error) {
    console.error('Error updating slug:', error);
    res.status(500).json({ error: 'Failed to update company URL' });
  }
});

// POST /api/companies/switch - Switch active company
router.post('/switch', authenticateToken, async (req, res) => {
  try {
    const { company_id, company_slug } = req.body || {};
    
    // Handle both userId and id from JWT token
    const userId = req.user?.userId || req.user?.id;
    
    if (!userId) {
      console.error('No userId in token:', req.user);
      return res.status(401).json({ error: 'Invalid token: missing user ID' });
    }

    console.log('Company switch request:', { company_id, company_slug, userId, tokenUser: req.user });

    let targetCompanyId = company_id;

    // If company_slug provided, resolve to company_id
    if (!targetCompanyId && company_slug) {
      console.log('Looking up company by slug:', company_slug);
      try {
        const r = await pool.query('SELECT id, name, slug FROM companies WHERE slug = $1', [company_slug]);
        if (r.rows.length > 0) {
          targetCompanyId = r.rows[0].id;
          console.log('Found company by slug:', r.rows[0]);
        } else {
          console.log('No company found with slug:', company_slug);
          // Fallback: try to find by name normalization
          const allCompanies = await pool.query('SELECT id, name, slug FROM companies');
          const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
          const match = allCompanies.rows.find(r => normalize(r.name) === company_slug || r.slug === company_slug);
          if (match) {
            targetCompanyId = match.id;
            console.log('Found company by name normalization:', match);
          }
        }
      } catch (err) {
        console.error('Error looking up company by slug:', err);
        return res.status(500).json({ error: 'Failed to lookup company: ' + err.message });
      }
    }

    if (!targetCompanyId) {
      console.error('No company ID found for:', { company_id, company_slug });
      return res.status(400).json({ error: 'company_id or company_slug is required' });
    }

    // Verify membership
    const membership = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, targetCompanyId]
    );
    if (membership.rows.length === 0) {
      console.error('User not a member of company:', { userId, targetCompanyId });
      return res.status(403).json({ error: 'Not a member of this company' });
    }
    
    console.log('Membership verified for company:', targetCompanyId);

    // Get company details including slug
    const companyResult = await pool.query(
      'SELECT id, name, COALESCE(slug, LOWER(REGEXP_REPLACE(name, \'[^a-z0-9]+\', \'-\', \'g\'))) as slug, owner_id, country_code, suspended_at FROM companies WHERE id = $1',
      [targetCompanyId]
    );
    const company = companyResult.rows[0];
    
    if (!company) {
      console.error('Company not found:', targetCompanyId);
      return res.status(404).json({ error: 'Company not found' });
    }

    if (company.suspended_at) {
      return res.status(423).json({ error: 'Company is on hold and cannot be accessed' });
    }
    
    // Get user role in the company
    const roleResult = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, targetCompanyId]
    );
    const userRole = roleResult.rows[0]?.role || 'employee';

    // Get all companies for the user
    const allCompaniesResult = await pool.query(`
      SELECT 
        c.id,
        c.name,
        COALESCE(c.slug, LOWER(REGEXP_REPLACE(c.name, '[^a-z0-9]+', '-', 'g'))) as slug,
        c.country_code,
        uc.role as user_role,
        c.owner_id,
        CASE WHEN c.owner_id = $1 THEN true ELSE false END as is_owner
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      ORDER BY is_owner DESC, c.created_at ASC
    `, [userId]);

    const allCompanies = allCompaniesResult.rows.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      countryCode: c.country_code || DEFAULT_COUNTRY_CODE,
      role: c.user_role,
      isOwner: c.is_owner
    }));

    // Get user details first
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, role, language_code FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // Issue a new token with updated activeCompanyId
    const token = jwt.sign(
      {
        userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        activeCompanyId: targetCompanyId,
        role: userRole
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      message: 'Switched active company', 
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        languageCode: user.language_code || DEFAULT_LANGUAGE_CODE,
        role: userRole,
        companyId: company.id,
        companyName: company.name,
        companies: allCompanies,
        activeCompany: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          countryCode: company.country_code || DEFAULT_COUNTRY_CODE,
          role: userRole,
          isOwner: company.owner_id === userId
        }
      }
    });
  } catch (error) {
    console.error('Error switching company:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to switch active company',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/companies/profile - Get company profile (uses active company from token when available)
// Must be defined BEFORE /:companyId so "profile" is not interpreted as a company ID
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const activeCompanyId = req.user.activeCompanyId;
    const { pool } = require('../utils/database');

    let companyId = activeCompanyId;
    if (!companyId) {
      const result = await pool.query(`
        SELECT uc.company_id
        FROM user_companies uc
        WHERE uc.user_id = $1
        LIMIT 1
      `, [userId]);
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'No active company found' });
      }
      companyId = result.rows[0].company_id;
    } else {
      const member = await pool.query(
        'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [userId, companyId]
      );
      if (member.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of the active company' });
      }
    }

    // Ensure route-location columns exist (run once per deployment)
    try {
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_start_address TEXT');
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_end_address TEXT');
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS route_locations_enabled BOOLEAN DEFAULT TRUE');
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT '${DEFAULT_COUNTRY_CODE}'`);
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)');
    } catch (e) { /* ignore */ }

    const { normalizeCompanyTimezone } = require('../utils/companyTimezone');

    const companyResult = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
    const countryCode = company.country_code || DEFAULT_COUNTRY_CODE;
    const effectiveTimezone = normalizeCompanyTimezone(company.timezone, countryCode);
    res.json({
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug || '',
        country: company.country,
        countryCode,
        timezone: company.timezone || null,
        effectiveTimezone,
        cvrNumber: company.cvr_number,
        address: company.address,
        city: company.city,
        zipCode: company.zip_code,
        defaultStartAddress: company.default_start_address ?? '',
        defaultEndAddress: company.default_end_address ?? '',
        routeLocationsEnabled: company.route_locations_enabled !== false,
      }
    });
  } catch (error) {
    console.error('Error fetching company profile:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

// PUT /api/companies/profile - Update company profile (uses active company from token when available)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const activeCompanyId = req.user.activeCompanyId;
    const { pool } = require('../utils/database');

    let companyId = activeCompanyId;
    if (!companyId) {
      const result = await pool.query(`
        SELECT uc.company_id
        FROM user_companies uc
        WHERE uc.user_id = $1
        LIMIT 1
      `, [userId]);
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'No active company found' });
      }
      companyId = result.rows[0].company_id;
    } else {
      const member = await pool.query(
        'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [userId, companyId]
      );
      if (member.rows.length === 0) {
        return res.status(403).json({ error: 'Not a member of the active company' });
      }
    }

    const {
      name,
      country,
      countryCode,
      timezone,
      cvrNumber,
      address,
      city,
      zipCode,
      defaultStartAddress,
      defaultEndAddress,
      routeLocationsEnabled,
    } = req.body;

    const { isValidIanaTimeZone } = require('../utils/companyTimezone');

    // Ensure columns exist
    try {
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_start_address TEXT');
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_end_address TEXT');
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS route_locations_enabled BOOLEAN DEFAULT TRUE');
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT '${DEFAULT_COUNTRY_CODE}'`);
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)');
    } catch (e) { /* ignore */ }

    const hasTimezoneKey = Object.prototype.hasOwnProperty.call(req.body, 'timezone');
    let timezoneParam = null;
    if (hasTimezoneKey) {
      if (timezone === null || String(timezone).trim() === '') {
        timezoneParam = null;
      } else {
        const tz = String(timezone).trim();
        if (!isValidIanaTimeZone(tz)) {
          return res.status(400).json({
            error: 'Invalid timezone. Use an IANA name such as Europe/Copenhagen or America/Los_Angeles.',
          });
        }
        timezoneParam = tz;
      }
    }

    const locationsEnabled = routeLocationsEnabled === undefined ? undefined : Boolean(routeLocationsEnabled);

    await pool.query(
      `UPDATE companies SET name = $1, country = $2, country_code = COALESCE($3, country_code, '${DEFAULT_COUNTRY_CODE}'), cvr_number = $4, address = $5, city = $6, zip_code = $7,
        default_start_address = $8, default_end_address = $9,
        route_locations_enabled = COALESCE($10, route_locations_enabled, TRUE),
        timezone = CASE WHEN $12::boolean THEN $11 ELSE timezone END,
        updated_at = CURRENT_TIMESTAMP WHERE id = $13`,
      [
        name != null ? String(name).trim() : null,
        country != null ? String(country).trim() : null,
        countryCode != null ? normalizeCountryCode(countryCode) : null,
        cvrNumber != null ? String(cvrNumber).trim() : null,
        address != null ? String(address).trim() : null,
        city != null ? String(city).trim() : null,
        zipCode != null ? String(zipCode).trim() : null,
        defaultStartAddress != null ? String(defaultStartAddress).trim() : null,
        defaultEndAddress != null ? String(defaultEndAddress).trim() : null,
        locationsEnabled,
        timezoneParam,
        hasTimezoneKey,
        companyId,
      ]
    );

    res.json({
      message: 'Company profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating company profile:', error);
    res.status(500).json({ error: 'Failed to update company profile' });
  }
});

const DEFAULT_INVOICE_EMAIL_SUBJECT = 'Invoice {invoice_number}';
const DEFAULT_INVOICE_REMINDER_SUBJECT = 'Reminder: Invoice {invoice_number}';

async function ensureCompanyInvoiceSettingsColumns() {
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_default_due_days INTEGER DEFAULT 30');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_default_payment_terms TEXT');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_email_default_subject TEXT');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_email_default_body TEXT');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_reminder_default_subject TEXT');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_reminder_default_body TEXT');
  await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number BIGINT NOT NULL DEFAULT 1');
}

async function resolveProfileCompanyId(req) {
  const userId = req.user.userId;
  let companyId = req.user.activeCompanyId;
  if (!companyId) {
    const result = await pool.query(
      'SELECT uc.company_id FROM user_companies uc WHERE uc.user_id = $1 LIMIT 1',
      [userId]
    );
    if (result.rows.length === 0) {
      return { error: 'No active company found', status: 400 };
    }
    companyId = result.rows[0].company_id;
  } else {
    const member = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (member.rows.length === 0) {
      return { error: 'Not a member of the active company', status: 403 };
    }
  }
  return { companyId };
}

// GET /api/companies/invoice-defaults — default invoicing options for the active company
router.get('/invoice-defaults', authenticateToken, async (req, res) => {
  try {
    const resolved = await resolveProfileCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;
    await ensureCompanyInvoiceSettingsColumns();

    const row = (
      await pool.query(
        `
      SELECT
        invoice_default_due_days,
        invoice_default_payment_terms,
        invoice_email_default_subject,
        invoice_email_default_body,
        invoice_reminder_default_subject,
        invoice_reminder_default_body,
        invoice_next_number
      FROM companies WHERE id = $1
    `,
        [companyId]
      )
    ).rows[0];

    const maxRow = await pool.query(
      `
      SELECT COALESCE(MAX(CAST(invoice_number AS BIGINT)), 0) AS max_num
      FROM invoices
      WHERE company_id = $1
        AND invoice_number ~ '^[0-9]+$'
        AND LENGTH(invoice_number) <= 18
    `,
      [companyId]
    );
    const maxNumericInvoice = Number(maxRow.rows[0].max_num) || 0;

    const defaults = {
      invoiceDefaultDueDays: row.invoice_default_due_days != null ? Number(row.invoice_default_due_days) : 30,
      invoiceDefaultPaymentTerms: row.invoice_default_payment_terms || '',
      invoiceEmailDefaultSubject: row.invoice_email_default_subject || DEFAULT_INVOICE_EMAIL_SUBJECT,
      invoiceEmailDefaultBody: row.invoice_email_default_body || '',
      invoiceReminderDefaultSubject: row.invoice_reminder_default_subject || DEFAULT_INVOICE_REMINDER_SUBJECT,
      invoiceReminderDefaultBody: row.invoice_reminder_default_body || '',
      invoiceNextNumber: row.invoice_next_number != null ? Number(row.invoice_next_number) : 1,
      maxNumericInvoice,
    };

    res.json({ defaults });
  } catch (error) {
    console.error('Error fetching invoice defaults:', error);
    res.status(500).json({ error: 'Failed to fetch invoice defaults' });
  }
});

// PUT /api/companies/invoice-defaults
router.put('/invoice-defaults', authenticateToken, async (req, res) => {
  try {
    const resolved = await resolveProfileCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;
    await ensureCompanyInvoiceSettingsColumns();

    const {
      invoiceDefaultDueDays,
      invoiceDefaultPaymentTerms,
      invoiceEmailDefaultSubject,
      invoiceEmailDefaultBody,
      invoiceReminderDefaultSubject,
      invoiceReminderDefaultBody,
      invoiceNextNumber,
    } = req.body || {};

    const updates = [];
    const values = [];
    let p = 1;

    if (invoiceDefaultDueDays != null && invoiceDefaultDueDays !== '') {
      const n = parseInt(String(invoiceDefaultDueDays), 10);
      if (Number.isNaN(n) || n < 1 || n > 3650) {
        return res.status(400).json({ error: 'Default due days must be between 1 and 3650' });
      }
      updates.push(`invoice_default_due_days = $${p++}`);
      values.push(n);
    }
    if (invoiceDefaultPaymentTerms !== undefined) {
      updates.push(`invoice_default_payment_terms = $${p++}`);
      values.push(String(invoiceDefaultPaymentTerms ?? ''));
    }
    if (invoiceEmailDefaultSubject !== undefined) {
      updates.push(`invoice_email_default_subject = $${p++}`);
      values.push(String(invoiceEmailDefaultSubject ?? '').trim() || DEFAULT_INVOICE_EMAIL_SUBJECT);
    }
    if (invoiceEmailDefaultBody !== undefined) {
      updates.push(`invoice_email_default_body = $${p++}`);
      values.push(String(invoiceEmailDefaultBody ?? ''));
    }
    if (invoiceReminderDefaultSubject !== undefined) {
      updates.push(`invoice_reminder_default_subject = $${p++}`);
      values.push(String(invoiceReminderDefaultSubject ?? '').trim() || DEFAULT_INVOICE_REMINDER_SUBJECT);
    }
    if (invoiceReminderDefaultBody !== undefined) {
      updates.push(`invoice_reminder_default_body = $${p++}`);
      values.push(String(invoiceReminderDefaultBody ?? ''));
    }
    if (invoiceNextNumber != null && invoiceNextNumber !== '') {
      const n = parseInt(String(invoiceNextNumber), 10);
      if (Number.isNaN(n) || n < 1) {
        return res.status(400).json({ error: 'Next invoice number must be a positive integer' });
      }
      const dup = await pool.query(
        `SELECT 1 FROM invoices WHERE company_id = $1 AND invoice_number = $2 LIMIT 1`,
        [companyId, String(n)]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({
          error: `Invoice number ${n} already exists. Choose a next number that is not already used.`,
        });
      }
      updates.push(`invoice_next_number = $${p++}`);
      values.push(n);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(companyId);
    await pool.query(
      `UPDATE companies SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${p}`,
      values
    );

    const row = (
      await pool.query(
        `
      SELECT
        invoice_default_due_days,
        invoice_default_payment_terms,
        invoice_email_default_subject,
        invoice_email_default_body,
        invoice_reminder_default_subject,
        invoice_reminder_default_body,
        invoice_next_number
      FROM companies WHERE id = $1
    `,
        [companyId]
      )
    ).rows[0];

    const maxRow = await pool.query(
      `
      SELECT COALESCE(MAX(CAST(invoice_number AS BIGINT)), 0) AS max_num
      FROM invoices
      WHERE company_id = $1
        AND invoice_number ~ '^[0-9]+$'
        AND LENGTH(invoice_number) <= 18
    `,
      [companyId]
    );
    const maxNumericInvoice = Number(maxRow.rows[0].max_num) || 0;

    res.json({
      defaults: {
        invoiceDefaultDueDays: row.invoice_default_due_days != null ? Number(row.invoice_default_due_days) : 30,
        invoiceDefaultPaymentTerms: row.invoice_default_payment_terms || '',
        invoiceEmailDefaultSubject: row.invoice_email_default_subject || DEFAULT_INVOICE_EMAIL_SUBJECT,
        invoiceEmailDefaultBody: row.invoice_email_default_body || '',
        invoiceReminderDefaultSubject: row.invoice_reminder_default_subject || DEFAULT_INVOICE_REMINDER_SUBJECT,
        invoiceReminderDefaultBody: row.invoice_reminder_default_body || '',
        invoiceNextNumber: row.invoice_next_number != null ? Number(row.invoice_next_number) : 1,
        maxNumericInvoice,
      },
    });
  } catch (error) {
    console.error('Error updating invoice defaults:', error);
    res.status(500).json({ error: 'Failed to update invoice defaults' });
  }
});

// GET /api/companies/:companyId/invitations - Get company invitations (team page)
router.get('/:companyId/invitations', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const userId = req.user.userId;

    const accessCheck = await pool.query(`
      SELECT role FROM user_companies
      WHERE user_id = $1 AND company_id = $2
    `, [userId, companyId]);

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const result = await pool.query(`
      SELECT
        ci.id, ci.email, ci.role, ci.token, ci.status, ci.created_at,
        u.first_name as invited_by_name,
        u.last_name as invited_by_last_name
      FROM company_invitations ci
      LEFT JOIN users u ON ci.invited_by_user_id = u.id
      WHERE ci.company_id = $1 AND ci.status = 'pending' AND ci.expires_at > NOW()
      ORDER BY ci.created_at DESC
    `, [companyId]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
    const invitations = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      invitationUrl: `${baseUrl}/invite/${row.token}`,
      status: 'pending',
    }));

    res.json({ invitations, total: invitations.length });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// POST /api/companies/:companyId/invite - Invite user to company (team page)
router.post('/:companyId/invite', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { email, role } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const permissionCheck = await pool.query(`
      SELECT uc.role, c.name as company_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2
    `, [userId, companyId]);

    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const companyRole = permissionCheck.rows[0].role;
    if (companyRole !== 'owner' && companyRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can invite users' });
    }

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // Check if user already exists and is already an active member of this company
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      const existingUserId = existingUser.rows[0].id;
      const memberCheck = await pool.query(
        'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [existingUserId, companyId]
      );
      if (memberCheck.rows.length > 0) {
        return res.status(400).json({ error: 'This person is already a member of this company' });
      }
    }

    // Cancel any existing pending invites for this email+company so we don't create duplicates
    await pool.query(
      `UPDATE company_invitations SET status = 'cancelled' WHERE company_id = $1 AND email = $2 AND status = 'pending'`,
      [companyId, email]
    );

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(`
      INSERT INTO company_invitations
      (company_id, invited_by_user_id, email, role, token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [companyId, userId, email, role || 'employee', token, expiresAt]);

    const inviteResult = await pool.query(
      'SELECT id FROM company_invitations WHERE token = $1',
      [token]
    );
    const invitationId = inviteResult.rows[0]?.id;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const invitationUrl = `${baseUrl}/invite/${token}`;

    // Fetch inviter's name
    const inviterResult = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);
    const inviterName = inviterResult.rows.length > 0
      ? `${inviterResult.rows[0].first_name} ${inviterResult.rows[0].last_name}`
      : 'Your team';

    const companyName = permissionCheck.rows[0].company_name;
    const { html, text, subject } = buildInvitationEmail({ email, companyName, inviterName, role: role || 'employee', inviteLink: invitationUrl, expiresAt });

    try {
      await sendEmail({ to: email, subject, html, text, companyId: parseInt(companyId, 10) });
      console.log(`✅ Invitation email sent to ${email} for company ${companyName}`);
    } catch (emailErr) {
      console.error('⚠️ Invitation saved but email failed:', emailErr.message || emailErr);
    }

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitationId,
        email,
        role: role || 'employee',
        expiresAt,
        invitationUrl,
      },
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// DELETE /api/companies/:companyId/invitations/:invitationId
router.delete('/:companyId/invitations/:invitationId', authenticateToken, async (req, res) => {
  try {
    const { companyId, invitationId } = req.params;
    const userId = req.user.userId;

    const permissionCheck = await pool.query(`
      SELECT uc.role FROM user_companies uc
      WHERE uc.user_id = $1 AND uc.company_id = $2
    `, [userId, companyId]);

    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }
    const companyRole = permissionCheck.rows[0].role;
    if (companyRole !== 'owner' && companyRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can remove invitations' });
    }

    const result = await pool.query(
      `DELETE FROM company_invitations WHERE id = $1 AND company_id = $2 AND status = 'pending' RETURNING id`,
      [invitationId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending invitation not found' });
    }

    res.json({ message: 'Invitation removed successfully' });
  } catch (error) {
    console.error('Error removing invitation:', error);
    res.status(500).json({ error: 'Failed to remove invitation' });
  }
});

// POST /api/companies/:companyId/invitations/:invitationId/resend
router.post('/:companyId/invitations/:invitationId/resend', authenticateToken, async (req, res) => {
  try {
    const { companyId, invitationId } = req.params;
    const userId = req.user.userId;

    // Verify permission
    const permissionCheck = await pool.query(`
      SELECT uc.role, c.name as company_name
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2
    `, [userId, companyId]);

    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }
    const companyRole = permissionCheck.rows[0].role;
    if (companyRole !== 'owner' && companyRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can resend invitations' });
    }

    // Fetch the invitation
    const inviteResult = await pool.query(
      `SELECT * FROM company_invitations WHERE id = $1 AND company_id = $2 AND status = 'pending'`,
      [invitationId, companyId]
    );
    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or already accepted' });
    }
    const invitation = inviteResult.rows[0];

    // Refresh the expiry to give another 7 days
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);
    await pool.query(
      `UPDATE company_invitations SET expires_at = $1 WHERE id = $2`,
      [newExpiry, invitationId]
    );

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const inviteLink = `${baseUrl}/invite/${invitation.token}`;

    const inviterResult = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [userId]);
    const inviterName = inviterResult.rows.length > 0
      ? `${inviterResult.rows[0].first_name} ${inviterResult.rows[0].last_name}`
      : 'Your team';

    const companyName = permissionCheck.rows[0].company_name;
    const { html, text, subject } = buildInvitationEmail({
      email: invitation.email,
      companyName,
      inviterName,
      role: invitation.role,
      inviteLink,
      expiresAt: newExpiry,
    });

    await sendEmail({ to: invitation.email, subject, html, text, companyId: parseInt(companyId, 10) });
    console.log(`✅ Invitation resent to ${invitation.email}`);

    res.json({ message: 'Invitation resent successfully' });
  } catch (error) {
    console.error('Error resending invitation:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// PUT /api/companies/:companyId - Update company (setup wizard; owner only)
router.put('/:companyId', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { name, country, countryCode, cvrNumber, address, city, zipCode, slug: requestedSlug, timezone } = req.body;
    const userId = req.user.userId;

    try {
      await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)');
    } catch (e) { /* ignore */ }

    const { isValidIanaTimeZone } = require('../utils/companyTimezone');

    // Verify user is owner of the company
    const ownerCheck = await pool.query(`
      SELECT c.* FROM companies c
      WHERE c.id = $1 AND c.owner_id = $2
    `, [companyId, userId]);

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only company owner can update company details' });
    }

    const currentCompany = ownerCheck.rows[0];
    const newName = (name != null && String(name).trim()) ? String(name).trim() : currentCompany.name;
    if (!newName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const normalizeSlug = (s) =>
      String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // If the wizard explicitly sent a slug, use it (with collision-safety suffix).
    // Otherwise only regenerate if the name changed; preserve the current slug otherwise.
    let slug = currentCompany.slug;
    const candidateSlug = requestedSlug
      ? normalizeSlug(requestedSlug)
      : (newName !== currentCompany.name ? normalizeSlug(newName) : null);

    if (candidateSlug && candidateSlug.length >= 2) {
      slug = candidateSlug;
      let counter = 1;
      let slugCheck = await pool.query(
        'SELECT id FROM companies WHERE slug = $1 AND id != $2',
        [slug, companyId]
      );
      while (slugCheck.rows.length > 0) {
        slug = candidateSlug + '-' + counter;
        slugCheck = await pool.query(
          'SELECT id FROM companies WHERE slug = $1 AND id != $2',
          [slug, companyId]
        );
        counter++;
      }
    }

    let nextTimezone = currentCompany.timezone;
    if (Object.prototype.hasOwnProperty.call(req.body, 'timezone')) {
      if (timezone === null || String(timezone).trim() === '') {
        nextTimezone = null;
      } else {
        const tz = String(timezone).trim();
        if (!isValidIanaTimeZone(tz)) {
          return res.status(400).json({
            error: 'Invalid timezone. Use an IANA name such as Europe/Copenhagen or America/Los_Angeles.',
          });
        }
        nextTimezone = tz;
      }
    }

    const result = await pool.query(`
      UPDATE companies
      SET name = $1, slug = $2, country = $3, country_code = COALESCE($4, country_code, '${DEFAULT_COUNTRY_CODE}'),
          cvr_number = $5, address = $6, city = $7, zip_code = $8, timezone = $9, updated_at = NOW()
      WHERE id = $10
      RETURNING id, name, slug, country, country_code, timezone, cvr_number as "cvrNumber", address, city, zip_code as "zipCode"
    `, [
      newName,
      slug,
      country != null ? String(country).trim() : null,
      countryCode != null ? normalizeCountryCode(countryCode) : null,
      cvrNumber != null ? String(cvrNumber).trim() : null,
      address != null ? String(address).trim() : null,
      city != null ? String(city).trim() : null,
      zipCode != null ? String(zipCode).trim() : null,
      nextTimezone,
      companyId
    ]);

    const { normalizeCompanyTimezone } = require('../utils/companyTimezone');
    const company = result.rows[0];
    const cc = company.country_code || DEFAULT_COUNTRY_CODE;
    res.json({
      message: 'Company updated successfully',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        country: company.country,
        countryCode: cc,
        timezone: company.timezone || null,
        effectiveTimezone: normalizeCompanyTimezone(company.timezone, cc),
        cvrNumber: company.cvrNumber,
        address: company.address,
        city: company.city,
        zipCode: company.zipCode
      }
    });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// POST /api/companies - Create new company (admin only)
router.post('/', async (req, res) => {
  try {
    const { name, ownerEmail, slug: requestedSlug, countryCode } = req.body;
    const userId = req.user.userId;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!name || !ownerEmail) {
      return res.status(400).json({ error: 'Company name and owner email are required' });
    }

    // Check if owner exists
    const ownerCheck = await pool.query('SELECT id FROM users WHERE email = $1', [ownerEmail]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Owner user not found' });
    }

    const ownerId = ownerCheck.rows[0].id;

    // Generate slug (use requested slug if provided, otherwise derive from name)
    const normalizeSlug = (s) =>
      String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    let slugBase = requestedSlug ? normalizeSlug(requestedSlug) : normalizeSlug(name);
    if (!slugBase || slugBase.length < 2) slugBase = normalizeSlug(name);

    let slug = slugBase;
    let counter = 1;
    let slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
    while (slugCheck.rows.length > 0) {
      slug = slugBase + '-' + counter;
      slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      counter++;
    }

    // Create company
    const result = await pool.query(`
      INSERT INTO companies (name, slug, owner_id, country_code)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, slug, ownerId, normalizeCountryCode(countryCode)]);

    const company = result.rows[0];

    // Link owner to company
    await pool.query(`
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, company_id) DO NOTHING
    `, [ownerId, company.id, 'owner']);

    res.status(201).json({
      message: 'Company created successfully',
      company
    });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

module.exports = router;
