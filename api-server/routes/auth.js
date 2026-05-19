const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../utils/database');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('../utils/email');
const {
  fetchUserCompanies,
  fetchPendingInvitesForEmail,
} = require('../utils/userLoginPayload');

const router = express.Router();

// JWT Secret - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DEFAULT_LANGUAGE_CODE = 'en';
const DEFAULT_COUNTRY_CODE = 'DK';
const REGISTRATION_CODE_TTL_MINUTES = 15;

pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) NOT NULL DEFAULT '${DEFAULT_LANGUAGE_CODE}'`)
  .catch((err) => console.error('[auth] language_code column check failed:', err.message));
pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT '${DEFAULT_COUNTRY_CODE}'`)
  .catch((err) => console.error('[auth] country_code column check failed:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS registration_verification_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    verify_token_hash VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch((err) => console.error('[auth] registration_verification_codes table check failed:', err.message));

pool.query(`
  CREATE INDEX IF NOT EXISTS idx_registration_verification_codes_email
  ON registration_verification_codes (email)
`).catch((err) => console.error('[auth] registration_verification_codes email index check failed:', err.message));

pool.query(`
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
`).catch((err) => console.error('[auth] signup_progress_drafts table check failed:', err.message));

pool.query(`
  CREATE INDEX IF NOT EXISTS idx_signup_progress_drafts_updated
  ON signup_progress_drafts (updated_at DESC)
`).catch((err) => console.error('[auth] signup_progress_drafts index check failed:', err.message));

const SIGNUP_PROGRESS_STEPS = new Set([
  'name_entered',
  'email_entered',
  'details_ready',
  'code_sent',
  'code_verified',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart) return normalized;
  const visible = localPart.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, localPart.length - 2))}@${domainPart}`;
}

function generateRegistrationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/register/signup-progress — anonymous funnel (name before email)
router.post('/register/signup-progress', async (req, res) => {
  const { sessionId, firstName, lastName, email, step } = req.body || {};
  const sid = String(sessionId || '').trim();
  if (!sid || sid.length > 128) {
    return res.status(400).json({ error: 'Valid sessionId is required' });
  }
  const stepRaw = String(step || 'name_entered').trim();
  if (!SIGNUP_PROGRESS_STEPS.has(stepRaw)) {
    return res.status(400).json({ error: 'Invalid step' });
  }
  const fn = firstName != null ? String(firstName).trim().slice(0, 255) : '';
  const ln = lastName != null ? String(lastName).trim().slice(0, 255) : '';
  let em = email != null ? normalizeEmail(email) : '';
  if (em && !em.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (!em) em = null;

  try {
    await pool.query(
      `INSERT INTO signup_progress_drafts (client_session_id, first_name, last_name, email, step, updated_at)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, NOW())
       ON CONFLICT (client_session_id)
       DO UPDATE SET
         first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), signup_progress_drafts.first_name),
         last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), signup_progress_drafts.last_name),
         email = COALESCE(EXCLUDED.email, signup_progress_drafts.email),
         step = EXCLUDED.step,
         updated_at = NOW()`,
      [sid, fn, ln, em, stepRaw]
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[auth] register/signup-progress error:', error);
    return res.status(500).json({ error: 'Failed to save progress' });
  }
});

// POST /api/auth/register/send-code
router.post('/register/send-code', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const code = generateRegistrationCode();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + REGISTRATION_CODE_TTL_MINUTES * 60 * 1000);

    await pool.query(
      `DELETE FROM registration_verification_codes
       WHERE email = $1 AND consumed_at IS NULL`,
      [normalizedEmail]
    );

    await pool.query(
      `INSERT INTO registration_verification_codes (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, codeHash, expiresAt]
    );

    await sendEmail({
      to: normalizedEmail,
      subject: 'Your PathPilo verification code',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify your email</title></head>
<body style="margin:0;padding:0;background:#F4F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F4;padding:36px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 36px 8px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Confirm your email address</h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#6b7280;">
              Enter this code on the registration page to continue creating your account. The code expires in ${REGISTRATION_CODE_TTL_MINUTES} minutes.
            </p>
            <div style="margin:0 0 16px;padding:14px 16px;border:1px solid #d1fae5;background:#ecfdf5;border-radius:12px;text-align:center;">
              <span style="display:inline-block;font-size:30px;letter-spacing:6px;font-weight:800;color:#065f46;">${code}</span>
            </div>
            <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">
              If you didn't request this, you can ignore this email.
            </p>
            ${STANDARD_FOOTER_PLACEHOLDER}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
      text: `Confirm your email address\n\nYour PathPilo verification code is: ${code}\n\nThe code expires in ${REGISTRATION_CODE_TTL_MINUTES} minutes.`,
      fromName: process.env.FROM_NAME || 'PathPilo',
    });

    return res.status(200).json({
      message: 'Verification code sent',
      expiresInMinutes: REGISTRATION_CODE_TTL_MINUTES,
      email: maskEmail(normalizedEmail),
    });
  } catch (error) {
    console.error('[auth] register/send-code error:', error);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// POST /api/auth/register/verify-code
router.post('/register/verify-code', async (req, res) => {
  const { email, code } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const cleanCode = String(code || '').trim();
  if (!normalizedEmail || !cleanCode) {
    return res.status(400).json({ error: 'Email and code are required' });
  }

  try {
    const rowRes = await pool.query(
      `SELECT id, code_hash, expires_at
       FROM registration_verification_codes
       WHERE email = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail]
    );
    if (rowRes.rows.length === 0) {
      return res.status(400).json({ error: 'No active verification code found. Request a new code.' });
    }

    const row = rowRes.rows[0];
    if (new Date() > new Date(row.expires_at)) {
      return res.status(400).json({ error: 'Verification code expired. Request a new code.' });
    }

    const providedHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
    if (providedHash !== row.code_hash) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    const verifyTokenRaw = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = crypto.createHash('sha256').update(verifyTokenRaw).digest('hex');
    await pool.query(
      `UPDATE registration_verification_codes
       SET verify_token_hash = $1
       WHERE id = $2`,
      [verifyTokenHash, row.id]
    );

    return res.status(200).json({
      message: 'Email verified',
      verificationToken: verifyTokenRaw,
    });
  } catch (error) {
    console.error('[auth] register/verify-code error:', error);
    return res.status(500).json({ error: 'Failed to verify code' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { firstName, lastName, email, password, invitationToken, trialToken, languageCode, verificationToken, signupSessionId } = req.body;
    const normalizedLanguageCode = String(languageCode || DEFAULT_LANGUAGE_CODE).trim().toLowerCase() || DEFAULT_LANGUAGE_CODE;
    const normalizedEmail = normalizeEmail(email);

    console.log('Registration attempt:', { firstName, lastName, email, hasInvitation: !!invitationToken, hasTrial: !!trialToken });

    // Validate input
    if (!firstName || !lastName || !email || !password || !verificationToken) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'All fields including verification are required' });
    }

    const verificationTokenHash = crypto.createHash('sha256').update(String(verificationToken)).digest('hex');
    const verifyRes = await client.query(
      `SELECT id, expires_at
       FROM registration_verification_codes
       WHERE email = $1
         AND verify_token_hash = $2
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, verificationTokenHash]
    );
    if (verifyRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Email is not verified. Please verify your code first.' });
    }
    if (new Date() > new Date(verifyRes.rows[0].expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Verification expired. Please request a new code.' });
    }

    // Check if user already exists
    const existingUser = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      // If they're registering via an invitation, tell the frontend to send them to login instead
      if (invitationToken) {
        return res.status(409).json({
          error: 'account_exists',
          message: 'An account with this email already exists. Please log in to accept your invitation.',
          loginUrl: `/login?invite=${encodeURIComponent(invitationToken)}&email=${encodeURIComponent(normalizedEmail)}`,
        });
      }
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Validate trial token (if provided) — look up before creating user
    let trialRecord = null;
    if (trialToken) {
      const trialRes = await client.query(
        'SELECT * FROM trial_invites WHERE token = $1 AND registered_at IS NULL',
        [trialToken]
      );
      if (trialRes.rows.length > 0) {
        trialRecord = trialRes.rows[0];
      }
      // If token not found we just ignore it and register normally
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    let user, companyId, companyName, userRole;

    if (invitationToken) {
      // PATH 2: Invitation registration
      // Find and validate invitation
      const inviteResult = await client.query(`
        SELECT ci.*, c.name as company_name
        FROM company_invitations ci
        JOIN companies c ON ci.company_id = c.id
        WHERE ci.token = $1
          AND ci.status = 'pending'
          AND ci.email = $2
          AND ci.expires_at > NOW()
      `, [invitationToken, normalizedEmail]);

      if (inviteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid or expired invitation' });
      }

      const invitation = inviteResult.rows[0];
      companyId = invitation.company_id;
      companyName = invitation.company_name;
      userRole = invitation.role; // Role assigned by owner

      // Create user (no company_id, will be linked via user_companies)
      const userResult = await client.query(
        'INSERT INTO users (first_name, last_name, email, password_hash, role, language_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, role, language_code, created_at',
        [firstName, lastName, normalizedEmail, passwordHash, userRole, normalizedLanguageCode]
      );
      user = userResult.rows[0];

      // Link user to company with assigned role
      await client.query(
        'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
        [user.id, companyId, userRole]
      );

      // Mark invitation as accepted
      await client.query(
        'UPDATE company_invitations SET status = $1, accepted_at = NOW() WHERE id = $2',
        ['accepted', invitation.id]
      );

    } else {
      // PATH 1: Normal registration - Create user + company
      // Create user first
      const userResult = await client.query(
        'INSERT INTO users (first_name, last_name, email, password_hash, role, language_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, role, language_code, created_at',
        [firstName, lastName, normalizedEmail, passwordHash, 'company-owner', normalizedLanguageCode]
      );
      user = userResult.rows[0];
      userRole = 'owner';

      // Generate slug from company name
      const generatedCompanyName = `${firstName}'s Company`
      const generateSlug = (name) => {
        return name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      }
      let companySlug = generateSlug(generatedCompanyName)
      // Ensure uniqueness
      let counter = 1
      let slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1', [companySlug])
      while (slugCheck.rows.length > 0) {
        companySlug = generateSlug(generatedCompanyName) + '-' + counter
        slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1', [companySlug])
        counter++
      }

      // Create company with user as owner
      const companyResult = await client.query(
        'INSERT INTO companies (name, slug, owner_id, country_code) VALUES ($1, $2, $3, $4) RETURNING id, name, slug, country_code',
        [generatedCompanyName, companySlug, user.id, DEFAULT_COUNTRY_CODE]
      );
      const company = companyResult.rows[0];
      companyId = company.id;
      companyName = company.name;

      // Link user to company as owner
      await client.query(
        'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
        [user.id, companyId, 'owner']
      );

      // Apply trial expiry for ALL normal registrations.
      // - If trial token exists: use the token's configured trial_days
      // - Otherwise: default to 14 days (same company expires_at mechanism)
      const appliedTrialDays = trialRecord?.trial_days || 14;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + appliedTrialDays);
      await client.query(
        'UPDATE companies SET expires_at = $1 WHERE id = $2',
        [expiresAt, companyId]
      );

      // If registration came from a trial invite, mark it consumed
      if (trialRecord) {
        await client.query(
          `UPDATE trial_invites
           SET registered_at = NOW(), registered_user_id = $1, registered_company_id = $2
           WHERE id = $3`,
          [user.id, companyId, trialRecord.id]
        );
      }
    }

    await client.query(
      `UPDATE registration_verification_codes
       SET consumed_at = NOW()
       WHERE id = $1`,
      [verifyRes.rows[0].id]
    );

    const signupSid = String(signupSessionId || '').trim();
    await client.query(
      `DELETE FROM signup_progress_drafts
       WHERE ($1 <> '' AND client_session_id = $1)
          OR LOWER(TRIM(COALESCE(email, ''))) = $2`,
      [signupSid, normalizedEmail]
    );

    await client.query('COMMIT');

    // Generate JWT token with active company
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        activeCompanyId: companyId,
        role: userRole
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Fetch company with slug so the frontend can redirect properly
    const companyResult = await pool.query(
      `SELECT id, name, COALESCE(slug, LOWER(REGEXP_REPLACE(name, '[^a-z0-9]+', '-', 'g'))) AS slug, country_code FROM companies WHERE id = $1`,
      [companyId]
    );
    const company = companyResult.rows[0] || { id: companyId, name: companyName, slug: null };

    const activeCompany = {
      id: company.id,
      name: company.name,
      slug: company.slug,
      countryCode: company.country_code || DEFAULT_COUNTRY_CODE,
      role: userRole,
    };

    res.status(201).json({
      message: invitationToken ? 'User registered and joined company successfully' : 'User and company created successfully',
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
        activeCompany,
        companies: [activeCompany],
        pendingInvites: [],
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // ── Super admin check (env-only, no DB entry) ──────────────────────────
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
    const adminPassword =
      process.env.ADMIN_PASSWORD !== undefined && process.env.ADMIN_PASSWORD !== null
        ? String(process.env.ADMIN_PASSWORD).trim()
        : '';
    const inputEmail = String(email).trim();

    if (adminEmail && inputEmail.toLowerCase() === adminEmail.toLowerCase()) {
      if (!adminPassword || String(password).trim() !== adminPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const token = jwt.sign(
        { userId: 0, email: adminEmail, firstName: 'Admin', lastName: '', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: 0,
          firstName: 'Admin',
          lastName: '',
          email: adminEmail,
          role: 'admin',
          companies: [],
          activeCompany: null,
        },
      });
    }
    // ──────────────────────────────────────────────────────────────────────

    // Find user (case-insensitive email)
    const userResult = await pool.query(
      `
      SELECT id, first_name, last_name, email, password_hash, role, language_code
      FROM users
      WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
    `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const companies = await fetchUserCompanies(user.id);
    const pendingInvites = await fetchPendingInvitesForEmail(user.email);

    // Regular users need at least one company or a pending invitation they can accept after login.
    if (companies.length === 0 && pendingInvites.length === 0 && user.role !== 'admin') {
      return res.status(403).json({ error: 'User is not associated with any company' });
    }

    // Prefer a non-suspended company as active; otherwise fall back to first.
    const activeCompany =
      companies.find((c) => !c.suspendedAt) || (companies.length > 0 ? companies[0] : null);

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };

    if (activeCompany) {
      tokenPayload.activeCompanyId = activeCompany.id;
      tokenPayload.role = activeCompany.role;
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    const responseData = {
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        languageCode: user.language_code || DEFAULT_LANGUAGE_CODE,
        role: user.role,
        companies,
        pendingInvites,
      },
    };

    if (activeCompany) {
      responseData.user.activeCompany = {
        id: activeCompany.id,
        name: activeCompany.name,
        slug: activeCompany.slug,
        countryCode: activeCompany.countryCode || DEFAULT_COUNTRY_CODE,
        role: activeCompany.role,
        isOwner: activeCompany.isOwner,
        suspendedAt: activeCompany.suspendedAt || null,
      };
      responseData.user.companyId = activeCompany.id;
      responseData.user.companyName = activeCompany.name;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// ── Ensure the reset-tokens table exists (safe on every startup) ─────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('[auth] password_reset_tokens table check failed:', err.message));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const userRes = await pool.query('SELECT id, first_name, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    // Always respond with success to prevent email enumeration
    if (userRes.rows.length === 0) {
      return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const user = userRes.rows[0];

    // Invalidate any existing unused tokens for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id]);

    // Generate a secure random token
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const appBase  = process.env.APP_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${appBase}/reset-password?token=${rawToken}`;
    const fromName = process.env.FROM_NAME || 'Vevago';
    const brandGreen = '#3DD57A';
    const darkBg     = '#193434';

    await sendEmail({
      to: user.email,
      subject: 'Reset your password',
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your password</title></head>
<body style="margin:0;padding:0;background:#F4F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F4;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:${darkBg};padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${fromName}</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#6B7280;line-height:1.6;">
              Hi ${user.first_name}, we received a request to reset the password for your account.
              Click the button below — the link is valid for <strong>1 hour</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
              <tr>
                <td style="background:${brandGreen};border-radius:12px;padding:0;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0A1A0A;text-decoration:none;border-radius:12px;">
                    Reset password
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;line-height:1.6;">
              If you didn't request this, you can safely ignore this email. Your password won't change.
            </p>
            <p style="margin:0;font-size:12px;color:#D1D5DB;word-break:break-all;">
              Or copy this link: ${resetUrl}
            </p>
            ${STANDARD_FOOTER_PLACEHOLDER}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
      text: `Reset your password\n\nHi ${user.first_name},\n\nClick the link below to reset your password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    });

    console.log(`[auth] Password reset email sent to ${user.email}`);
    res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth] forgot-password error:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRes  = await pool.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const row = tokenRes.rows[0];
    if (row.used_at)              return res.status(400).json({ error: 'This reset link has already been used' });
    if (new Date() > row.expires_at) return res.status(400).json({ error: 'This reset link has expired' });

    const hashed = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, row.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

    console.log(`[auth] Password reset successful for user ${row.user_id}`);
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[auth] reset-password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
