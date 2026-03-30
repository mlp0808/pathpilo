require('dotenv').config();
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('./api-server/utils/email');

/** Wraps body HTML so the standard footer sits under the message in the white card (requires companyId on send). */
function wrapCompanyEmailHtml(innerBodyHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#eef2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8e0;overflow:hidden;">
<tr><td style="padding:0;font-size:15px;line-height:1.6;color:#1e293b;">
<div style="padding:24px 24px 0 24px;">
${innerBodyHtml}
${STANDARD_FOOTER_PLACEHOLDER}
</div>
</td></tr></table>
</body></html>`;
}

const app = express();
// Express API port (keep separate from Next.js). In dev, default is 3003.
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

function renderTemplate(text, vars) {
  if (!text) return '';
  let out = String(text);
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(key, String(val ?? ''));
  }
  return out;
}

async function buildInvoicePdfBuffer({ invoice, items, company }) {
  return await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const clientName = `${invoice.first_name || ''} ${invoice.last_name || ''}`.trim();
      const invoiceNumber = invoice.invoice_number || invoice.id;

      doc.fontSize(18).text(company?.name || 'Invoice', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#444').text(`Invoice #${invoiceNumber}`);
      doc.text(`Status: ${invoice.status}`);
      doc.text(`Issue date: ${invoice.issue_date}`);
      doc.text(`Due date: ${invoice.due_date}`);
      doc.moveDown();

      doc.fillColor('#000').fontSize(12).text('Bill to:', { continued: false });
      doc.fontSize(10).fillColor('#444').text(clientName || 'Client');
      if (invoice.billing_address || invoice.personal_address) {
        doc.text(invoice.billing_address || invoice.personal_address);
      }
      const cityLine = `${invoice.billing_zip_code || invoice.personal_zip_code || ''} ${invoice.billing_city || invoice.personal_city || ''}`.trim();
      if (cityLine) doc.text(cityLine);
      doc.moveDown();

      // Table header
      doc.fillColor('#000').fontSize(11).text('Items', { underline: true });
      doc.moveDown(0.5);

      const startY = doc.y;
      doc.fontSize(10).fillColor('#000');
      doc.text('Description', 50, startY);
      doc.text('Qty', 340, startY, { width: 40, align: 'right' });
      doc.text('Unit', 390, startY, { width: 70, align: 'right' });
      doc.text('Total', 470, startY, { width: 70, align: 'right' });
      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).strokeColor('#ddd').stroke();
      doc.moveDown(0.6);

      doc.strokeColor('#000');
      doc.fillColor('#333');
      for (const it of items) {
        const y = doc.y;
        doc.text(it.description || it.service_title || 'Item', 50, y, { width: 280 });
        doc.text(String(it.quantity || 1), 340, y, { width: 40, align: 'right' });
        doc.text(Number(it.unit_price || 0).toFixed(2), 390, y, { width: 70, align: 'right' });
        doc.text(Number(it.line_total || 0).toFixed(2), 470, y, { width: 70, align: 'right' });
        doc.moveDown(0.6);
      }

      doc.moveDown();
      doc.fillColor('#000');
      doc.text(`Subtotal: ${invoice.currency} ${Number(invoice.subtotal || 0).toFixed(2)}`, { align: 'right' });
      doc.text(`Tax (${Number(invoice.tax_rate || 0).toFixed(2)}%): ${invoice.currency} ${Number(invoice.tax_amount || 0).toFixed(2)}`, { align: 'right' });
      doc.fontSize(12).text(`Total: ${invoice.currency} ${Number(invoice.total || 0).toFixed(2)}`, { align: 'right' });

      if (invoice.notes) {
        doc.moveDown();
        doc.fontSize(10).fillColor('#000').text('Notes:', { underline: true });
        doc.fillColor('#444').text(String(invoice.notes));
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔍 DEBUG: Auth header:', authHeader);
  console.log('🔍 DEBUG: Token:', token ? 'Present' : 'Missing');

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('🔍 DEBUG: JWT verification error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    console.log('🔍 DEBUG: JWT verified user:', user);
    req.user = user;
    next();
  });
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Helper function to validate company access and get company ID
const getActiveCompanyId = async (req, res) => {
  const userId = req.user.userId;
  const activeCompanyId = req.user.activeCompanyId;

  if (!activeCompanyId) {
    return { error: 'No active company selected', status: 400 };
  }

  // Verify user has access to this company
  const accessCheck = await pool.query(`
    SELECT role FROM user_companies 
    WHERE user_id = $1 AND company_id = $2
  `, [userId, activeCompanyId]);

  if (accessCheck.rows.length === 0) {
    return { error: 'You do not have access to this company', status: 403 };
  }

  return { companyId: activeCompanyId, userRole: accessCheck.rows[0].role };
};

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_',
  user: process.env.DB_USER || 'vevago.app',
  password: process.env.DB_PASSWORD || 'E9n!GdczqusW@43i'
});

// Shared with api-server: automated job emails + footer countdown (single implementation in api-server/utils)
const { getPendingAutomationBadgesForJob, runAutomatedEmailTick } = require(path.join(
  __dirname,
  'api-server',
  'utils',
  'automatedEmails'
));

// Lightweight DB compatibility patching (non-destructive).
// This prevents runtime failures when older DBs are missing columns that the app's triggers expect.
(async () => {
  try {
    await pool.query(`
      ALTER TABLE company_invitations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
  } catch (e) {
    // If table doesn't exist (fresh DB), ignore here (setup script will create it).
    console.warn('⚠️ DB compat: could not ensure company_invitations.updated_at:', e.message);
  }

  // Subscription occurrence tracking (for materializing projected subscription jobs)
  try {
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurring_occurrence INTEGER`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_recurring_occurrence
      ON jobs(company_id, recurring_job_id, recurring_occurrence)
      WHERE recurring_job_id IS NOT NULL AND recurring_occurrence IS NOT NULL
    `);
  } catch (e) {
    console.warn('⚠️ DB compat: could not ensure jobs.recurring_occurrence:', e.message);
  }

  // Ad-hoc job tasks (custom_title) + invoice_items service_id nullable (so ad-hoc tasks can be invoiced)
  try {
    await pool.query(`ALTER TABLE job_services ADD COLUMN IF NOT EXISTS custom_title TEXT`);
  } catch (e) {
    console.warn('⚠️ DB compat: could not ensure job_services.custom_title:', e.message);
  }
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'job_services'
            AND column_name = 'service_id'
            AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE job_services ALTER COLUMN service_id DROP NOT NULL;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.warn('⚠️ DB compat: could not relax job_services.service_id:', e.message);
  }
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'invoice_items'
            AND column_name = 'service_id'
            AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE invoice_items ALTER COLUMN service_id DROP NOT NULL;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.warn('⚠️ DB compat: could not relax invoice_items.service_id:', e.message);
  }

  // Subscription recurrence patterns (recurrence_type, day_of_month, interval_value)
  try {
    await pool.query(`ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20) DEFAULT 'weekly'`);
    await pool.query(`ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS day_of_month INTEGER`);
    await pool.query(`ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS interval_value INTEGER DEFAULT 1`);
    await pool.query(`ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS paused_at DATE`);
    // Route planner geocode cache + day-view route order
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_order INTEGER`);
    // Address autocomplete: store verified coordinates on clients
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    // Update existing records to have proper recurrence_type
    await pool.query(`UPDATE recurring_jobs SET recurrence_type = 'weekly' WHERE recurrence_type IS NULL`);
    await pool.query(`UPDATE recurring_jobs SET interval_value = interval_weeks WHERE interval_value IS NULL AND interval_weeks IS NOT NULL`);
  } catch (e) {
    console.warn('⚠️ DB compat: could not ensure recurring_jobs new columns:', e.message);
  }

  // Leads tables (safe to run in prod; creates if missing)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_forms (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
        source VARCHAR(50) NOT NULL DEFAULT 'form',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        country VARCHAR(100),
        address TEXT,
        zip_code VARCHAR(20),
        city VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        message TEXT,
        preferred_date DATE,
        preferred_time TIME,
        notes TEXT,
        meta JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS country VARCHAR(100)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20)`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_company_created_at ON leads(company_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status)`);
  } catch (e) {
    console.warn('⚠️ DB compat: could not ensure leads tables:', e.message);
  }
})();

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Hello PathPilo! Server is working!' });
});

// Registration endpoint
// Supports two paths:
// 1. Normal registration: Creates user + company, user becomes owner
// 2. Invitation registration: Creates user + joins existing company with assigned role
app.post('/api/auth/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { firstName, lastName, email, password, invitationToken } = req.body;

    console.log('Registration attempt:', { firstName, lastName, email, hasInvitation: !!invitationToken });

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'User with this email already exists' });
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
      `, [invitationToken, email]);

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
        'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, role, created_at',
        [firstName, lastName, email, passwordHash, userRole]
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
        'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, role, created_at',
        [firstName, lastName, email, passwordHash, 'company-owner']
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
        'INSERT INTO companies (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id, name, slug',
        [generatedCompanyName, companySlug, user.id]
      );
      const company = companyResult.rows[0];
      companyId = company.id;
      companyName = company.name;

      // Link user to company as owner
      await client.query(
        'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
        [user.id, companyId, 'owner']
      );
    }

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

    res.status(201).json({
      message: invitationToken ? 'User registered and joined company successfully' : 'User and company created successfully',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: userRole,
        companyId: companyId,
        companyName: companyName
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

// Resolve company by slug and verify membership
app.get('/api/companies/slug/:slug', authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user.userId;

    // Allow using derived slug from name if slug column doesn't exist
    let companyResult;
    try {
      companyResult = await pool.query(
        `SELECT c.id, c.name, c.slug
         FROM companies c
         JOIN user_companies uc ON uc.company_id = c.id
         WHERE uc.user_id = $1 AND (c.slug = $2)`,
        [userId, slug]
      );
    } catch (err) {
      // Fallback: compute slug from name
      const rows = await pool.query(
        `SELECT c.id, c.name
         FROM companies c
         JOIN user_companies uc ON uc.company_id = c.id
         WHERE uc.user_id = $1`,
        [userId]
      );
      const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      const match = rows.rows.find(r => normalize(r.name) === slug);
      if (match) {
        return res.json({ company: { id: match.id, name: match.name, slug } });
      }
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    const company = companyResult.rows[0];
    res.json({ company: { id: company.id, name: company.name, slug: company.slug || slug } });
  } catch (error) {
    console.error('Error resolving company by slug:', error);
    res.status(500).json({ error: 'Failed to resolve company' });
  }
});

// Switch active company by slug or id
app.post('/api/companies/switch', authenticateToken, async (req, res) => {
  try {
    const { company_id, company_slug } = req.body || {};
    const userId = req.user.userId;

    let targetCompanyId = company_id;

    if (!targetCompanyId && company_slug) {
      try {
        const r = await pool.query('SELECT id FROM companies WHERE slug = $1', [company_slug]);
        if (r.rows.length > 0) targetCompanyId = r.rows[0].id;
      } catch (err) {
        // Fallback: derive from name
        const rows = await pool.query('SELECT id, name FROM companies');
        const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const match = rows.rows.find(r => normalize(r.name) === company_slug);
        if (match) targetCompanyId = match.id;
      }
    }

    if (!targetCompanyId) {
      return res.status(400).json({ error: 'company_id or company_slug is required' });
    }

    // Verify membership
    const membership = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, targetCompanyId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this company' });
    }

    // Get company details including slug
    const companyResult = await pool.query(
      'SELECT id, name, COALESCE(slug, LOWER(REGEXP_REPLACE(name, \'[^a-z0-9]+\', \'-\', \'g\'))) as slug FROM companies WHERE id = $1',
      [targetCompanyId]
    )
    const company = companyResult.rows[0]
    
    // Issue a new token with updated activeCompanyId
    const token = jwt.sign(
      { userId, activeCompanyId: targetCompanyId },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    // Get user role in the company
    const roleResult = await pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, targetCompanyId]
    )
    const userRole = roleResult.rows[0]?.role || 'employee'
    
    res.json({ 
      message: 'Switched active company', 
      token,
      activeCompany: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        role: userRole
      }
    });
  } catch (error) {
    console.error('Error switching company:', error);
    res.status(500).json({ error: 'Failed to switch active company' });
  }
});

// Login endpoint
// Returns user info and all companies they belong to (with roles)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', { email });

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const userResult = await pool.query(`
      SELECT id, first_name, last_name, email, password_hash, role
      FROM users
      WHERE email = $1
    `, [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get all companies user belongs to with their roles (including slug)
    const companiesResult = await pool.query(`
      SELECT 
        c.id,
        c.name,
        COALESCE(c.slug, LOWER(REGEXP_REPLACE(c.name, '[^a-z0-9]+', '-', 'g'))) as slug,
        uc.role as user_role,
        c.owner_id,
        CASE WHEN c.owner_id = $1 THEN true ELSE false END as is_owner
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      ORDER BY is_owner DESC, c.created_at ASC
    `, [user.id]);

    const companies = companiesResult.rows;
    
    // Admin users don't need company association
    // Regular users must have at least one company
    if (companies.length === 0 && user.role !== 'admin') {
      return res.status(403).json({ error: 'User is not associated with any company' });
    }

    // For admin users without companies, set activeCompany to null
    // For regular users, use first company as active (prefer owned companies)
    const activeCompany = companies.length > 0 ? companies[0] : null;

    // Generate JWT token
    // Admin users without companies won't have activeCompanyId
    const tokenPayload = {
      userId: user.id, 
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    };

    if (activeCompany) {
      tokenPayload.activeCompanyId = activeCompany.id;
      tokenPayload.role = activeCompany.user_role; // Use company role, not user role
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
        role: user.role,
        companies: companies.map(c => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          role: c.user_role,
          isOwner: c.is_owner
        }))
      }
    };

    // Only include activeCompany if user has companies
    if (activeCompany) {
      responseData.user.activeCompany = {
        id: activeCompany.id,
        name: activeCompany.name,
        slug: activeCompany.slug,
        role: activeCompany.user_role,
        isOwner: activeCompany.is_owner
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

// Create company endpoint (users can create multiple companies)
// Update company endpoint (for setup wizard)
app.put('/api/companies/:companyId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { companyId } = req.params;
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
    const userId = req.user.userId;

    // Verify user owns this company
    const companyCheck = await pool.query(
      'SELECT owner_id, slug FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Company not found' });
    }

    if (companyCheck.rows[0].owner_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the company owner can update company details' });
    }

    // Validate input
    if (!name || !country || !address || !city || !zipCode) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Company name, country, address, city, and zip code are required' });
    }

    const generateSlug = (n) => {
      return String(n || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    };

    // Ensure company has a slug (older rows / some flows might have NULL slug)
    let desiredSlug = companyCheck.rows[0].slug;
    if (!desiredSlug) {
      desiredSlug = generateSlug(name);
      let counter = 1;
      let slugCandidate = desiredSlug;
      // Ensure uniqueness
      // (exclude this companyId so updating an existing slug doesn't conflict with itself)
      let slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1 AND id <> $2', [slugCandidate, companyId]);
      while (slugCheck.rows.length > 0) {
        slugCandidate = `${desiredSlug}-${counter}`;
        slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1 AND id <> $2', [slugCandidate, companyId]);
        counter++;
      }
      desiredSlug = slugCandidate;
    }

    // Update company
    const companyResult = await client.query(
      'UPDATE companies SET name = $1, slug = $2, country = $3, cvr_number = $4, address = $5, city = $6, zip_code = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING id, name, slug, country, cvr_number, address, city, zip_code, created_at',
      [name, desiredSlug, country, cvrNumber, address, city, zipCode, companyId]
    );

    const company = companyResult.rows[0];

    await client.query('COMMIT');

    res.status(200).json({
      message: 'Company updated successfully',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        cvrNumber: company.cvr_number,
        address: company.address,
        zipCode: company.zip_code,
        city: company.city,
        country: company.country,
        createdAt: company.created_at
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Company update error:', error);
    res.status(500).json({ error: 'Company update failed: ' + error.message });
  } finally {
    client.release();
  }
});

app.post('/api/companies', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
    const userId = req.user.userId;

    console.log('Company creation attempt:', { name, country, cvrNumber, address, city, zipCode, userId });

    // Validate input
    if (!name || !country || !address || !city || !zipCode) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Company name, country, address, city, and zip code are required' });
    }

    const generateSlug = (n) => {
      return String(n || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    };
    const baseSlug = generateSlug(name);
    let companySlug = baseSlug;
    let counter = 1;
    let slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1', [companySlug]);
    while (slugCheck.rows.length > 0) {
      companySlug = `${baseSlug}-${counter}`;
      slugCheck = await client.query('SELECT id FROM companies WHERE slug = $1', [companySlug]);
      counter++;
    }

    // Create company with user as owner
    const companyResult = await client.query(
      'INSERT INTO companies (name, slug, country, cvr_number, address, city, zip_code, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, slug, country, cvr_number, address, city, zip_code, created_at',
      [name, companySlug, country, cvrNumber, address, city, zipCode, userId]
    );

    const company = companyResult.rows[0];

    // Link user to company as owner in user_companies table
    await client.query(
      'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
      [userId, company.id, 'owner']
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Company created successfully',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        cvrNumber: company.cvr_number,
        address: company.address,
        zipCode: company.zip_code,
        city: company.city,
        country: company.country,
        createdAt: company.created_at
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Company creation error:', error);
    res.status(500).json({ error: 'Company creation failed: ' + error.message });
  } finally {
    client.release();
  }
});

// ============================================
// LEADS + LEAD FORM (embeddable public form)
// ============================================

const defaultLeadFormSettings = () => ({
  version: 2,
  // Section 1: Customer details (maps to existing client fields)
  customer: {
    fields: {
      first_name: true,
      last_name: true,
      country: false,
      address: false,
      zip_code: false,
      city: false,
      email: true,
      phone: false
    },
    required: {
      email: true
    }
  },
  // Section 2: Job (service selectors + scheduling preferences)
  job: {
    includePreferredDate: false,
    includePreferredTime: false,
    // Admin can create 0..n selectors
    serviceSelectors: []
  },
  // Section 3: Custom fields (for price calculation / tagging)
  custom: {
    selectors: [],
    inputs: []
  },
  title: 'Contact us',
  subtitle: 'Send us your details and we will get back to you.',
  successMessage: 'Thanks! We received your request and will get back to you soon.'
});

// Backward compatibility: upgrade older settings (v1 fields) to v2 structure.
const normalizeLeadFormSettings = (settings) => {
  try {
    if (!settings || typeof settings !== 'object') return defaultLeadFormSettings();
    if (settings.version === 2 && settings.customer && settings.job && settings.custom) return settings;

    // v1 shape: { fields: {...}, required: {...}, title, subtitle, successMessage }
    const v1Fields = settings.fields || {};
    const v1Required = settings.required || {};

    const v2 = defaultLeadFormSettings();
    v2.title = settings.title || v2.title;
    v2.subtitle = settings.subtitle || v2.subtitle;
    v2.successMessage = settings.successMessage || v2.successMessage;

    // Map known v1 keys
    v2.customer.fields.first_name = v1Fields.first_name ?? v2.customer.fields.first_name;
    v2.customer.fields.last_name = v1Fields.last_name ?? v2.customer.fields.last_name;
    v2.customer.fields.email = v1Fields.email ?? v2.customer.fields.email;
    v2.customer.fields.phone = v1Fields.phone ?? v2.customer.fields.phone;
    v2.job.includePreferredDateTime = (v1Fields.preferred_date || v1Fields.preferred_time) ? true : v2.job.includePreferredDateTime;

    v2.customer.required.email = v1Required.email ?? v2.customer.required.email;
    // Message kept as a custom input in v2
    if (v1Fields.message) {
      v2.custom.inputs.push({ id: 'message', label: 'Message', type: 'textarea', required: false });
    }

    return v2;
  } catch {
    return defaultLeadFormSettings();
  }
};

// Get or create the active company's lead form (owner/admin/manager/employee can view)
app.get('/api/lead-form', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    let existing = await pool.query(
      `SELECT id, token, settings, created_at, updated_at
       FROM lead_forms
       WHERE company_id = $1`,
      [companyId]
    );

    if (existing.rows.length === 0) {
      const token = crypto.randomBytes(18).toString('hex');
      const settings = defaultLeadFormSettings();
      const created = await pool.query(
        `INSERT INTO lead_forms (company_id, token, settings)
         VALUES ($1, $2, $3)
         RETURNING id, token, settings, created_at, updated_at`,
        [companyId, token, settings]
      );
      existing = created;
    }

    const form = existing.rows[0];
    form.settings = normalizeLeadFormSettings(form.settings);
    res.json({ form });
  } catch (error) {
    console.error('Get lead form error:', error);
    res.status(500).json({ error: 'Failed to fetch lead form: ' + error.message });
  }
});

// Update lead form settings (owner/admin/manager)
app.put('/api/lead-form', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId, userRole } = companyAccess;

    if (!['owner', 'admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { settings } = req.body || {};
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings is required' });
    }

    // Ensure record exists
    const ensure = await pool.query(`SELECT id FROM lead_forms WHERE company_id = $1`, [companyId]);
    if (ensure.rows.length === 0) {
      const token = crypto.randomBytes(18).toString('hex');
      await pool.query(`INSERT INTO lead_forms (company_id, token, settings) VALUES ($1, $2, $3)`, [companyId, token, defaultLeadFormSettings()]);
    }

    const updated = await pool.query(
      `UPDATE lead_forms
       SET settings = $2, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = $1
       RETURNING id, token, settings, created_at, updated_at`,
      [companyId, normalizeLeadFormSettings(settings)]
    );

    res.json({ form: updated.rows[0] });
  } catch (error) {
    console.error('Update lead form error:', error);
    res.status(500).json({ error: 'Failed to update lead form: ' + error.message });
  }
});

// List leads for active company
app.get('/api/leads', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { status } = req.query;
    const params = [companyId];
    let where = 'WHERE company_id = $1';
    if (status && ['new', 'contacted', 'won', 'lost'].includes(String(status))) {
      params.push(String(status));
      where += ` AND status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT *
       FROM leads
       ${where}
       ORDER BY created_at DESC
       LIMIT 500`,
      params
    );

    res.json({ leads: result.rows });
  } catch (error) {
    console.error('List leads error:', error);
    res.status(500).json({ error: 'Failed to fetch leads: ' + error.message });
  }
});

// Update a lead (status/notes)
app.put('/api/leads/:leadId', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const leadId = parseInt(req.params.leadId, 10);
    if (!leadId) return res.status(400).json({ error: 'Invalid lead id' });

    const {
      status,
      notes,
      first_name,
      last_name,
      country,
      address,
      zip_code,
      city,
      email,
      phone
    } = req.body || {};

    if (status && !['new', 'contacted', 'won', 'lost'].includes(String(status))) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await pool.query(
      `UPDATE leads
       SET status = COALESCE($3, status),
           notes = COALESCE($4, notes),
           first_name = COALESCE($5, first_name),
           last_name = COALESCE($6, last_name),
           country = COALESCE($7, country),
           address = COALESCE($8, address),
           zip_code = COALESCE($9, zip_code),
           city = COALESCE($10, city),
           email = COALESCE($11, email),
           phone = COALESCE($12, phone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [
        leadId,
        companyId,
        status ?? null,
        notes ?? null,
        first_name ?? null,
        last_name ?? null,
        country ?? null,
        address ?? null,
        zip_code ?? null,
        city ?? null,
        email ?? null,
        phone ?? null
      ]
    );

    if (updated.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ lead: updated.rows[0] });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Failed to update lead: ' + error.message });
  }
});

// Public: get lead form settings by token (used by iframe page)
app.get('/api/public/lead-forms/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query(
      `SELECT lf.token, lf.settings, c.name as company_name
       FROM lead_forms lf
       JOIN companies c ON lf.company_id = c.id
       WHERE lf.token = $1`,
      [token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Form not found' });
    const form = result.rows[0];
    form.settings = normalizeLeadFormSettings(form.settings);
    res.json({ form });
  } catch (error) {
    console.error('Public get lead form error:', error);
    res.status(500).json({ error: 'Failed to fetch form: ' + error.message });
  }
});

// Public: submit a lead by token
app.post('/api/public/lead-forms/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const formRes = await pool.query(`SELECT company_id, settings FROM lead_forms WHERE token = $1`, [token]);
    if (formRes.rows.length === 0) return res.status(404).json({ error: 'Form not found' });

    const { company_id: companyId, settings } = formRes.rows[0];
    const body = req.body || {};

    // Simple honeypot to reduce spam
    if (body.website && String(body.website).trim() !== '') {
      return res.json({ ok: true });
    }

    const s = normalizeLeadFormSettings(settings);
    const required = (s?.customer?.required && typeof s.customer.required === 'object') ? s.customer.required : { email: true };

    const firstName = body.first_name ? String(body.first_name).trim() : null;
    const lastName = body.last_name ? String(body.last_name).trim() : null;
    const country = body.country ? String(body.country).trim() : null;
    const address = body.address ? String(body.address).trim() : null;
    const zipCode = body.zip_code ? String(body.zip_code).trim() : null;
    const city = body.city ? String(body.city).trim() : null;
    const email = body.email ? String(body.email).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;

    const preferredDate = body.preferred_date ? String(body.preferred_date).trim() : null; // YYYY-MM-DD
    const preferredTime = body.preferred_time ? String(body.preferred_time).trim() : null; // HH:MM

    // custom inputs/selectors + service selections are stored in meta for now
    const metaFromBody = body.meta && typeof body.meta === 'object' ? body.meta : null;
    const message = body.message ? String(body.message).trim() : null; // optional legacy direct message field

    if (required.email && (!email || !email.includes('@'))) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const created = await pool.query(
      `INSERT INTO leads (
        company_id, status, source,
        first_name, last_name, country, address, zip_code, city,
        email, phone,
        message,
        preferred_date, preferred_time,
        meta
      )
      VALUES (
        $1, 'new', 'form',
        $2, $3, $4, $5, $6, $7,
        $8, $9,
        $10,
        $11::date, $12::time,
        $13
      )
      RETURNING id`,
      [
        companyId,
        firstName,
        lastName,
        country,
        address,
        zipCode,
        city,
        email,
        phone,
        message,
        preferredDate,
        preferredTime,
        {
          token,
          userAgent: req.headers['user-agent'] || null,
          ip: req.headers['x-forwarded-for'] || req.ip || null,
          meta: metaFromBody
        }
      ]
    );

    // Send CC email notification if configured
    if (s?.ccEmail && typeof s.ccEmail === 'string' && s.ccEmail.trim()) {
      try {
        const ccEmail = s.ccEmail.trim();
        if (ccEmail.includes('@')) {
          // Send notification email
          await sendEmail({
            from: process.env.EMAIL_FROM || 'no-reply@vevago.com',
            to: ccEmail,
            subject: 'New Lead Form Submission',
            companyId,
            html: wrapCompanyEmailHtml(`
              <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">New lead received</h2>
              <p style="margin:0 0 12px;color:#475569;">A new lead has been submitted through your form:</p>
              <ul style="margin:0;padding-left:20px;color:#334155;">
                ${firstName ? `<li><strong>Name:</strong> ${firstName} ${lastName || ''}</li>` : ''}
                ${email ? `<li><strong>Email:</strong> ${email}</li>` : ''}
                ${phone ? `<li><strong>Phone:</strong> ${phone}</li>` : ''}
                ${country ? `<li><strong>Country:</strong> ${country}</li>` : ''}
                ${address ? `<li><strong>Address:</strong> ${address}</li>` : ''}
                ${zipCode ? `<li><strong>Zip Code:</strong> ${zipCode}</li>` : ''}
                ${city ? `<li><strong>City:</strong> ${city}</li>` : ''}
                ${preferredDate ? `<li><strong>Preferred Date:</strong> ${preferredDate}</li>` : ''}
                ${preferredTime ? `<li><strong>Preferred Time:</strong> ${preferredTime}</li>` : ''}
                ${message ? `<li><strong>Message:</strong> ${message}</li>` : ''}
              </ul>
              <p style="margin:8px 0 0;"><strong>Lead ID:</strong> ${created.rows[0].id}</p>
            `),
          });
        }
      } catch (emailError) {
        console.error('Failed to send CC notification email:', emailError);
        // Don't fail the submission if email fails
      }
    }

    res.json({ ok: true, leadId: created.rows[0].id });
  } catch (error) {
    console.error('Public submit lead error:', error);
    res.status(500).json({ error: 'Failed to submit lead: ' + error.message });
  }
});

// Test email endpoint (development only)
app.post('/api/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Email "to" address required' });
    }

    await sendEmail({
      to,
      from: 'Vevago <onboarding@resend.dev>',
      subject: 'PathPilo Email Test',
      html: `
        <h2>🧪 Email Test Successful!</h2>
        <p>This is a test email from your PathPilo system using Resend.</p>
        <p>If you received this, your email configuration is working perfectly!</p>
        <p><strong>Time sent:</strong> ${new Date().toLocaleString()}</p>
      `
    });

    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ error: 'Test email failed', details: error.message });
  }
});

// Get all users (admin endpoint - protected)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get all users
    const usersResult = await pool.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.role,
        u.created_at
      FROM users u
      ORDER BY u.created_at DESC
    `);

    // Get all companies for each user
    const users = await Promise.all(usersResult.rows.map(async (user) => {
      const companiesResult = await pool.query(`
        SELECT 
          c.id,
          c.name,
          uc.role as company_role
        FROM user_companies uc
        JOIN companies c ON uc.company_id = c.id
        WHERE uc.user_id = $1
        ORDER BY uc.role = 'owner' DESC, uc.created_at ASC
      `, [user.id]);

      return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        companies: companiesResult.rows.map(c => ({
          id: c.id,
          name: c.name,
          role: c.company_role
        })),
        createdAt: user.created_at
      };
    }));

    res.json({ users });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users: ' + error.message });
  }
});

// ============================================
// COMPANY INVITATION ENDPOINTS
// ============================================

// Invite user to company (owner/admin only)
app.post('/api/companies/:companyId/invite', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { email, role = 'employee' } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!['admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, manager, or employee' });
    }

    // Check if user has permission (owner or admin of company)
    const permissionCheck = await pool.query(`
      SELECT uc.role, c.owner_id
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2
    `, [userId, companyId]);

    if (permissionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this company' });
    }

    const userRole = permissionCheck.rows[0].role;
    const isOwner = permissionCheck.rows[0].owner_id === userId;

    if (!isOwner && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can invite users' });
    }

    // Check if user already exists and is already in company
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      const alreadyInCompany = await pool.query(
        'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [existingUser.rows[0].id, companyId]
      );
      if (alreadyInCompany.rows.length > 0) {
        return res.status(400).json({ error: 'User is already a member of this company' });
      }
    }

    // Check for existing pending invitation
    const existingInvite = await pool.query(`
      SELECT id FROM company_invitations 
      WHERE company_id = $1 AND email = $2 AND status = 'pending'
    `, [companyId, email]);

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'An invitation has already been sent to this email' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invitation
    const inviteResult = await pool.query(`
      INSERT INTO company_invitations (company_id, invited_by_user_id, email, role, token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, token, expires_at
    `, [companyId, userId, email, role, token, expiresAt]);

    const invitation = inviteResult.rows[0];

    // TODO: Send email with invitation link
    // For now, return the token (in production, send via email)
    // Use frontend URL from environment or construct from request
    let frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      const host = req.get('host') || 'localhost:3003';
      if (host.includes(':3003')) {
        // Backend is on 3003, frontend is typically on 3000, 3001, or 3002
        // Try to detect from environment or default to 3000
        const frontendPort = process.env.FRONTEND_PORT || '3000';
        frontendUrl = `${req.protocol}://${host.split(':')[0]}:${frontendPort}`;
      } else {
        // Production or already correct host
        frontendUrl = `${req.protocol}://${host}`;
      }
    }
    const invitationUrl = `${frontendUrl}/invite/${token}`;

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email: email,
        role: role,
        expiresAt: invitation.expires_at,
        invitationUrl: invitationUrl // Remove in production, send via email instead
      }
    });

  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to send invitation: ' + error.message });
  }
});

// Get pending invitations for a company
app.get('/api/companies/:companyId/invitations', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const userId = req.user.userId;

    // Verify user has access to this company
    const accessCheck = await pool.query(`
      SELECT role FROM user_companies 
      WHERE user_id = $1 AND company_id = $2
    `, [userId, companyId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this company' });
    }

    // Get all pending invitations for this company
    const result = await pool.query(`
      SELECT 
        ci.id,
        ci.email,
        ci.role,
        ci.token,
        ci.status,
        ci.expires_at,
        ci.created_at,
        u.first_name || ' ' || u.last_name as invited_by_name
      FROM company_invitations ci
      JOIN users u ON ci.invited_by_user_id = u.id
      WHERE ci.company_id = $1 AND ci.status = 'pending' AND ci.expires_at > NOW()
      ORDER BY ci.created_at DESC
    `, [companyId]);

    const invitations = result.rows.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invitationUrl: (() => {
        let frontendUrl = process.env.FRONTEND_URL;
        if (!frontendUrl) {
          const host = req.get('host') || 'localhost:3003';
          if (host.includes(':3003')) {
            const frontendPort = process.env.FRONTEND_PORT || '3000';
            frontendUrl = `${req.protocol}://${host.split(':')[0]}:${frontendPort}`;
          } else {
            frontendUrl = `${req.protocol}://${host}`;
          }
        }
        return `${frontendUrl}/invite/${inv.token}`;
      })(),
      expiresAt: inv.expires_at,
      invitedByName: inv.invited_by_name
    }));

    res.json({ invitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to get invitations: ' + error.message });
  }
});

// Get invitation details (public endpoint for registration page)
app.get('/api/invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT 
        ci.*,
        c.name as company_name,
        u.first_name || ' ' || u.last_name as invited_by_name
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      JOIN users u ON ci.invited_by_user_id = u.id
      WHERE ci.token = $1 AND ci.status = 'pending'
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or already used' });
    }

    const invitation = result.rows[0];

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    // Check if email already exists as a user
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [invitation.email]
    );

    res.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        companyName: invitation.company_name,
        invitedByName: invitation.invited_by_name,
        expiresAt: invitation.expires_at,
        userExists: userExists.rows.length > 0
      }
    });

  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({ error: 'Failed to get invitation: ' + error.message });
  }
});

// Accept invitation (for logged-in users)
app.post('/api/invitations/:token/accept', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { token } = req.params;
    const userId = req.user.userId;

    // Find and validate invitation
    const inviteResult = await client.query(`
      SELECT ci.*, c.name as company_name
      FROM company_invitations ci
      JOIN companies c ON ci.company_id = c.id
      WHERE ci.token = $1 
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
    `, [token]);

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    // Check if user email matches invitation email
    const userResult = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].email.toLowerCase() !== invitation.email.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    // Check if user is already in this company
    const existingMembership = await client.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, invitation.company_id]
    );

    if (existingMembership.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You are already a member of this company' });
    }

    // Link user to company with assigned role
    await client.query(
      'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
      [userId, invitation.company_id, invitation.role]
    );

    // Mark invitation as accepted
    await client.query(
      'UPDATE company_invitations SET status = $1, accepted_at = NOW() WHERE id = $2',
      ['accepted', invitation.id]
    );

    await client.query('COMMIT');

    // Get updated company list
    const companiesResult = await client.query(`
      SELECT 
        c.id,
        c.name,
        uc.role as user_role,
        c.owner_id,
        CASE WHEN c.owner_id = $1 THEN true ELSE false END as is_owner
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      ORDER BY is_owner DESC, c.created_at ASC
    `, [userId]);

    const companies = companiesResult.rows;
    const activeCompany = companies.find(c => c.id === invitation.company_id) || companies[0];

    // Generate new JWT with updated active company
    const newToken = jwt.sign(
      { 
        userId: userId, 
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        activeCompanyId: activeCompany.id,
        role: activeCompany.user_role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Invitation accepted successfully',
      token: newToken,
      user: {
        id: userId,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        activeCompany: {
          id: activeCompany.id,
          name: activeCompany.name,
          role: activeCompany.user_role,
          isOwner: activeCompany.is_owner
        },
        companies: companies.map(c => ({
          id: c.id,
          name: c.name,
          role: c.user_role,
          isOwner: c.is_owner
        }))
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation: ' + error.message });
  } finally {
    client.release();
  }
});

// Switch active company
app.post('/api/companies/:companyId/switch', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const userId = req.user.userId;

    // Verify user belongs to this company
    const membershipCheck = await pool.query(`
      SELECT uc.role, c.name, c.owner_id
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND uc.company_id = $2
    `, [userId, companyId]);

    if (membershipCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this company' });
    }

    const membership = membershipCheck.rows[0];
    const isOwner = membership.owner_id === userId;

    // Generate new JWT with updated active company
    const token = jwt.sign(
      { 
        userId: userId, 
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        activeCompanyId: parseInt(companyId),
        role: membership.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Company switched successfully',
      token,
      activeCompany: {
        id: parseInt(companyId),
        name: membership.name,
        role: membership.role,
        isOwner: isOwner
      }
    });

  } catch (error) {
    console.error('Switch company error:', error);
    res.status(500).json({ error: 'Failed to switch company: ' + error.message });
  }
});

// Get all companies (admin endpoint - protected)
app.get('/api/admin/companies', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, 
        c.name, 
        c.cvr_number,
        c.address,
        c.zip_code,
        c.city,
        c.created_at,
        u.first_name as owner_first_name,
        u.last_name as owner_last_name,
        u.email as owner_email
      FROM companies c
      LEFT JOIN users u ON c.owner_id = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({
      companies: result.rows.map(company => ({
        id: company.id,
        name: company.name,
        cvrNumber: company.cvr_number,
        address: company.address,
        zipCode: company.zip_code,
        city: company.city,
        createdAt: company.created_at,
        owner: {
          firstName: company.owner_first_name,
          lastName: company.owner_last_name,
          email: company.owner_email
        }
      }))
    });

  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ error: 'Failed to fetch companies: ' + error.message });
  }
});

// Create service endpoint
app.post('/api/services', authenticateToken, async (req, res) => {
  try {
    const { title, price, duration_minutes } = req.body;
    const userId = req.user.userId;

    console.log('Service creation attempt:', { title, price, duration_minutes, userId });

    // Validate input
    if (!title || !price || !duration_minutes) {
      return res.status(400).json({ error: 'Title, price, and duration are required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Create service
    const result = await pool.query(
      'INSERT INTO services (company_id, title, price, duration_minutes) VALUES ($1, $2, $3, $4) RETURNING *',
      [companyId, title, parseFloat(price), parseInt(duration_minutes)]
    );

    const service = result.rows[0];

    res.status(201).json({
      message: 'Service created successfully',
      service
    });
  } catch (error) {
    console.error('Service creation error:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service endpoint
app.put('/api/services/:serviceId', authenticateToken, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { title, price, duration_minutes } = req.body;
    const userId = req.user.userId;

    console.log('Service update attempt:', { serviceId, title, price, duration_minutes, userId });

    // Validate input
    if (!title || !price || !duration_minutes) {
      return res.status(400).json({ error: 'Title, price, and duration are required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Check if service exists and belongs to user's company
    const serviceCheck = await pool.query(
      'SELECT id FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    // Update service
    const result = await pool.query(
      'UPDATE services SET title = $1, price = $2, duration_minutes = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND company_id = $5 RETURNING *',
      [title, parseFloat(price), parseInt(duration_minutes), serviceId, companyId]
    );

    const service = result.rows[0];

    res.json({
      message: 'Service updated successfully',
      service
    });
  } catch (error) {
    console.error('Service update error:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service endpoint
app.delete('/api/services/:serviceId', authenticateToken, async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.userId;

    console.log('Service deletion attempt:', { serviceId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Check if service exists and belongs to user's company
    const serviceCheck = await pool.query(
      'SELECT id FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId]
    );

    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found or access denied' });
    }

    // Delete service
    await pool.query(
      'DELETE FROM services WHERE id = $1 AND company_id = $2',
      [serviceId, companyId]
    );

    res.json({
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Service deletion error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Create job endpoint
app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
      const { title, client_id, assigned_user_id, services, note, scheduled_date, scheduled_time_from, scheduled_time_to } = req.body;
    const userId = req.user.userId;

    console.log('🔧 BACKEND JOB CREATION DEBUG:', { 
      title, 
      client_id, 
      assigned_user_id, 
      services, 
      note, 
      scheduled_date, 
      scheduled_time_from,
      scheduled_time_to,
      userId,
      scheduledDateType: typeof scheduled_date,
      scheduledDateValue: scheduled_date,
      scheduledTimeFromType: typeof scheduled_time_from,
      scheduledTimeFromValue: scheduled_time_from,
      scheduledTimeToType: typeof scheduled_time_to,
      scheduledTimeToValue: scheduled_time_to
    });

    // Validate input
    if (!client_id || !assigned_user_id || !services || !Array.isArray(services) || !scheduled_date) {
      return res.status(400).json({ error: 'Client, assigned user, services, and scheduled date are required' });
    }
    
    // For re-do jobs, we allow empty services array
    if (services.length === 0) {
      console.log('Creating re-do job with no services - will copy from original job later');
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [client_id, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Verify assigned user belongs to user's company
    // Check if assigned user belongs to the company (using user_companies table)
    const assignedUserCheck = await pool.query(
      'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [assigned_user_id, companyId]
    );

    if (assignedUserCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Assigned user not found or access denied' });
    }

    // Ensure schema supports ad-hoc tasks (run outside transaction to avoid abort-on-error state)
    try {
      await pool.query('ALTER TABLE job_services ADD COLUMN IF NOT EXISTS custom_title TEXT');
    } catch (_) {}
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'job_services'
              AND column_name = 'service_id'
              AND is_nullable = 'NO'
          ) THEN
            ALTER TABLE job_services ALTER COLUMN service_id DROP NOT NULL;
          END IF;
        END
        $$;
      `);
    } catch (_) {}

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Create the job
      console.log('💾 DATABASE INSERT DEBUG:', {
        scheduled_date_for_db: scheduled_date,
        scheduled_date_type: typeof scheduled_date,
        insertValues: [companyId, client_id, assigned_user_id, title || '', note, scheduled_date]
      });
      
      const jobResult = await dbClient.query(
        'INSERT INTO jobs (company_id, client_id, assigned_user_id, title, note, scheduled_date, scheduled_time_from, scheduled_time_to, recurring_job_id, is_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [companyId, client_id, assigned_user_id, title || '', note, scheduled_date, scheduled_time_from, scheduled_time_to, null, false]
      );
      
      console.log('✅ JOB CREATED IN DATABASE:', {
        createdJob: jobResult.rows[0],
        scheduled_date_in_db: jobResult.rows[0].scheduled_date,
        jobId: jobResult.rows[0].id
      });
      
      if (!jobResult.rows[0]) {
        throw new Error('Job insertion failed - no job returned');
      }

      const job = jobResult.rows[0];

      // Create initial log entry for job creation
      const formattedDate = new Date(scheduled_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      // Insert log entry with note if provided
      try {
        await dbClient.query(
          'INSERT INTO job_logs (job_id, user_id, action, description, note_content) VALUES ($1, $2, $3, $4, $5)',
          [job.id, userId, 'created', `Job created for ${formattedDate}`, note || null]
        );
      } catch (logError) {
        // If note_content column doesn't exist, try without it
        if (logError.code === '42703' || (logError.message && logError.message.includes('note_content'))) {
          await dbClient.query(
            'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
            [job.id, userId, 'created', `Job created for ${formattedDate}`]
          );
        } else {
          throw logError;
        }
      }

      // Add services to job (support both catalog services and ad-hoc custom tasks)
      for (const serviceData of services) {
        const { service_id, custom_price, custom_duration, custom_title } = serviceData;
        
        // If this is a custom ad-hoc task (no service_id), allow it
        if (!service_id || service_id === null) {
          try {
            await dbClient.query(
              'INSERT INTO job_services (job_id, service_id, custom_title, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4, $5)',
              [job.id, null, custom_title || 'Custom task', custom_price ?? null, custom_duration ?? null]
            );
          } catch (e) {
            // On-the-fly compatibility: add column and relax NOT NULL if needed
            if (String(e.message).includes('column "custom_title"') || String(e.message).includes('does not exist')) {
              // Ensure schema supports ad-hoc tasks
              try {
                await dbClient.query('ALTER TABLE job_services ADD COLUMN IF NOT EXISTS custom_title TEXT');
              } catch (_) {}
              try {
                await dbClient.query('ALTER TABLE job_services ALTER COLUMN service_id DROP NOT NULL');
              } catch (_) {}
              // Retry insert
              await dbClient.query(
                'INSERT INTO job_services (job_id, service_id, custom_title, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4, $5)',
                [job.id, null, custom_title || 'Custom task', custom_price ?? null, custom_duration ?? null]
              );
            } else {
              throw e;
            }
          }
          continue;
        }
        
        // Otherwise, require a valid catalog service
        const serviceCheck = await dbClient.query(
          'SELECT id FROM services WHERE id = $1 AND company_id = $2',
          [service_id, companyId]
        );
        if (serviceCheck.rows.length === 0) {
          throw new Error(`Service ${service_id} not found or access denied`);
        }
        await dbClient.query(
          'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4)',
          [job.id, service_id, custom_price, custom_duration]
        );
      }

      await dbClient.query('COMMIT');

      res.status(201).json({
        message: 'Job created successfully',
        job
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('❌ JOB CREATION ERROR:', error);
    console.error('❌ ERROR DETAILS:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to create job',
      details: error.message,
      code: error.code
    });
  }
});

// Create client endpoint
app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const {
      client_type,
      name,
      last_name,
      company_number,
      contact_name,
      country,
      address,
      zip_code,
      city,
      email,
      phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone
    } = req.body;
    const userId = req.user.userId;

    console.log('Client creation attempt:', {
      client_type,
      name,
      last_name,
      company_number,
      contact_name,
      country,
      address,
      zip_code,
      city,
      email,
      phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone,
      userId
    });

    // Validate input - name is always required
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Create client
    const result = await pool.query(
      `INSERT INTO clients (
        company_id, client_type, name, last_name, company_number, contact_name,
        country, address, zip_code, city, email, phone,
        billing_address, billing_zip_code, billing_city, billing_email, billing_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        companyId, client_type, name, last_name, company_number, contact_name,
        country, address, zip_code, city, email, phone,
        billing_address, billing_zip_code, billing_city, billing_email, billing_phone
      ]
    );

    const client = result.rows[0];

    res.status(201).json({
      message: 'Client created successfully',
      client
    });
  } catch (error) {
    console.error('Client creation error:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client endpoint
app.put('/api/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const {
      client_type,
      name,
      last_name,
      company_number,
      contact_name,
      country,
      address,
      zip_code,
      city,
      email,
      phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone
    } = req.body;
    const userId = req.user.userId;

    console.log('Client update attempt:', {
      clientId,
      client_type,
      name,
      last_name,
      company_number,
      contact_name,
      country,
      address,
      zip_code,
      city,
      email,
      phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone,
      userId
    });

    // Validate input - name is always required
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Check if client exists and belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Update client
    const result = await pool.query(
      `UPDATE clients SET
        client_type = $1, name = $2, last_name = $3, company_number = $4, contact_name = $5,
        country = $6, address = $7, zip_code = $8, city = $9, email = $10, phone = $11,
        billing_address = $12, billing_zip_code = $13, billing_city = $14, billing_email = $15, billing_phone = $16,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17 AND company_id = $18 RETURNING *`,
      [
        client_type, name, last_name, company_number, contact_name,
        country, address, zip_code, city, email, phone,
        billing_address, billing_zip_code, billing_city, billing_email, billing_phone,
        clientId, companyId
      ]
    );

    const client = result.rows[0];

    res.json({
      message: 'Client updated successfully',
      client
    });
  } catch (error) {
    console.error('Client update error:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete (anonymize) client - GDPR compliant soft delete
app.delete('/api/clients/:clientId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    console.log('Client deletion attempt:', { clientId, userId });

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      client.release();
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Ensure client exists and belongs to this company
    const clientRes = await client.query(
      'SELECT id, first_name, last_name FROM clients WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [clientId, companyId]
    );

    if (clientRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    const originalClient = clientRes.rows[0];

    try {
      await client.query('BEGIN');

      // Delete all subscriptions for this client (recurring jobs)
      await client.query('DELETE FROM recurring_jobs WHERE client_id = $1 AND company_id = $2', [clientId, companyId]);

      // Delete ALL jobs for this client
      await client.query('DELETE FROM jobs WHERE client_id = $1 AND company_id = $2', [clientId, companyId]);

      // Anonymize personal data while preserving business relationships
      await client.query(`
        UPDATE clients SET
          deleted_at = CURRENT_TIMESTAMP,
          first_name = 'Deleted Client',
          last_name = '#' || $1::text,
          country = NULL,
          personal_address = NULL,
          personal_zip_code = NULL,
          personal_city = NULL,
          personal_email = NULL,
          personal_phone = NULL,
          billing_address = NULL,
          billing_zip_code = NULL,
          billing_city = NULL,
          billing_email = NULL,
          billing_phone = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2
      `, [clientId, companyId]);

      // Log the deletion for audit purposes
      console.log(`Client ${clientId} (${originalClient.first_name} ${originalClient.last_name}) anonymized for GDPR compliance`);

      await client.query('COMMIT');

      res.json({
        message: 'Client anonymized successfully. All jobs and subscriptions deleted. Invoices preserved.',
        deletedClientId: parseInt(clientId, 10),
        anonymizedName: `Deleted Client #${clientId}`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error anonymizing client:', err);
      res.status(500).json({ error: 'Failed to anonymize client data', details: err.message });
    }
  } catch (error) {
    console.error('Error in client deletion (outer):', error);
    res.status(500).json({ error: 'Failed to process client deletion', details: error.message });
  } finally {
    client.release();
  }
});

// Get jobs for a specific client
app.get('/api/clients/:clientId/jobs', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching jobs for client:', { clientId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Get jobs for the client with services and client information
    const jobsResult = await pool.query(
      `SELECT
        j.*,
        c.name,
        c.last_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address,
        c.zip_code,
        c.city,
        COUNT(js.id) as service_count,
        COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_price,
        COALESCE(SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes)), 0) as total_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE j.client_id = $1 AND j.company_id = $2
      GROUP BY j.id, c.name, c.last_name, c.email, c.phone, c.address, c.zip_code, c.city
      ORDER BY j.scheduled_date DESC, j.created_at DESC`,
      [clientId, companyId]
    );

    // Get services for each job
    const jobsWithServices = await Promise.all(
      jobsResult.rows.map(async (job) => {
        const servicesResult = await pool.query(
          `SELECT 
            js.*,
            COALESCE(s.title, js.custom_title) as title,
            s.title as service_title,
            s.price,
            s.duration_minutes
          FROM job_services js
          LEFT JOIN services s ON js.service_id = s.id
          WHERE js.job_id = $1
          ORDER BY js.created_at ASC`,
          [job.id]
        );

        // Get assigned user information
        const userResult = await pool.query(
          `SELECT first_name, last_name FROM users WHERE id = $1`,
          [job.assigned_user_id]
        );

        console.log('👤 USER DEBUG:', {
          jobId: job.id,
          assignedUserId: job.assigned_user_id,
          userQueryResult: userResult.rows,
          userFirstName: userResult.rows[0]?.first_name,
          userLastName: userResult.rows[0]?.last_name
        });

        return {
          ...job,
          services: servicesResult.rows,
          assigned_user_first_name: userResult.rows[0]?.first_name || 'Unknown',
          assigned_user_last_name: userResult.rows[0]?.last_name || 'User'
        };
      })
    );

    res.json({
      jobs: jobsWithServices
    });
  } catch (error) {
    console.error('Error fetching client jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Debug endpoint to see raw database data
app.get('/api/debug/jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    // Get all jobs with raw data
    const jobsResult = await pool.query(
      'SELECT id, title, scheduled_date, status, created_at FROM jobs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10',
      [companyId]
    );
    
    res.json({
      message: 'Raw database data',
      jobs: jobsResult.rows,
      debugInfo: {
        totalJobs: jobsResult.rows.length,
        sampleJob: jobsResult.rows[0] || 'No jobs found'
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch debug data' });
  }
});

// Get all jobs for a company within a date range (including projected jobs from subscriptions)
app.get('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const userId = req.user.userId

    console.log('Fetching jobs for company:', { start_date, end_date, userId })

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Get all jobs including cancelled
    let query = `
      SELECT
        j.*,
        c.name,
        c.last_name,
        c.email as client_email,
        c.billing_email as client_billing_email,
        c.personal_email as client_personal_email,
        c.phone as client_phone,
        c.address,
        c.zip_code,
        c.city,
        COUNT(js.id) as service_count,
        COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_price,
        COALESCE(SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes)), 0) as total_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE j.company_id = $1
    `
    
    const params = [companyId]
    
    if (start_date && end_date) {
      query += ' AND j.scheduled_date >= $2 AND j.scheduled_date <= $3'
      params.push(start_date, end_date)
    }
    
    query += `
      GROUP BY j.id, c.name, c.last_name, c.email, c.billing_email, c.personal_email, c.phone, c.address, c.zip_code, c.city
      ORDER BY j.scheduled_date ASC, j.created_at ASC
    `

    const realJobsResult = await pool.query(query, params)
    const realJobs = realJobsResult.rows
    
    // Debug: Log cancelled jobs count
    const cancelledCount = realJobs.filter(j => j.status === 'cancelled').length
    if (cancelledCount > 0) {
      console.log(`📋 Found ${cancelledCount} cancelled job(s) in query results`)
    }

    // Get projected jobs from active subscriptions if date range is provided
    // NOTE: Some lightweight/demo DB setups may not include recurring_jobs tables.
    // In that case, we gracefully skip projected jobs instead of failing the whole jobs page.
    let projectedJobs = []
    if (start_date && end_date) {
      let subscriptions = []
      try {
        // Get all active subscriptions for the company
        const subscriptionsResult = await pool.query(
          `SELECT
            rj.*,
            c.name,
            c.last_name,
            c.address,
            c.zip_code,
            c.city
          FROM recurring_jobs rj
          LEFT JOIN clients c ON rj.client_id = c.id
          WHERE rj.company_id = $1 AND rj.is_active = true`,
          [companyId]
        )

        subscriptions = subscriptionsResult.rows
      } catch (err) {
        // 42P01 = undefined_table
        if (err && (err.code === '42P01' || String(err.message || '').includes('recurring_jobs') || String(err.message || '').includes('does not exist'))) {
          console.log('⚠️ Skipping projected jobs: recurring_jobs table not present in this DB setup.');
          subscriptions = []
        } else {
          throw err
        }
      }
      // Helper function to format date as YYYY-MM-DD string without timezone conversion
      const formatDateString = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      
      // Parse date strings directly (they're already in YYYY-MM-DD format)
      const startDateStr = start_date
      const endDateStr = end_date
      
      // Calculate the first occurrence after starting_date
      // Note: startingDateStr should already be a YYYY-MM-DD string (converted before calling this)
      const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
        // Ensure we have a valid date string
        if (!startingDateStr) {
          throw new Error(`Invalid starting date: ${startingDateStr}`)
        }
        
        // Ensure it's a string (should already be converted, but double-check)
        let dateStr = startingDateStr
        if (startingDateStr instanceof Date) {
          dateStr = formatDateString(startingDateStr)
        } else if (typeof startingDateStr !== 'string') {
          throw new Error(`Invalid starting date type: ${typeof startingDateStr}, value: ${startingDateStr}`)
        } else if (startingDateStr.includes('T')) {
          // If it includes time, extract just the date part
          dateStr = startingDateStr.split('T')[0]
        }
        
        // Parse the date string as local date (YYYY-MM-DD)
        const dateParts = dateStr.split('-')
        if (dateParts.length !== 3) {
          throw new Error(`Invalid date format: ${dateStr}`)
        }
        
        const [year, month, day] = dateParts.map(Number)
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
          throw new Error(`Invalid date values: ${dateStr}`)
        }
        
        const startDate = new Date(year, month - 1, day)
        const startDay = startDate.getDay()
        
        let daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7
        
        if (daysUntilTargetDay === 0) {
          return formatDateString(startDate)
        } else {
          const firstOccurrence = new Date(startDate)
          firstOccurrence.setDate(startDate.getDate() + daysUntilTargetDay)
          return formatDateString(firstOccurrence)
        }
      }

      // For each subscription, generate projected jobs for the date range
      // We track occurrences so a moved/completed materialized occurrence does not reappear as a ghost.
      const occurrencePairs = [] // [{ subId:number, occ:number, dateStr:string, subscription:any, services:any[], totals:{price,duration} }]
      for (const subscription of subscriptions) {
        try {
          // Get services for this subscription
          const servicesResult = await pool.query(
            `SELECT 
              rjs.*,
              s.title
            FROM recurring_job_services rjs
            JOIN services s ON rjs.service_id = s.id
            WHERE rjs.recurring_job_id = $1`,
            [subscription.id]
          )

          const subscriptionServices = servicesResult.rows

          // Calculate total price and duration
          const totalPrice = subscriptionServices.reduce((sum, s) => sum + parseFloat(s.custom_price || 0), 0)
          const totalDuration = subscriptionServices.reduce((sum, s) => sum + parseInt(s.custom_duration_minutes || 0), 0)

          // Use starting_date as the minimum date for generating jobs
          let subscriptionStartingDate = subscription.starting_date || subscription.next_occurrence_date
          if (!subscriptionStartingDate) {
            console.log(`⚠️ Subscription ${subscription.id} has no starting_date, skipping`)
            continue
          }
          
          // Convert Date object to string if needed (PostgreSQL returns DATE as Date object)
          if (subscriptionStartingDate instanceof Date) {
            subscriptionStartingDate = formatDateString(subscriptionStartingDate)
          } else if (typeof subscriptionStartingDate === 'string' && subscriptionStartingDate.includes('T')) {
            // If it's an ISO string, extract just the date part
            subscriptionStartingDate = subscriptionStartingDate.split('T')[0]
          }
          
          // Validate recurrence pattern based on type
          let firstOccurrenceDateStr;
          if (subscription.recurrence_type === 'weekly') {
            if (subscription.day_of_week === null || subscription.day_of_week === undefined) {
              console.log(`⚠️ Subscription ${subscription.id} has no day_of_week for weekly recurrence, skipping`)
              continue
            }
            firstOccurrenceDateStr = calculateFirstOccurrence(subscriptionStartingDate, subscription.day_of_week)
          } else if (subscription.recurrence_type === 'monthly') {
            if (subscription.day_of_month === null || subscription.day_of_month === undefined) {
              console.log(`⚠️ Subscription ${subscription.id} has no day_of_month for monthly recurrence, skipping`)
              continue
            }
            firstOccurrenceDateStr = calculateFirstMonthlyOccurrence(subscriptionStartingDate, subscription.day_of_month)
          } else {
            console.log(`⚠️ Subscription ${subscription.id} has invalid recurrence_type: ${subscription.recurrence_type}, skipping`)
            continue
          }
          
          // Parse for comparison
          const [firstYear, firstMonth, firstDay] = firstOccurrenceDateStr.split('-').map(Number)
          const firstOccurrenceDateObj = new Date(firstYear, firstMonth - 1, firstDay)
          
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number)
          const startDateObj = new Date(startYear, startMonth - 1, startDay)
          
          const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number)
          const endDateObj = new Date(endYear, endMonth - 1, endDay)
          
          // Start from the first occurrence
          let currentDate = new Date(firstOccurrenceDateObj)
          
          // If the date range starts after the first occurrence, we need to find the correct occurrence
          // that aligns with the interval pattern and is within the date range
          if (startDateObj > firstOccurrenceDateObj) {
            if (subscription.recurrence_type === 'weekly') {
              // Find the first occurrence of the target day that is >= startDate
              currentDate = new Date(startDateObj)
              const currentDay = currentDate.getDay()
              let daysUntilTargetDay = (subscription.day_of_week - currentDay + 7) % 7

              if (daysUntilTargetDay > 0) {
                currentDate.setDate(currentDate.getDate() + daysUntilTargetDay)
              }

              // Now we need to check if this date aligns with the subscription's interval pattern
              // Calculate how many intervals have passed since the first occurrence
              const daysSinceFirst = Math.floor((currentDate.getTime() - firstOccurrenceDateObj.getTime()) / (1000 * 60 * 60 * 24))
              const intervalsSinceFirst = Math.floor(daysSinceFirst / (7 * subscription.interval_value))
              const remainderDays = daysSinceFirst % (7 * subscription.interval_value)

              // If there's a remainder, we're not on an interval boundary - move to the next interval
              if (remainderDays !== 0 || currentDate < firstOccurrenceDateObj) {
                const nextIntervalOccurrence = new Date(firstOccurrenceDateObj)
                nextIntervalOccurrence.setDate(firstOccurrenceDateObj.getDate() + ((intervalsSinceFirst + 1) * 7 * subscription.interval_value))
                currentDate = nextIntervalOccurrence
              }
            } else if (subscription.recurrence_type === 'monthly') {
              // For monthly, find the next occurrence of the target day of month >= startDate
              currentDate = new Date(startDateObj)
              const currentYear = currentDate.getFullYear()
              const currentMonth = currentDate.getMonth()

              // If we're past the target day this month, move to next month
              if (currentDate.getDate() > subscription.day_of_month) {
                currentDate.setMonth(currentMonth + 1)
              }
              currentDate.setDate(subscription.day_of_month)

              // Calculate intervals since first occurrence
              const monthsSinceFirst = (currentDate.getFullYear() - firstOccurrenceDateObj.getFullYear()) * 12 +
                                       (currentDate.getMonth() - firstOccurrenceDateObj.getMonth())
              const intervalsSinceFirst = Math.floor(monthsSinceFirst / subscription.interval_value)

              // Move to the correct interval
              const targetMonth = firstOccurrenceDateObj.getMonth() + (intervalsSinceFirst * subscription.interval_value)
              currentDate.setFullYear(firstOccurrenceDateObj.getFullYear() + Math.floor(targetMonth / 12))
              currentDate.setMonth(targetMonth % 12)
              currentDate.setDate(subscription.day_of_month)
            }
          }
          
          // Paused subscriptions: skip dates on or after paused_at
          let pausedAtStr = null
          if (subscription.paused_at) {
            const p = subscription.paused_at
            pausedAtStr = p instanceof Date ? formatDateString(p) : (typeof p === 'string' ? p.split('T')[0] : null)
          }

          // Generate dates for this subscription
          while (currentDate <= endDateObj) {
            // Only generate if the date is >= first occurrence (subscription has started) and >= startDate
            if (currentDate >= firstOccurrenceDateObj && currentDate >= startDateObj) {
              const dateStr = formatDateString(currentDate)
              if (pausedAtStr && dateStr >= pausedAtStr) {
                // Skip this and all future dates (subscription paused from paused_at)
                break
              }
              
              // Compute occurrence index within subscription pattern (1-based)
              let occ;
              if (subscription.recurrence_type === 'weekly') {
                const msPerDay = 1000 * 60 * 60 * 24
                const daysSinceFirst = Math.floor((currentDate.getTime() - firstOccurrenceDateObj.getTime()) / msPerDay)
                occ = Math.floor(daysSinceFirst / (7 * subscription.interval_value)) + 1
              } else if (subscription.recurrence_type === 'monthly') {
                const monthsSinceFirst = (currentDate.getFullYear() - firstOccurrenceDateObj.getFullYear()) * 12 +
                                         (currentDate.getMonth() - firstOccurrenceDateObj.getMonth())
                occ = Math.floor(monthsSinceFirst / subscription.interval_value) + 1
              }

              occurrencePairs.push({
                subId: subscription.id,
                occ,
                dateStr,
                subscription,
                subscriptionServices,
                totalPrice,
                totalDuration
              })
            }

            // Move to next occurrence based on recurrence type and interval
            if (subscription.recurrence_type === 'weekly') {
              currentDate.setDate(currentDate.getDate() + (7 * subscription.interval_value))
            } else if (subscription.recurrence_type === 'monthly') {
              currentDate.setMonth(currentDate.getMonth() + subscription.interval_value)
              currentDate.setDate(subscription.day_of_month)
            }
          }
        } catch (subscriptionError) {
          console.error(`❌ Error processing subscription ${subscription.id}:`, subscriptionError)
          // Continue with other subscriptions even if one fails
          continue
        }
      }

      // Fetch any materialized jobs for the occurrences in this range (by recurring_job_id + recurring_occurrence),
      // regardless of their current scheduled_date (they may have been moved).
      if (occurrencePairs.length > 0) {
        const valuesSql = occurrencePairs
          .map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`)
          .join(', ')

        const occParams = occurrencePairs.flatMap((p) => [p.subId, p.occ])

        const existingOccJobsResult = await pool.query(
          `
            WITH occ(recurring_job_id, recurring_occurrence) AS (VALUES ${valuesSql})
            SELECT j.id, j.recurring_job_id, j.recurring_occurrence, j.status
            FROM jobs j
            JOIN occ ON j.recurring_job_id = occ.recurring_job_id AND j.recurring_occurrence = occ.recurring_occurrence
            WHERE j.company_id = $${occParams.length + 1}
          `,
          [...occParams, companyId]
        )

        const existingSet = new Set(
          existingOccJobsResult.rows
            .filter((r) => r.recurring_job_id != null && r.recurring_occurrence != null)
            .map((r) => `${r.recurring_job_id}:${r.recurring_occurrence}`)
        )

        for (const p of occurrencePairs) {
          // If an occurrence has been materialized (even if moved/cancelled), do not show it as projected.
          if (existingSet.has(`${p.subId}:${p.occ}`)) continue

          projectedJobs.push({
            id: `subscription-${p.subId}-${p.occ}`, // Virtual ID (stable even if moved)
            company_id: companyId,
            client_id: p.subscription.client_id,
            assigned_user_id: p.subscription.assigned_user_id,
            title: p.subscription.title,
            note: p.subscription.note,
            scheduled_date: p.dateStr,
            scheduled_time_from: p.subscription.scheduled_time_from,
            scheduled_time_to: p.subscription.scheduled_time_to,
            status: 'scheduled',
            recurring_job_id: p.subId,
            recurring_occurrence: p.occ,
            is_generated: true,
            first_name: p.subscription.first_name,
            last_name: p.subscription.last_name,
            personal_address: p.subscription.personal_address,
            personal_zip_code: p.subscription.personal_zip_code,
            personal_city: p.subscription.personal_city,
            service_count: p.subscriptionServices.length,
            total_price: p.totalPrice,
            total_duration: p.totalDuration,
            is_projected: true
          })
        }
      }
    }

    // Combine real jobs and projected jobs, sorted by date
    const allJobs = [...realJobs, ...projectedJobs].sort((a, b) => {
      if (a.scheduled_date < b.scheduled_date) return -1
      if (a.scheduled_date > b.scheduled_date) return 1
      return 0
    })

    // Log all job statuses for debugging
    const statusCounts = allJobs.reduce((acc: any, job: any) => {
      acc[job.status || 'undefined'] = (acc[job.status || 'undefined'] || 0) + 1
      return acc
    }, {})
    console.log('📊 Jobs returned by status:', statusCounts)
    
    res.json({
      jobs: allJobs
    })
  } catch (error) {
    console.error('❌ Error fetching jobs:', error)
    console.error('Error stack:', error.stack)
    res.status(500).json({ 
      error: 'Failed to fetch jobs',
      details: error.message || 'Unknown error'
    })
  }
})

// Update a job
app.put('/api/jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { title, note, scheduled_date, services } = req.body;
    const userId = req.user.userId;

    console.log('Job update attempt:', { jobId, title, note, scheduled_date, services, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company and is not already invoiced
    const jobCheck = await pool.query(
      'SELECT id, invoice_id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    if (jobCheck.rows[0].invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and cannot be edited.' });
    }

    // Validate input
    if (!title || !services || !Array.isArray(services) || services.length === 0 || !scheduled_date) {
      return res.status(400).json({ error: 'Title, services, and scheduled date are required' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Update job
      await pool.query(
        'UPDATE jobs SET title = $1, note = $2, scheduled_date = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [title, note, scheduled_date, jobId]
      );

      // Remove existing job services
      await pool.query('DELETE FROM job_services WHERE job_id = $1', [jobId]);

      // Add updated services to job
      for (const serviceData of services) {
        const { service_id, custom_price, custom_duration } = serviceData;
        
        // Verify service belongs to user's company
        const serviceCheck = await pool.query(
          'SELECT id FROM services WHERE id = $1 AND company_id = $2',
          [service_id, companyId]
        );

        if (serviceCheck.rows.length === 0) {
          throw new Error(`Service ${service_id} not found or access denied`);
        }

        await pool.query(
          'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4)',
          [jobId, service_id, custom_price, custom_duration]
        );
      }

      await pool.query('COMMIT');

      // Send email notification about job update
      try {
        const jobDetails = await pool.query(`
          SELECT j.*, c.first_name, c.last_name, c.email
          FROM jobs j
          JOIN clients c ON j.client_id = c.id
          WHERE j.id = $1
        `, [jobId]);

        if (jobDetails.rows.length > 0) {
          const job = jobDetails.rows[0];
          const clientName = `${job.first_name} ${job.last_name}`;

          await sendEmail({
            to: job.email,
            subject: `Job Updated: ${job.title}`,
            companyId,
            html: wrapCompanyEmailHtml(`
              <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">Job update</h2>
              <p>Dear ${clientName},</p>
              <p>Your job has been updated:</p>
              <ul>
                <li><strong>Job:</strong> ${job.title}</li>
                <li><strong>Scheduled Date:</strong> ${new Date(job.scheduled_date).toLocaleDateString()}</li>
                ${job.note ? `<li><strong>Note:</strong> ${job.note}</li>` : ''}
              </ul>
              <p>If you have any questions, please contact us.</p>
              <p>Best regards,<br>PathPilo Team</p>
            `),
          });
        }
      } catch (emailError) {
        console.error('Failed to send job update email:', emailError);
        // Don't fail the job update if email fails
      }

      res.json({
        message: 'Job updated successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Job update error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Pending automated email ETAs (job slideout footer). Must use same logic as api-server on :8000.
app.get('/api/jobs/:jobId/automation-badges', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const jobId = parseInt(req.params.jobId, 10);
    if (Number.isNaN(jobId)) {
      return res.status(400).json({ error: 'Invalid job id' });
    }
    const result = await getPendingAutomationBadgesForJob(pool, jobId, companyId);
    res.json(result);
  } catch (e) {
    console.error('automation-badges:', e);
    res.status(500).json({ error: 'Failed to load automation status' });
  }
});

// Get notes for a specific job
app.get('/api/jobs/:jobId/notes', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching notes for job:', { jobId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Get notes with user information
    const notesResult = await pool.query(
      `SELECT 
        jn.*,
        u.first_name,
        u.last_name
      FROM job_notes jn
      JOIN users u ON jn.user_id = u.id
      WHERE jn.job_id = $1
      ORDER BY jn.created_at DESC`,
      [jobId]
    );

    res.json({
      notes: notesResult.rows
    });
  } catch (error) {
    console.error('Error fetching job notes:', error);
    res.status(500).json({ error: 'Failed to fetch job notes' });
  }
});

// Update job status (for completion toggle)
app.put('/api/jobs/:jobId/status', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, notify_customer, notification_subject, notification_message } = req.body;
    const userId = req.user.userId;

    console.log('Updating job status:', { jobId, status, userId });

    if (!status || !['scheduled', 'in-progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company and is not already invoiced
    const jobCheck = await pool.query(
      'SELECT id, status, scheduled_date, invoice_id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    const currentJob = jobCheck.rows[0];
    if (currentJob.invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and its status cannot be changed.' });
    }
    const oldStatus = currentJob.status;

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Update job status
      await dbClient.query(
        'UPDATE jobs SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, jobId]
      );

      // Add log entry based on status change
      if (status === 'completed' && oldStatus !== 'completed') {
        await dbClient.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'completed', 'Job completed']
        );
      } else if (oldStatus === 'completed' && status !== 'completed') {
        await dbClient.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'uncompleted', `Job marked as ${status}`]
        );
      } else if (status === 'cancelled' && oldStatus !== 'cancelled') {
        // Log cancellation, including optional notification details
        await dbClient.query(
          `INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            jobId,
            userId,
            'cancelled',
            'Job cancelled',
            notify_customer ? (notification_subject || null) : null,
            notify_customer ? (notification_message || null) : null
          ]
        );
      }

      await dbClient.query('COMMIT');

      // Send email notification about status change if requested or for important changes
      if (notify_customer && notification_subject && notification_message) {
        try {
          const jobDetails = await pool.query(`
            SELECT j.*, c.first_name, c.last_name, c.email
            FROM jobs j
            LEFT JOIN clients c ON j.client_id = c.id
            WHERE j.id = $1
          `, [jobId]);

          if (jobDetails.rows.length > 0 && jobDetails.rows[0].email) {
            const job = jobDetails.rows[0];
            const bodyText = notification_message;
            await sendEmail({
              to: job.email,
              subject: notification_subject,
              text: bodyText,
              html: wrapCompanyEmailHtml(bodyText),
              companyId,
            });
          }
        } catch (emailError) {
          console.error('Failed to send job status email:', emailError);
        }
      }

      res.json({
        message: 'Job status updated successfully',
        job: {
          id: parseInt(jobId),
          status: status
        }
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error updating job status:', error);
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

// Update job time (from/to) with optional customer notification and logging
app.put('/api/jobs/:jobId/time', authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const { scheduled_time_from, scheduled_time_to, notifyCustomer, notification_message, notification_subject } = req.body || {};
    const userId = req.user.userId;
    
    // Validate access via active company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    // Fetch existing job to compute "from -> to" log, verify company, and ensure not invoiced
    const jobResult = await pool.query(
      'SELECT id, company_id, scheduled_time_from, scheduled_time_to, client_id, invoice_id FROM jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];
    if (job.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (job.invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and its time cannot be changed.' });
    }
    
    const oldFrom = job.scheduled_time_from;
    const oldTo = job.scheduled_time_to;
    
    const client = await pool.query('SELECT email FROM clients WHERE id = $1', [job.client_id]);
    const clientEmail = client.rows[0]?.email || null;
    
    // Update times
    await pool.query(
      'UPDATE jobs SET scheduled_time_from = $1, scheduled_time_to = $2, updated_at = NOW() WHERE id = $3',
      [scheduled_time_from || null, scheduled_time_to || null, jobId]
    );
    
    // Ensure subject column exists
    try {
      await pool.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
    } catch {}

    // Log the change
    const fmt = (t) => {
      if (!t) return 'unset';
      const s = String(t);
      return s.length >= 5 ? s.substring(0, 5) : s;
    };
    const description = `Time changed from ${fmt(oldFrom)} - ${fmt(oldTo)} to ${fmt(scheduled_time_from)} - ${fmt(scheduled_time_to)}`;
    
    try {
      // Try insert with subject first
      try {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [jobId, userId, 'time-changed', description, notifyCustomer ? (notification_subject || null) : null, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
        );
      } catch (colErr) {
        if (colErr.code === '42703') {
          await pool.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
            [jobId, userId, 'time-changed', description, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
          );
        } else {
          throw colErr;
        }
      }
    } catch (logError) {
      if (logError.code === '42703') {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'time-changed', description]
        );
      } else {
        throw logError;
      }
    }

    // Send email notification about time change if requested
    if (notifyCustomer) {
      try {
        const jobDetails = await pool.query(`
          SELECT j.*, c.first_name, c.last_name, c.email
          FROM jobs j
          JOIN clients c ON j.client_id = c.id
          WHERE j.id = $1
        `, [jobId]);

        if (jobDetails.rows.length > 0) {
          const job = jobDetails.rows[0];
          const clientName = `${job.first_name} ${job.last_name}`;

          const subject = notification_subject || `Job Rescheduled: ${job.title}`;
          const message = notification_message || `Your job "${job.title}" has been rescheduled.`;

          await sendEmail({
            to: job.email,
            subject: subject,
            companyId,
            html: wrapCompanyEmailHtml(`
              <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">Job rescheduled</h2>
              <p>Dear ${clientName},</p>
              <p>${message}</p>
              <ul>
                <li><strong>Job:</strong> ${job.title}</li>
                <li><strong>New Time:</strong> ${scheduled_time_from ? new Date(scheduled_time_from).toLocaleString() : 'Not set'} - ${scheduled_time_to ? new Date(scheduled_time_to).toLocaleString() : 'Not set'}</li>
                <li><strong>Scheduled Date:</strong> ${new Date(job.scheduled_date).toLocaleDateString()}</li>
              </ul>
              <p>If you have any questions, please contact us.</p>
              <p>Best regards,<br>PathPilo Team</p>
            `),
          });
        }
      } catch (emailError) {
        console.error('Failed to send job time change email:', emailError);
        // Don't fail the time update if email fails
      }
    }

    res.json({ message: 'Job time updated' });
  } catch (error) {
    console.error('❌ TIME UPDATE ERROR:', error);
    return res.status(500).json({ error: 'Failed to update job time', details: error.message });
  }
});

// Update a single job service status (scheduled | completed | cancelled) and recompute overall job status, with logging
app.put('/api/jobs/:jobId/services/:serviceId/status', authenticateToken, async (req, res) => {
  try {
    const { jobId, serviceId } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    if (!status || !['scheduled', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be scheduled, completed, or cancelled' });
    }

    // Company access + job ownership
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const jobCheck = await pool.query(
      'SELECT id, invoice_id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    if (jobCheck.rows[0].invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and its tasks cannot be changed.' });
    }

    // Update the single job_services row
    if (status === 'completed') {
      await pool.query(
        `UPDATE job_services SET status = 'completed', completed_at = COALESCE(completed_at, NOW()) WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    } else if (status === 'cancelled') {
      await pool.query(
        `UPDATE job_services SET status = 'cancelled', completed_at = NULL WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    } else {
      await pool.query(
        `UPDATE job_services SET status = 'scheduled', completed_at = NULL WHERE id = $1 AND job_id = $2`,
        [serviceId, jobId]
      );
    }

    const updated = await pool.query(
      'SELECT * FROM job_services WHERE id = $1 AND job_id = $2',
      [serviceId, jobId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Job service not found' });
    }

    // Compute overall job status from all services, using same rules as api-server
    const r = await pool.query(
      `SELECT status FROM job_services WHERE job_id = $1`,
      [jobId]
    );
    const statuses = (r.rows || []).map((row) => row.status);
    let jobStatus = 'scheduled';
    if (statuses.length === 0) {
      jobStatus = 'scheduled';
    } else {
      const allCompleted = statuses.every((s) => s === 'completed');
      const allCancelled = statuses.every((s) => s === 'cancelled');
      const hasCompleted = statuses.some((s) => s === 'completed');
      const hasCancelled = statuses.some((s) => s === 'cancelled');

      if (allCompleted) jobStatus = 'completed';
      else if (allCancelled) jobStatus = 'cancelled';
      else if (hasCompleted && hasCancelled) jobStatus = 'sub_completed';
      else jobStatus = 'scheduled';
    }

    await pool.query(
      'UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2',
      [jobStatus, jobId]
    );

    // Log the service status change
    try {
      const svcInfo = await pool.query(
        `SELECT 
           COALESCE(js.custom_title, s.title) AS title
         FROM job_services js
         LEFT JOIN services s ON js.service_id = s.id
         WHERE js.id = $1 AND js.job_id = $2`,
        [serviceId, jobId]
      );
      const svc = svcInfo.rows[0] || {};
      const title = svc.title || 'Service';
      let statusLabel = 'scheduled';
      if (status === 'completed') statusLabel = 'completed';
      else if (status === 'cancelled') statusLabel = 'cancelled';

      await pool.query(
        'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
        [
          jobId,
          userId,
          'service-status-change',
          `${title} -> ${statusLabel}`,
        ]
      );
    } catch (logErr) {
      console.error('Failed to log service status change (root server)', { jobId, serviceId, error: logErr.message });
    }

    const jobResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    res.json({
      message: 'Service status updated',
      service: updated.rows[0],
      job: jobResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Error updating job service status:', error);
    res.status(500).json({ error: 'Failed to update service status' });
  }
});

// Update assigned user with validation, optional customer notification, and logging
app.put('/api/jobs/:jobId/assignee', authenticateToken, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    const { assigned_user_id, notifyCustomer, notification_message, notification_subject } = req.body || {};
    const userId = req.user.userId;
    
    // Validate access via active company
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    // Fetch existing job and ensure not invoiced
    const jobResult = await pool.query(
      'SELECT id, company_id, assigned_user_id, client_id, invoice_id FROM jobs WHERE id = $1',
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];
    if (job.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (job.invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and its assignee cannot be changed.' });
    }
    
    // Validate new assignee is part of company
    const membership = await pool.query(
      'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [assigned_user_id, companyId]
    );
    if (membership.rows.length === 0) {
      return res.status(400).json({ error: 'Assigned user not found or access denied' });
    }
    
    // Update assignee
    await pool.query(
      'UPDATE jobs SET assigned_user_id = $1, updated_at = NOW() WHERE id = $2',
      [assigned_user_id, jobId]
    );
    
    // Fetch client email for potential notification
    const client = await pool.query('SELECT email FROM clients WHERE id = $1', [job.client_id]);
    const clientEmail = client.rows[0]?.email || null;
    
    // Ensure subject column exists
    try {
      await pool.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
    } catch {}

    // Log the change
    const oldAssignee = job.assigned_user_id;
    const description = `Assignee changed from ${oldAssignee ?? 'unset'} to ${assigned_user_id}`;
    try {
      try {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [jobId, userId, 'assignee-changed', description, notifyCustomer ? (notification_subject || null) : null, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
        );
      } catch (colErr) {
        if (colErr.code === '42703') {
          await pool.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
            [jobId, userId, 'assignee-changed', description, notifyCustomer ? (notification_message || null) : null, notifyCustomer ? clientEmail : null]
          );
        } else {
          throw colErr;
        }
      }
    } catch (logError) {
      if (logError.code === '42703') {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'assignee-changed', description]
        );
      } else {
        throw logError;
      }
    }
    
    res.json({ message: 'Job assignee updated' });
  } catch (error) {
    console.error('❌ ASSIGNEE UPDATE ERROR:', error);
    return res.status(500).json({ error: 'Failed to update assignee', details: error.message });
  }
});
// Move job to a new date
app.put('/api/jobs/:jobId/move', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { new_date, notify_customer, notification_message, notification_subject, notification_email: bodyNotificationEmail } = req.body;
    const userId = req.user.userId;

    console.log('Moving job:', { jobId, new_date, userId, notify_customer });

    if (!new_date) {
      return res.status(400).json({ error: 'New date is required' });
    }

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company, is not invoiced, and get current date with client info
    const jobCheck = await pool.query(
      `SELECT 
         j.id, 
         j.scheduled_date, 
         j.invoice_id, 
         c.personal_email,
         c.billing_email,
         c.email,
         c.first_name, 
         c.last_name
       FROM jobs j
       JOIN clients c ON j.client_id = c.id
       WHERE j.id = $1 AND j.company_id = $2`,
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    const currentJob = jobCheck.rows[0];
    if (currentJob.invoice_id) {
      return res.status(400).json({ error: 'Job is already included on an invoice and cannot be moved.' });
    }
    const oldDate = currentJob.scheduled_date;
    // Prefer body-provided email (user can override), then billing_email, personal_email, main email
    const clientEmail =
      (bodyNotificationEmail && String(bodyNotificationEmail).trim() && String(bodyNotificationEmail).includes('@'))
        ? String(bodyNotificationEmail).trim()
        : currentJob.billing_email ||
          currentJob.personal_email ||
          currentJob.email ||
          null;

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Update job date
      await dbClient.query(
        'UPDATE jobs SET scheduled_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [new_date, jobId]
      );

      // Format dates for log
      const oldFormattedDate = new Date(oldDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const newFormattedDate = new Date(new_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      // Ensure subject column exists
      try {
        await dbClient.query('ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT');
      } catch {}

      // Add log entry
      let logDescription = `Job moved to ${newFormattedDate}`;
      if (notify_customer && notification_message) {
        logDescription += ' (customer notified)';

        // Try to send real email to the client (if we have an email)
        if (clientEmail && clientEmail.includes('@')) {
          try {
            const subject = notification_subject || 'Appointment Date Changed';
            const plainText = notification_message;
            const html = notification_message.replace(/\n/g, '<br>');

            await sendEmail({
              to: clientEmail,
              from: process.env.EMAIL_FROM || 'no-reply@vevago.com',
              subject,
              text: plainText,
              html
            });
          } catch (emailErr) {
            console.error('❌ Failed to send move notification email:', emailErr);
            // We still keep the job moved + log entry even if email fails.
          }
        } else {
          console.warn('⚠️ No valid client email found for move notification', {
            jobId,
            clientEmail
          });
        }
      }
      
      // Check if user_id and notification_message columns exist in job_logs table
      try {
        try {
          await dbClient.query(
            'INSERT INTO job_logs (job_id, user_id, action, description, notification_subject, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [jobId, userId, 'moved', logDescription, notify_customer ? (notification_subject || null) : null, notify_customer && notification_message ? notification_message : null, notify_customer ? clientEmail : null]
          );
        } catch (colErr) {
          if (colErr.code === '42703') {
            await dbClient.query(
              'INSERT INTO job_logs (job_id, user_id, action, description, notification_message, notification_email) VALUES ($1, $2, $3, $4, $5, $6)',
              [jobId, userId, 'moved', logDescription, notify_customer && notification_message ? notification_message : null, notify_customer ? clientEmail : null]
            );
          } else {
            throw colErr;
          }
        }
      } catch (logError) {
        // If columns don't exist, try with different combinations
        if (logError.code === '42703') {
          // Column doesn't exist - try without notification columns first
          try {
            await dbClient.query(
              'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
              [jobId, userId, 'moved', logDescription]
            );
          } catch (logError2) {
            // If user_id also doesn't exist, try without both
            if (logError2.code === '42703' || (logError2.message && logError2.message.includes('user_id'))) {
              console.warn('user_id column not found in job_logs, inserting without it');
              await dbClient.query(
                'INSERT INTO job_logs (job_id, action, description) VALUES ($1, $2, $3)',
                [jobId, 'moved', logDescription]
              );
            } else {
              throw logError2;
            }
          }
        } else {
          throw logError;
        }
      }

      await dbClient.query('COMMIT');

      res.json({
        message: 'Job moved successfully',
        job: {
          id: parseInt(jobId),
          scheduled_date: new_date
        },
        old_date: oldDate,
        new_date: new_date
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      console.error('Transaction error moving job:', error);
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error moving job:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ 
      error: 'Failed to move job',
      details: error.message 
    });
  }
});

// Get job logs
app.get('/api/jobs/:jobId/logs', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching logs for job:', { jobId, userId });

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Get logs ordered by creation date (oldest first) with user information
    let logsResult;
    try {
      logsResult = await pool.query(
        `SELECT 
          jl.id,
          jl.action,
          jl.description,
          jl.notification_subject,
          jl.notification_message,
          jl.notification_email,
          jl.note_content,
          jl.created_at,
          u.first_name,
          u.last_name
        FROM job_logs jl
        LEFT JOIN users u ON jl.user_id = u.id
        WHERE jl.job_id = $1
        ORDER BY jl.created_at ASC`,
        [jobId]
      );
    } catch (selErr) {
      if (selErr.code === '42703') {
        logsResult = await pool.query(
          `SELECT 
            jl.id,
            jl.action,
            jl.description,
            jl.notification_message,
            jl.notification_email,
            jl.note_content,
            jl.created_at,
            u.first_name,
            u.last_name
          FROM job_logs jl
          LEFT JOIN users u ON jl.user_id = u.id
          WHERE jl.job_id = $1
          ORDER BY jl.created_at ASC`,
          [jobId]
        );
      } else {
        throw selErr;
      }
    }

    res.json({
      logs: logsResult.rows
    });
  } catch (error) {
    console.error('Error fetching job logs:', error);
    res.status(500).json({ error: 'Failed to fetch job logs' });
  }
});

// Add a note to a job
app.post('/api/jobs/:jobId/notes', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    console.log('Adding note to job:', { jobId, content, userId });

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Add the note as a log entry instead of separate note
    try {
      await pool.query(
        'INSERT INTO job_logs (job_id, user_id, action, description, note_content) VALUES ($1, $2, $3, $4, $5)',
        [jobId, userId, 'note', 'Note added', content.trim()]
      );
    } catch (logError) {
      // If note_content column doesn't exist, try without it
      if (logError.code === '42703' || (logError.message && logError.message.includes('note_content'))) {
        await pool.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [jobId, userId, 'note', `Note: ${content.trim()}`]
        );
      } else {
        throw logError;
      }
    }

    res.status(201).json({
      message: 'Note added successfully'
    });
  } catch (error) {
    console.error('Error adding job note:', error);
    res.status(500).json({ error: 'Failed to add job note' });
  }
});

// Delete a note
app.delete('/api/jobs/:jobId/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { jobId, noteId } = req.params;
    const userId = req.user.userId;

    console.log('Deleting note:', { jobId, noteId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Delete the note (only the note author can delete their own notes)
    const deleteResult = await pool.query(
      'DELETE FROM job_notes WHERE id = $1 AND job_id = $2 AND user_id = $3 RETURNING *',
      [noteId, jobId, userId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    res.json({
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job note:', error);
    res.status(500).json({ error: 'Failed to delete job note' });
  }
});

// Get company users (team members)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Get all users for the company via user_companies (excluding sensitive data)
    const result = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, uc.role, u.created_at
      FROM users u
      JOIN user_companies uc ON u.id = uc.user_id
      WHERE uc.company_id = $1
      ORDER BY u.created_at ASC
    `, [companyId]
    );

    res.json({
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get company clients
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Get clients for the user's company (exclude deleted)
    const result = await pool.query(
      'SELECT * FROM clients WHERE company_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [companyId]
    );

    res.json({
      clients: result.rows
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get single client
app.get('/api/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching client:', { clientId, userId });

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Get client for the user's company (exclude deleted)
    const result = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [clientId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      client: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Get company services
app.get('/api/services', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('🔍 DEBUG: Getting services for userId:', userId);
    console.log('🔍 DEBUG: req.user:', req.user);

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      // If no active company, return empty array instead of error
      if (companyAccess.status === 400) {
        return res.json({ services: [] });
      }
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Get services for the company
    const result = await pool.query(
      'SELECT * FROM services WHERE company_id = $1 ORDER BY created_at ASC',
      [companyId]
    );

    res.json({
      services: result.rows
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Admin - Get services for a specific company
app.get('/api/admin/companies/:companyId/services', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get services for the specified company (ALL columns)
    const result = await pool.query(
      'SELECT * FROM services WHERE company_id = $1 ORDER BY created_at ASC',
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

// Admin - Get clients for a specific company
app.get('/api/admin/companies/:companyId/clients', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get clients for the specified company (ALL columns)
    const result = await pool.query(
      'SELECT * FROM clients WHERE company_id = $1 ORDER BY created_at ASC',
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

// Admin - Get users for a specific company
app.get('/api/admin/companies/:companyId/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get users for the specified company via user_companies table
    // Order by role (owner first, then admin, manager, employee) then by created_at
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

// Admin - Get single company details
app.get('/api/admin/companies/:companyId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get company details with owner info
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
        owner: {
          firstName: company.owner_first_name,
          lastName: company.owner_last_name,
          email: company.owner_email
        }
      }
    });
  } catch (error) {
    console.error('Error fetching company details:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

// Update user profile
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, email } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Check if email is already taken by another user
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already taken by another user' });
    }

    // Update user information
    const result = await pool.query(
      'UPDATE users SET first_name = $1, last_name = $2, email = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, first_name, last_name, email, role, company_id',
      [firstName.trim(), lastName.trim(), email.trim(), userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get company name
    const companyResult = await pool.query('SELECT name FROM companies WHERE id = $1', [user.company_id]);
    const companyName = companyResult.rows[0]?.name || '';

    const updatedUser = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
      companyName: companyName
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

// Company Profile API
app.get('/api/company/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [companyId]
    );

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
        city: company.city,
        zipCode: company.zip_code
      }
    });

  } catch (error) {
    console.error('Error fetching company profile:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

app.put('/api/company/profile', authenticateToken, async (req, res) => {
  try {
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    
    // Verify user is owner or admin of the company
    if (companyAccess.userRole !== 'owner' && companyAccess.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only owners and admins can update company profile' });
    }

    // Update company profile
    const result = await pool.query(
      'UPDATE companies SET name = $1, country = $2, cvr_number = $3, address = $4, city = $5, zip_code = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING id, name, country, cvr_number, address, city, zip_code',
      [name, country, cvrNumber, address, city, zipCode, companyId]
    );

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
        city: company.city,
        zipCode: company.zip_code
      }
    });

  } catch (error) {
    console.error('Error updating company profile:', error);
    res.status(500).json({ error: 'Failed to update company profile' });
  }
});

// Work Hours API
app.get('/api/work-hours/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify the target user belongs to the same company
    const targetUserCheck = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (targetUserCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    // Get work hours for the specified user and company
    const result = await pool.query(
      'SELECT * FROM user_company_work_hours WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    // If no work hours exist, return default values
    if (result.rows.length === 0) {
      const defaultHours = {
        user_id: parseInt(userId),
        company_id: companyId,
        monday_hours: 7.5,
        tuesday_hours: 7.5,
        wednesday_hours: 7.5,
        thursday_hours: 7.5,
        friday_hours: 7.0,
        saturday_hours: 0.0,
        sunday_hours: 0.0
      };
      return res.json({ workHours: defaultHours });
    }

    res.json({ workHours: result.rows[0] });

  } catch (error) {
    console.error('Error fetching work hours:', error);
    res.status(500).json({ error: 'Failed to fetch work hours' });
  }
});

app.put('/api/work-hours/:userId', authenticateToken, async (req, res) => {
  try {
    const { workHours } = req.body;
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const currentUserRole = companyAccess.userRole;

    // Only owners and admins can edit work hours
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only owners and admins can edit work hours' });
    }

    // Verify the target user belongs to the same company
    const targetUserCheck = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );

    if (targetUserCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    const { monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours } = workHours;

    // Upsert work hours (insert or update)
    const result = await pool.query(`
      INSERT INTO user_company_work_hours 
      (user_id, company_id, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id, company_id)
      DO UPDATE SET
        monday_hours = EXCLUDED.monday_hours,
        tuesday_hours = EXCLUDED.tuesday_hours,
        wednesday_hours = EXCLUDED.wednesday_hours,
        thursday_hours = EXCLUDED.thursday_hours,
        friday_hours = EXCLUDED.friday_hours,
        saturday_hours = EXCLUDED.saturday_hours,
        sunday_hours = EXCLUDED.sunday_hours,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, companyId, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, saturday_hours, sunday_hours]);

    res.json({ workHours: result.rows[0] });

  } catch (error) {
    console.error('Error updating work hours:', error);
    res.status(500).json({ error: 'Failed to update work hours', details: error.message });
  }
});

// Subscriptions API
// Get subscriptions for a specific client
app.get('/api/clients/:clientId/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching subscriptions for client:', { clientId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Get subscriptions for the client
    const subscriptionsResult = await pool.query(
      `SELECT 
        rj.*,
        COUNT(rjs.id) as service_count,
        u.first_name as assigned_user_first_name,
        u.last_name as assigned_user_last_name
      FROM recurring_jobs rj
      LEFT JOIN recurring_job_services rjs ON rj.id = rjs.recurring_job_id
      LEFT JOIN users u ON rj.assigned_user_id = u.id
      WHERE rj.client_id = $1 AND rj.company_id = $2
      GROUP BY rj.id, u.first_name, u.last_name
      ORDER BY rj.created_at DESC`,
      [clientId, companyId]
    );

    // Get services for each subscription
    const subscriptionsWithServices = await Promise.all(
      subscriptionsResult.rows.map(async (subscription) => {
        const servicesResult = await pool.query(
          `SELECT 
            rjs.*,
            s.title
          FROM recurring_job_services rjs
          LEFT JOIN services s ON rjs.service_id = s.id
          WHERE rjs.recurring_job_id = $1
          ORDER BY rjs.created_at ASC`,
          [subscription.id]
        );

        return {
          ...subscription,
          services: servicesResult.rows
        };
      })
    );

    res.json({
      subscriptions: subscriptionsWithServices
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Create subscription endpoint
app.post('/api/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { title, client_id, assigned_user_id, services, starting_date, recurrence_type, day_of_week, day_of_month, interval_value, scheduled_time_from, scheduled_time_to, note } = req.body;
    const userId = req.user.userId;

    console.log('Subscription creation attempt:', {
      title,
      client_id,
      assigned_user_id,
      services,
      starting_date,
      recurrence_type,
      day_of_week,
      day_of_month,
      interval_value,
      scheduled_time_from,
      scheduled_time_to,
      note,
      userId
    });

    // Validate input
    if (!client_id || !services || !Array.isArray(services) || services.length === 0 || !starting_date || !recurrence_type || !interval_value) {
      return res.status(400).json({ error: 'Client, services, starting date, recurrence type, and interval are required' });
    }

    // Generate title if not provided (for subscriptions, we can generate based on services)
    let finalTitle = title;
    if (!finalTitle || finalTitle.trim() === '') {
      const serviceNames = [];
      for (const serviceData of services) {
        if (serviceData.service_id) {
          // Get service name from database
          const serviceResult = await pool.query('SELECT title FROM services WHERE id = $1', [serviceData.service_id]);
          if (serviceResult.rows.length > 0) {
            serviceNames.push(serviceResult.rows[0].title);
          }
        } else if (serviceData.custom_title) {
          serviceNames.push(serviceData.custom_title);
        }
      }
      finalTitle = serviceNames.length > 0 ? serviceNames.slice(0, 2).join(' + ') + (serviceNames.length > 2 ? ' +' : '') : 'Subscription';
    }

    // Validate recurrence type specific fields
    if (recurrence_type === 'weekly' && (day_of_week === null || day_of_week === undefined)) {
      return res.status(400).json({ error: 'Day of week is required for weekly recurrence' });
    }
    if (recurrence_type === 'monthly' && (day_of_month === null || day_of_month === undefined)) {
      return res.status(400).json({ error: 'Day of month is required for monthly recurrence' });
    }

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [client_id, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Verify assigned user belongs to user's company (if provided)
    if (assigned_user_id) {
      // Check if assigned user belongs to the company (using user_companies table)
      const assignedUserCheck = await pool.query(
        'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [assigned_user_id, companyId]
      );

      if (assignedUserCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Assigned user not found or access denied' });
      }
    }

    // Helper function to format date as YYYY-MM-DD string without timezone conversion
    const formatDateString = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Calculate first occurrence date based on starting_date and day_of_week
    // If starting_date is Sunday (0) and day_of_week is Monday (1), first occurrence is Monday (day after)
    const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
      // Parse the date string as local date (YYYY-MM-DD)
      const [year, month, day] = startingDateStr.split('-').map(Number)
      const startDate = new Date(year, month - 1, day)
      const startDay = startDate.getDay()
      
      // Calculate days until the target day of week
      let daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7
      
      // If starting date is already the target day, use it
      // Otherwise, move to the next occurrence of that day
      if (daysUntilTargetDay === 0) {
        // Same day, use starting date
        return formatDateString(startDate)
      } else {
        // Move to the next occurrence
        const firstOccurrence = new Date(startDate)
        firstOccurrence.setDate(startDate.getDate() + daysUntilTargetDay)
        return formatDateString(firstOccurrence)
      }
    }

    // Calculate first monthly occurrence date based on starting_date and day_of_month
    const calculateFirstMonthlyOccurrence = (startingDateStr, dayOfMonth) => {
      // Parse the date string as local date (YYYY-MM-DD)
      const [year, month, day] = startingDateStr.split('-').map(Number)
      const startDate = new Date(year, month - 1, day)

      // Create the target date for the current month
      const targetDate = new Date(year, month - 1, dayOfMonth)

      // If the target date is on or after the starting date, use it
      // Otherwise, move to next month
      if (targetDate >= startDate) {
        return formatDateString(targetDate)
      } else {
        // Move to next month
        targetDate.setMonth(targetDate.getMonth() + 1)
        return formatDateString(targetDate)
      }
    }

    // Calculate first occurrence based on recurrence type
    let firstOccurrence;
    if (recurrence_type === 'weekly') {
      firstOccurrence = calculateFirstOccurrence(starting_date, day_of_week);
    } else if (recurrence_type === 'monthly') {
      firstOccurrence = calculateFirstMonthlyOccurrence(starting_date, day_of_month);
    }

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Create subscription (recurring_job) with both starting_date and next_occurrence_date
      // Convert undefined to null for assigned_user_id (optional field)
      const assignedUserId = assigned_user_id || null
      const subscriptionResult = await dbClient.query(
        'INSERT INTO recurring_jobs (company_id, client_id, assigned_user_id, title, note, scheduled_time_from, scheduled_time_to, recurrence_type, day_of_week, day_of_month, interval_value, is_active, starting_date, next_occurrence_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
        [companyId, client_id, assignedUserId, finalTitle, note, scheduled_time_from, scheduled_time_to, recurrence_type, day_of_week || null, day_of_month || null, interval_value, true, starting_date, firstOccurrence]
      );

      const subscription = subscriptionResult.rows[0];

      // Add services to subscription
      for (const serviceData of services) {
        const { service_id, custom_price, custom_duration } = serviceData;
        
        // Verify service belongs to user's company
        const serviceCheck = await dbClient.query(
          'SELECT id FROM services WHERE id = $1 AND company_id = $2',
          [service_id, companyId]
        );

        if (serviceCheck.rows.length === 0) {
          throw new Error(`Service ${service_id} not found or access denied`);
        }

        await dbClient.query(
          'INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4)',
          [subscription.id, service_id, custom_price, custom_duration]
        );
      }

      await dbClient.query('COMMIT');

      res.status(201).json({
        message: 'Subscription created successfully',
        subscription
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('❌ SUBSCRIPTION CREATION ERROR:', error);
    res.status(500).json({ 
      error: 'Failed to create subscription',
      details: error.message
    });
  }
});

// Update subscription endpoint
app.put('/api/subscriptions/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { title, assigned_user_id, services, starting_date, day_of_week, interval_weeks, scheduled_time_from, scheduled_time_to, note, is_active } = req.body;
    const userId = req.user.userId;

    console.log('Subscription update attempt:', { 
      subscriptionId,
      title, 
      assigned_user_id, 
      services, 
      starting_date,
      day_of_week, 
      interval_weeks,
      scheduled_time_from,
      scheduled_time_to,
      note,
      is_active,
      userId 
    });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify subscription belongs to user's company
    const subscriptionCheck = await pool.query(
      'SELECT id FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );

    if (subscriptionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    // Verify assigned user belongs to user's company (if provided)
    if (assigned_user_id) {
      // Check if assigned user belongs to the company (using user_companies table)
      const assignedUserCheck = await pool.query(
        'SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2',
        [assigned_user_id, companyId]
      );

      if (assignedUserCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Assigned user not found or access denied' });
      }
    }

    // Calculate first occurrence date if starting_date or day_of_week changed
    let firstOccurrence = null
    if (starting_date || (day_of_week !== null && day_of_week !== undefined)) {
      // Get current subscription to use existing values if not provided
      const currentSubResult = await pool.query(
        'SELECT starting_date, day_of_week FROM recurring_jobs WHERE id = $1 AND company_id = $2',
        [subscriptionId, companyId]
      )
      
      const currentSub = currentSubResult.rows[0]
      const effectiveStartingDate = starting_date || currentSub.starting_date
      const effectiveDayOfWeek = (day_of_week !== null && day_of_week !== undefined) ? day_of_week : currentSub.day_of_week
      
      if (effectiveStartingDate && effectiveDayOfWeek !== null && effectiveDayOfWeek !== undefined) {
        // Helper function to format date as YYYY-MM-DD string without timezone conversion
        const formatDateString = (date) => {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        }

        const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
          // Parse the date string as local date (YYYY-MM-DD)
          const [year, month, day] = startingDateStr.split('-').map(Number)
          const startDate = new Date(year, month - 1, day)
          const startDay = startDate.getDay()
          
          let daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7
          
          if (daysUntilTargetDay === 0) {
            return formatDateString(startDate)
          } else {
            const firstOccurrence = new Date(startDate)
            firstOccurrence.setDate(startDate.getDate() + daysUntilTargetDay)
            return formatDateString(firstOccurrence)
          }
        }
        firstOccurrence = calculateFirstOccurrence(effectiveStartingDate, effectiveDayOfWeek)
      }
    }

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Update subscription
      const updateFields = []
      const updateValues = []
      let paramCount = 1

      if (title) {
        updateFields.push(`title = $${paramCount++}`)
        updateValues.push(title)
      }
      // Allow assigned_user_id to be set to null (to remove assignment)
      if (assigned_user_id !== undefined) {
        updateFields.push(`assigned_user_id = $${paramCount++}`)
        updateValues.push(assigned_user_id || null)
      }
      if (note !== null && note !== undefined) {
        updateFields.push(`note = $${paramCount++}`)
        updateValues.push(note)
      }
      if (scheduled_time_from !== null && scheduled_time_from !== undefined) {
        updateFields.push(`scheduled_time_from = $${paramCount++}`)
        updateValues.push(scheduled_time_from)
      }
      if (scheduled_time_to !== null && scheduled_time_to !== undefined) {
        updateFields.push(`scheduled_time_to = $${paramCount++}`)
        updateValues.push(scheduled_time_to)
      }
      if (starting_date) {
        updateFields.push(`starting_date = $${paramCount++}`)
        updateValues.push(starting_date)
      }
      if (day_of_week !== null && day_of_week !== undefined) {
        updateFields.push(`day_of_week = $${paramCount++}`)
        updateValues.push(day_of_week)
      }
      if (interval_weeks) {
        updateFields.push(`interval_weeks = $${paramCount++}`)
        updateValues.push(interval_weeks)
      }
      if (is_active !== null && is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount++}`)
        updateValues.push(is_active)
      }
      if (firstOccurrence) {
        updateFields.push(`next_occurrence_date = $${paramCount++}`)
        updateValues.push(firstOccurrence)
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
      updateValues.push(subscriptionId, companyId)

      if (updateFields.length > 1) {
        await dbClient.query(
          `UPDATE recurring_jobs SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND company_id = $${paramCount++} RETURNING *`,
          updateValues
        )
      }

      // Update services if provided
      if (services && Array.isArray(services)) {
        // Delete existing services
        await dbClient.query('DELETE FROM recurring_job_services WHERE recurring_job_id = $1', [subscriptionId])

        // Add updated services
        for (const serviceData of services) {
          const { service_id, custom_price, custom_duration } = serviceData;
          
          // Verify service belongs to user's company
          const serviceCheck = await dbClient.query(
            'SELECT id FROM services WHERE id = $1 AND company_id = $2',
            [service_id, companyId]
          );

          if (serviceCheck.rows.length === 0) {
            throw new Error(`Service ${service_id} not found or access denied`);
          }

          await dbClient.query(
            'INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1, $2, $3, $4)',
            [subscriptionId, service_id, custom_price, custom_duration]
          );
        }
      }

      await dbClient.query('COMMIT');

      res.json({
        message: 'Subscription updated successfully'
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription', details: error.message });
  }
});

// Delete subscription endpoint
app.delete('/api/subscriptions/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const userId = req.user.userId;

    console.log('Subscription deletion attempt:', { subscriptionId, userId });

    // Get user's company
    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Verify subscription belongs to user's company
    const subscriptionCheck = await pool.query(
      'SELECT id FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );

    if (subscriptionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }

    // Delete subscription (CASCADE will delete services)
    await pool.query(
      'DELETE FROM recurring_jobs WHERE id = $1 AND company_id = $2',
      [subscriptionId, companyId]
    );

    res.json({
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ error: 'Failed to delete subscription', details: error.message });
  }
});

// Materialize a projected subscription occurrence into a real job.
// This keeps a stable link to the subscription via (recurring_job_id, recurring_occurrence).
// Body: { scheduled_date?: 'YYYY-MM-DD' } - optional override (e.g. if user immediately moves it)
app.post('/api/subscriptions/:subscriptionId/occurrences/:occurrence/materialize', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const subscriptionId = parseInt(req.params.subscriptionId, 10);
    const occurrence = parseInt(req.params.occurrence, 10);
    const { scheduled_date } = req.body || {};
    const userId = req.user.userId;

    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Invalid subscriptionId' });
    }
    if (!Number.isFinite(occurrence) || occurrence <= 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Invalid occurrence (must be >= 1)' });
    }

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      dbClient.release();
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Load subscription
    const subRes = await dbClient.query(
      `SELECT * FROM recurring_jobs WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [subscriptionId, companyId]
    );
    if (subRes.rows.length === 0) {
      dbClient.release();
      return res.status(404).json({ error: 'Subscription not found or access denied' });
    }
    const sub = subRes.rows[0];

    // If already materialized, return existing job id
    const existing = await dbClient.query(
      `SELECT id FROM jobs
       WHERE company_id = $1 AND recurring_job_id = $2 AND recurring_occurrence = $3
       LIMIT 1`,
      [companyId, subscriptionId, occurrence]
    );
    if (existing.rows.length > 0) {
      dbClient.release();
      return res.json({ message: 'Already materialized', jobId: existing.rows[0].id });
    }

    const formatDateString = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const calculateFirstOccurrence = (startingDateStr, dayOfWeek) => {
      const [year, month, day] = String(startingDateStr).split('-').map(Number);
      const startDate = new Date(year, month - 1, day);
      const startDay = startDate.getDay();
      const daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7;
      if (daysUntilTargetDay === 0) return formatDateString(startDate);
      const first = new Date(startDate);
      first.setDate(startDate.getDate() + daysUntilTargetDay);
      return formatDateString(first);
    };

    // Determine base occurrence date
    let starting = sub.starting_date || sub.next_occurrence_date;
    if (starting instanceof Date) starting = formatDateString(starting);
    else if (typeof starting === 'string' && starting.includes('T')) starting = starting.split('T')[0];

    const firstOccStr = calculateFirstOccurrence(starting, sub.day_of_week);
    const [fy, fm, fd] = firstOccStr.split('-').map(Number);
    const base = new Date(fy, fm - 1, fd);
    const daysToAdd = (occurrence - 1) * 7 * sub.interval_weeks;
    base.setDate(base.getDate() + daysToAdd);
    const computedDate = formatDateString(base);

    const jobDate = (typeof scheduled_date === 'string' && scheduled_date.length === 10) ? scheduled_date : computedDate;

    // Block materialization if subscription is paused from this date
    if (sub.paused_at) {
      const pausedStr = sub.paused_at instanceof Date
        ? formatDateString(sub.paused_at)
        : (typeof sub.paused_at === 'string' ? sub.paused_at.split('T')[0] : String(sub.paused_at));
      if (pausedStr && jobDate >= pausedStr) {
        dbClient.release();
        return res.status(400).json({
          error: 'Subscription is paused. Future jobs from the pause date cannot be materialized.',
          paused_at: pausedStr
        });
      }
    }

    // Copy services from subscription
    const subServicesRes = await dbClient.query(
      `SELECT rjs.service_id, rjs.custom_price, rjs.custom_duration_minutes
       FROM recurring_job_services rjs
       WHERE rjs.recurring_job_id = $1
       ORDER BY rjs.created_at ASC`,
      [subscriptionId]
    );
    const subServices = subServicesRes.rows;
    if (!subServices || subServices.length === 0) {
      dbClient.release();
      return res.status(400).json({ error: 'Subscription has no services to materialize' });
    }

    await dbClient.query('BEGIN');

    const jobRes = await dbClient.query(
      `INSERT INTO jobs (
        company_id, client_id, assigned_user_id, title, note,
        scheduled_date, scheduled_time_from, scheduled_time_to,
        status, recurring_job_id, recurring_occurrence, is_generated
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        companyId,
        sub.client_id,
        sub.assigned_user_id || req.user.userId,
        sub.title,
        sub.note || null,
        jobDate,
        sub.scheduled_time_from || null,
        sub.scheduled_time_to || null,
        'scheduled',
        subscriptionId,
        occurrence,
        true
      ]
    );
    const jobId = jobRes.rows[0].id;

    for (const s of subServices) {
      await dbClient.query(
        `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (job_id, service_id) DO NOTHING`,
        [jobId, s.service_id, s.custom_price || null, s.custom_duration_minutes || null]
      );
    }

    await dbClient.query(
      'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
      [jobId, userId, 'materialized', 'Created by subscription']
    );

    await dbClient.query('COMMIT');
    dbClient.release();

    return res.status(201).json({ message: 'Materialized', jobId, scheduled_date: jobDate, recurring_occurrence: occurrence });
  } catch (error) {
    try { await pool.query('ROLLBACK'); } catch {}
    console.error('❌ MATERIALIZE OCCURRENCE ERROR:', error);
    return res.status(500).json({ error: 'Failed to materialize occurrence', details: error.message });
  } finally {
    try { dbClient.release(); } catch {}
  }
});

// Delete job endpoint
app.delete('/api/jobs/:jobId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    console.log('Job deletion attempt:', { jobId, userId });

    // Get and validate active company access
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      client.release();
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    // Ensure job exists and belongs to this company
    const jobRes = await client.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    try {
      await client.query('BEGIN');

      // Delete related logs, notes, services (safety even if CASCADE exists)
      await client.query('DELETE FROM job_logs WHERE job_id = $1', [jobId]);
      await client.query('DELETE FROM job_notes WHERE job_id = $1');
      await client.query('DELETE FROM job_services WHERE job_id = $1');

      // Delete the job itself
      await client.query('DELETE FROM jobs WHERE id = $1 AND company_id = $2', [jobId, companyId]);

      await client.query('COMMIT');

      res.json({
        message: 'Job deleted successfully',
        deletedJobId: parseInt(jobId, 10)
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error deleting job:', err);
      res.status(500).json({ error: 'Failed to delete job', details: err.message });
    }
  } catch (error) {
    console.error('Error deleting job (outer):', error);
    res.status(500).json({ error: 'Failed to delete job', details: error.message });
  } finally {
    client.release();
  }
});

// Get email templates for a company
app.get('/api/email-templates', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    try {
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(255)`);
    } catch (_) {
      /* ignore */
    }

    const result = await pool.query(
      'SELECT template_type, subject, message FROM email_templates WHERE company_id = $1',
      [companyId]
    );

    // Convert array to object keyed by template_type
    const templates = {};
    result.rows.forEach(row => {
      templates[row.template_type] = {
        subject: row.subject || '',
        message: row.message || ''
      };
    });

    // Ensure all template types exist (with defaults if not found)
    const defaultTemplates = {
      change_date: { subject: '', message: '' },
      change_time: { subject: '', message: '' },
      change_employee: { subject: '', message: '' },
      cancel_job: { subject: '', message: '' },
      send_invoice: { subject: '', message: '' }
    };

    let repliesToEmail = '';
    try {
      const rt = await pool.query('SELECT reply_to_email FROM companies WHERE id = $1', [companyId]);
      repliesToEmail = rt.rows[0]?.reply_to_email ? String(rt.rows[0].reply_to_email).trim() : '';
    } catch (_) {
      /* ignore */
    }

    res.json({
      templates: { ...defaultTemplates, ...templates },
      repliesToEmail,
    });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    // If table doesn't exist, return empty templates instead of error
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return res.json({
        templates: {
          change_date: { subject: '', message: '' },
          change_time: { subject: '', message: '' },
          change_employee: { subject: '', message: '' },
          cancel_job: { subject: '', message: '' },
          send_invoice: { subject: '', message: '' }
        },
        repliesToEmail: '',
      });
    }
    res.status(500).json({ error: 'Failed to fetch email templates', details: error.message });
  }
});

// Save email templates for a company
app.put('/api/email-templates', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const { templates, repliesToEmail } = req.body;
    const hasTemplates = templates && typeof templates === 'object';
    const hasReplyTo = typeof repliesToEmail === 'string';

    if (!hasTemplates && !hasReplyTo) {
      return res.status(400).json({ error: 'templates or repliesToEmail required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      try {
        await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(255)`);
      } catch (_) {
        /* ignore */
      }

      if (hasReplyTo) {
        const trimmed = repliesToEmail.trim();
        const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const value = trimmed && SIMPLE_EMAIL_RE.test(trimmed) ? trimmed : null;
        await client.query(
          `UPDATE companies SET reply_to_email = $1, updated_at = NOW() WHERE id = $2`,
          [value, companyId]
        );
      }

      if (hasTemplates) {
        for (const [templateType, template] of Object.entries(templates)) {
          if (!['change_date', 'change_time', 'change_employee', 'cancel_job', 'send_invoice'].includes(templateType)) {
            continue; // Skip invalid template types
          }

          const subject = template.subject || '';
          const message = template.message || '';

          // Use INSERT ... ON CONFLICT to upsert
          await client.query(`
          INSERT INTO email_templates (company_id, template_type, subject, message, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (company_id, template_type)
          DO UPDATE SET
            subject = EXCLUDED.subject,
            message = EXCLUDED.message,
            updated_at = CURRENT_TIMESTAMP
        `, [companyId, templateType, subject, message]);
        }
      }

      await client.query('COMMIT');
      res.json({ message: 'Email templates saved successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving email templates:', error);
    res.status(500).json({ error: 'Failed to save email templates', details: error.message });
  }
});

// === INVOICE ENDPOINTS ===

// Get all invoices for a client
app.get('/api/clients/:clientId/invoices', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { clientId } = req.params;

    // Verify client belongs to company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await pool.query(`
      SELECT
        i.*,
        c.first_name,
        c.last_name,
        u.first_name as created_by_first_name,
        u.last_name as created_by_last_name,
        COUNT(ii.id) as item_count
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
      WHERE i.company_id = $1 AND i.client_id = $2
      GROUP BY i.id, c.id, u.id
      ORDER BY i.created_at DESC
    `, [companyId, clientId]);

    res.json({
      invoices: result.rows.map(invoice => ({
        ...invoice,
        client_name: `${invoice.first_name} ${invoice.last_name}`,
        created_by_name: invoice.created_by_first_name && invoice.created_by_last_name
          ? `${invoice.created_by_first_name} ${invoice.created_by_last_name}`
          : null
      }))
    });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// Create a new invoice for a client
app.post('/api/clients/:clientId/invoices', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { clientId } = req.params;
    const userId = req.user.userId;

    const {
      job_ids,
      issue_date,
      due_date,
      tax_rate = 0,
      currency = 'DKK',
      notes,
      payment_terms,
      discounts = {}
    } = req.body;

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({ error: 'At least one job must be selected' });
    }

    if (!issue_date || !due_date) {
      return res.status(400).json({ error: 'Issue date and due date are required' });
    }

    // Verify client belongs to company
    const clientCheck = await client.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Verify all jobs belong to client and are completed AND not already invoiced
    const jobCheck = await client.query(`
      SELECT j.id, j.title, j.status,
             COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_price,
             COALESCE(SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes)), 0) as total_duration,
             array_agg(DISTINCT COALESCE(s.title, js.custom_title)) FILTER (WHERE COALESCE(s.title, js.custom_title) IS NOT NULL) as services
      FROM jobs j
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE j.id = ANY($1) AND j.client_id = $2 AND j.status = 'completed' AND j.invoice_id IS NULL
      GROUP BY j.id
    `, [job_ids, clientId]);

    if (jobCheck.rows.length !== job_ids.length) {
      return res.status(400).json({ error: 'Some jobs not found or not completed' });
    }

    // Generate invoice number
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const invoiceCountResult = await client.query(
      "SELECT COUNT(*) as count FROM invoices WHERE company_id = $1 AND invoice_number LIKE $2",
      [companyId, `${year}${month}%`]
    );
    const invoiceNumber = `${year}${month}${String(invoiceCountResult.rows[0].count + 1).padStart(4, '0')}`;

    // Calculate totals
    let subtotal = 0;
    const invoiceItems = [];

    for (const job of jobCheck.rows) {
      const jobServices = await client.query(`
        SELECT 
          js.*,
          COALESCE(s.title, js.custom_title) as service_title,
          s.price,
          s.duration_minutes
        FROM job_services js
        LEFT JOIN services s ON js.service_id = s.id
        WHERE js.job_id = $1
      `, [job.id]);

      // Skip jobs with no services
      if (jobServices.rows.length === 0) {
        console.log(`Skipping job ${job.id} - no services assigned`);
        continue;
      }

      // Calculate job total and apply discount
      let jobTotal = 0;
      for (const service of jobServices.rows) {
        const quantity = 1;
        const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0);
        const lineTotal = unitPrice * quantity;
        jobTotal += lineTotal;
      }

      // Apply discount if any
      const jobDiscount = discounts[job.id] || 0;
      const finalJobTotal = Math.max(0, jobTotal - jobDiscount);

      // Create invoice items for this job
      for (const service of jobServices.rows) {
        const quantity = 1;
        const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0);
        // Distribute discount proportionally across services
        const serviceProportion = unitPrice / jobTotal;
        const serviceDiscount = jobDiscount * serviceProportion;
        const finalUnitPrice = unitPrice - serviceDiscount;
        const lineTotal = Math.max(0, finalUnitPrice) * quantity;

        subtotal += lineTotal;

        invoiceItems.push({
          job_id: job.id,
          service_id: service.service_id ?? null,
          description: service.service_title || 'Service',
          quantity,
          unit_price: finalUnitPrice,
          line_total: lineTotal,
          original_price: unitPrice,
          discount_applied: serviceDiscount
        });
      }
    }

    // Check if we have any invoice items
    if (invoiceItems.length === 0) {
      return res.status(400).json({ error: 'No services found for the selected jobs. Make sure jobs have services assigned.' });
    }

    const taxAmount = subtotal * (tax_rate / 100);
    const total = subtotal + taxAmount;

    // Look up company slug for building invoice links in job logs
    const companySlugResult = await client.query('SELECT slug FROM companies WHERE id = $1', [companyId]);
    const companySlug = companySlugResult.rows[0]?.slug || null;

    // Create invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices (
        company_id, client_id, invoice_number, issue_date, due_date,
        subtotal, tax_rate, tax_amount, total, currency, notes, payment_terms, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      companyId, clientId, invoiceNumber, issue_date, due_date,
      subtotal, tax_rate, taxAmount, total, currency, notes, payment_terms, userId
    ]);

    const invoice = invoiceResult.rows[0];

    // Create invoice items
    for (const item of invoiceItems) {
      await client.query(`
        INSERT INTO invoice_items (
          invoice_id, job_id, service_id, description, quantity, unit_price, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        invoice.id, item.job_id, item.service_id, item.description,
        item.quantity, item.unit_price, item.line_total
      ]);
    }

    // Mark jobs as invoiced (prevents invoicing the same job twice)
    const invoicedJobIds = [...new Set(invoiceItems.map(i => i.job_id))];
    await client.query(
      `UPDATE jobs SET invoice_id = $1 WHERE id = ANY($2::int[])`,
      [invoice.id, invoicedJobIds]
    );

    // Add a log entry on each job that it was added to an invoice draft
    const invoiceLinkPath = companySlug ? `/${companySlug}/invoices/${invoice.id}` : `/invoices/${invoice.id}`;
    for (const jid of invoicedJobIds) {
      try {
        await client.query(
          'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
          [
            jid,
            userId,
            'invoice-draft',
            `Job added to invoice draft #${invoice.invoice_number || invoice.id} (${invoiceLinkPath})`
          ]
        );
      } catch (e) {
        console.error('Failed to log invoice draft on job', { jobId: jid, invoiceId: invoice.id, error: e.message });
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      invoice: {
        ...invoice,
        items: invoiceItems
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  } finally {
    client.release();
  }
});

// Get a specific invoice with items
app.get('/api/invoices/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const invoiceResult = await pool.query(`
      SELECT i.*,
             c.first_name, c.last_name,
             c.personal_address, c.personal_city, c.personal_zip_code,
             c.billing_address, c.billing_city, c.billing_zip_code,
             u.first_name as created_by_first_name, u.last_name as created_by_last_name
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      LEFT JOIN users u ON i.created_by = u.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [invoiceId, companyId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Get invoice items
    const itemsResult = await pool.query(`
      SELECT ii.*,
             j.title as job_title,
             s.title as service_title
      FROM invoice_items ii
      JOIN jobs j ON ii.job_id = j.id
      LEFT JOIN services s ON ii.service_id = s.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `, [invoiceId]);

    let transactions = [];
    let balance = Number(invoice.total) || 0;
    try {
      const txResult = await pool.query(`
        SELECT id, type, amount, description, payment_source, transaction_date, created_at
        FROM invoice_transactions
        WHERE invoice_id = $1
        ORDER BY transaction_date ASC, id ASC
      `, [invoiceId]);
      let sumCharges = 0;
      let sumPayments = 0;
      transactions = (txResult.rows || []).map((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'charge') sumCharges += amount;
        else if (t.type === 'payment') sumPayments += amount;
        return {
          id: t.id,
          type: t.type,
          amount,
          description: t.description || '',
          payment_source: t.payment_source || null,
          transaction_date: t.transaction_date,
          created_at: t.created_at
        };
      });
      balance = Math.round(((Number(invoice.total) || 0) + sumCharges - sumPayments) * 100) / 100;
    } catch (_) {
      // invoice_transactions table may not exist yet
    }

    res.json({
      invoice: {
        ...invoice,
        client_name: `${invoice.first_name} ${invoice.last_name}`,
        created_by_name: invoice.created_by_first_name && invoice.created_by_last_name
          ? `${invoice.created_by_first_name} ${invoice.created_by_last_name}`
          : null,
        items: itemsResult.rows,
        transactions,
        balance
      }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
});

// Download invoice as PDF
app.get('/api/invoices/:invoiceId/pdf', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const invoiceResult = await pool.query(`
      SELECT i.*,
             c.first_name, c.last_name,
             c.personal_address, c.personal_city, c.personal_zip_code, c.personal_email,
             c.billing_address, c.billing_city, c.billing_zip_code, c.billing_email
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [invoiceId, companyId]);

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    const itemsResult = await pool.query(`
      SELECT ii.*, s.title as service_title
      FROM invoice_items ii
      JOIN services s ON ii.service_id = s.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `, [invoiceId]);

    const companyResult = await pool.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    const company = companyResult.rows[0] || null;

    const pdf = await buildInvoicePdfBuffer({ invoice, items: itemsResult.rows, company });
    const filename = `invoice-${invoice.invoice_number || invoice.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate invoice PDF', details: error.message });
  }
});

// Update invoice status
app.put('/api/invoices/:invoiceId/status', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { status } = req.body;

    if (!['draft', 'sent', 'paid', 'overdue', 'cancelled', 'overpaid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateFields = ['status = $1'];
    const values = [status];

    if (status === 'sent') {
      updateFields.push('sent_at = CURRENT_TIMESTAMP');
    } else if (status === 'paid') {
      updateFields.push('paid_at = CURRENT_TIMESTAMP');
    }

    const result = await pool.query(`
      UPDATE invoices
      SET ${updateFields.join(', ')}
      WHERE id = $2 AND company_id = $3
      RETURNING *
    `, [...values, invoiceId, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status', details: error.message });
  }
});

// Add payment (or charge) – bookkeeping timeline
app.post('/api/invoices/:invoiceId/transactions', authenticateToken, async (req, res) => {
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { type, amount, description, payment_source, transaction_date } = req.body;

    if (!type || !['charge', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use: charge or payment' });
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (type === 'charge' && (!description || String(description).trim() === '')) {
      return res.status(400).json({ error: 'Description is required for charges' });
    }

    const invResult = await pool.query(
      'SELECT id, total, status FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const transactionDate = transaction_date && String(transaction_date).trim()
      ? new Date(transaction_date.trim())
      : new Date();
    const desc = type === 'charge' ? String(description || '').trim() : (description ? String(description).trim() : 'Payment');
    const source = type === 'payment' && payment_source != null ? String(payment_source).trim() : null;

    const insertResult = await pool.query(`
      INSERT INTO invoice_transactions (invoice_id, type, amount, description, payment_source, transaction_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [invoiceId, type, numAmount, desc || 'Payment', source, transactionDate]);

    const newRow = insertResult.rows[0];

    const sumResult = await pool.query(`
      SELECT type, SUM(amount::numeric) as total
      FROM invoice_transactions
      WHERE invoice_id = $1
      GROUP BY type
    `, [invoiceId]);

    const invoiceTotal = Number(invResult.rows[0].total) || 0;
    let charges = 0;
    let payments = 0;
    (sumResult.rows || []).forEach((r) => {
      const val = Number(r.total) || 0;
      if (r.type === 'charge') charges += val;
      else if (r.type === 'payment') payments += val;
    });
    const balance = Math.round((invoiceTotal + charges - payments) * 100) / 100;

    let newStatus = invResult.rows[0].status;
    if (type === 'payment') {
      if (balance <= 0) {
        newStatus = balance < 0 ? 'overpaid' : 'paid';
        await pool.query(
          `UPDATE invoices SET status = $1, paid_at = COALESCE(paid_at, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4`,
          [newStatus, transactionDate, invoiceId, companyId]
        );
      }
    }

    const transaction = {
      id: newRow.id,
      type: newRow.type,
      amount: numAmount,
      description: newRow.description || '',
      payment_source: newRow.payment_source || null,
      transaction_date: newRow.transaction_date,
      created_at: newRow.created_at
    };

    res.status(201).json({
      transaction,
      balance,
      status: newStatus
    });
  } catch (error) {
    console.error('Error adding invoice transaction:', error);
    res.status(500).json({ error: 'Failed to add transaction', details: error.message });
  }
});

// Send invoice to client (email + PDF) and mark as sent
app.post('/api/invoices/:invoiceId/send-email', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      await client.query('ROLLBACK');
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { subject, message } = req.body || {};

    const invoiceResult = await client.query(`
      SELECT i.*,
             c.first_name, c.last_name,
             c.personal_email, c.billing_email
      FROM invoices i
      JOIN clients c ON i.client_id = c.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [invoiceId, companyId]);

    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    if (invoice.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice cannot be sent (not a draft)' });
    }

    const toEmail = invoice.billing_email || invoice.personal_email;
    if (!toEmail) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Client has no email address (billing_email or personal_email)' });
    }

    const itemsResult = await client.query(`
      SELECT ii.*, s.title as service_title
      FROM invoice_items ii
      JOIN services s ON ii.service_id = s.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `, [invoiceId]);

    const companyResult = await client.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    const company = companyResult.rows[0] || null;

    // Load template if subject/message not provided
    let resolvedSubject = subject;
    let resolvedMessage = message;
    if (!resolvedSubject || !resolvedMessage) {
      const tpl = await client.query(
        'SELECT subject, message FROM email_templates WHERE company_id = $1 AND template_type = $2',
        [companyId, 'send_invoice']
      );
      if (tpl.rows.length > 0) {
        resolvedSubject = resolvedSubject || tpl.rows[0].subject || '';
        resolvedMessage = resolvedMessage || tpl.rows[0].message || '';
      }
    }

    const clientName = `${invoice.first_name || ''} ${invoice.last_name || ''}`.trim();
    const vars = {
      '{Client name}': clientName,
      '{Client first name}': invoice.first_name || '',
      '{Client last name}': invoice.last_name || '',
      '{Company name}': company?.name || '',
      '{Invoice number}': invoice.invoice_number || '',
      '{Invoice total}': `${invoice.currency} ${Number(invoice.total || 0).toFixed(2)}`,
      '{Invoice due date}': invoice.due_date || ''
    };

    resolvedSubject = renderTemplate(resolvedSubject || `Invoice ${invoice.invoice_number}`, vars);
    resolvedMessage = renderTemplate(resolvedMessage || '', vars);

    const pdf = await buildInvoicePdfBuffer({ invoice, items: itemsResult.rows, company });
    const filename = `invoice-${invoice.invoice_number || invoice.id}.pdf`;

    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@vevago.com';

    await sendEmail({
      from: fromEmail,
      to: toEmail,
      subject: resolvedSubject,
      text: resolvedMessage,
      companyId,
      attachments: [
        { filename, content: pdf, contentType: 'application/pdf' }
      ]
    });

    const updated = await client.query(
      `UPDATE invoices
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND company_id = $2 AND status = 'draft'
       RETURNING *`,
      [invoiceId, companyId]
    );

    // Log on each related job that its invoice was sent
    try {
      const itemJobs = await client.query(
        'SELECT DISTINCT job_id FROM invoice_items WHERE invoice_id = $1',
        [invoiceId]
      );
      const jobIds = itemJobs.rows.map(r => r.job_id).filter(Boolean);

      // Build invoice link path (no company slug here, but the frontend can still use the ID)
      const invoiceLink = `/invoices/${invoiceId}`;
      for (const jid of jobIds) {
        try {
          await client.query(
            'INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, $2, $3, $4)',
            [
              jid,
              req.user.userId,
              'invoice-sent',
              `Invoice #${invoice.invoice_number || invoiceId} sent to client (${invoiceLink})`
            ]
          );
        } catch (logErr) {
          console.error('Failed to log invoice sent on job', { jobId: jid, invoiceId, error: logErr.message });
        }
      }
    } catch (e) {
      console.error('Failed to log invoice sent on related jobs', { invoiceId, error: e.message });
    }

    await client.query('COMMIT');
    res.json({ message: 'Invoice sent', invoice: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending invoice email:', error);
    res.status(500).json({ error: 'Failed to send invoice', details: error.message });
  } finally {
    client.release();
  }
});

// Delete invoice (only if draft)
app.delete('/api/invoices/:invoiceId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const companyAccess = await getActiveCompanyId(req, res);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const jobAction = (req.body && req.body.jobAction) ? String(req.body.jobAction) : 'restore';

    if (!['restore', 'delete_jobs'].includes(jobAction)) {
      return res.status(400).json({ error: 'Invalid jobAction. Use restore or delete_jobs' });
    }

    await client.query('BEGIN');

    const inv = await client.query(
      'SELECT id, status FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (inv.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (inv.rows[0].status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice cannot be deleted (not a draft)' });
    }

    let affectedJobs = 0;
    if (jobAction === 'delete_jobs') {
      const delJobs = await client.query(
        'DELETE FROM jobs WHERE invoice_id = $1 AND company_id = $2 RETURNING id',
        [invoiceId, companyId]
      );
      affectedJobs = delJobs.rows.length;
    } else {
      const restoreJobs = await client.query(
        'UPDATE jobs SET invoice_id = NULL WHERE invoice_id = $1 AND company_id = $2',
        [invoiceId, companyId]
      );
      affectedJobs = restoreJobs.rowCount || 0;
    }

    const delInvoice = await client.query(
      'DELETE FROM invoices WHERE id = $1 AND company_id = $2 AND status = $3 RETURNING id',
      [invoiceId, companyId, 'draft']
    );
    if (delInvoice.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found or cannot be deleted (not a draft)' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Invoice deleted successfully', jobAction, affectedJobs });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice', details: error.message });
  } finally {
    client.release();
  }
});

// Run lightweight schema migrations that keep existing databases up to date.
pool.query(`ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT`).catch(() => {});

// Start server with error handling
const server = app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📧 Automated job emails: tick every 60s (booking confirmation + day reminder)`);
  runAutomatedEmailTick(pool);
  setInterval(() => {
    runAutomatedEmailTick(pool);
  }, 60 * 1000);
  console.log(`📊 Registration API: POST http://localhost:${port}/api/auth/register`);
  console.log(`🔐 Login API: POST http://localhost:${port}/api/auth/login`);
  console.log(`🏢 Company API: POST http://localhost:${port}/api/companies`);
  console.log(`🛠️ Services API: POST http://localhost:${port}/api/services`);
  console.log(`🛠️ Services API: GET http://localhost:${port}/api/services`);
  console.log(`👥 Clients API: POST http://localhost:${port}/api/clients`);
  console.log(`👥 Clients API: GET http://localhost:${port}/api/clients`);
  console.log(`👤 Users API: GET http://localhost:${port}/api/users`);
  console.log(`👤 User Profile API: PUT http://localhost:${port}/api/user/profile`);
  console.log(`🏢 Company Profile API: GET http://localhost:${port}/api/company/profile`);
  console.log(`🏢 Company Profile API: PUT http://localhost:${port}/api/company/profile`);
  console.log(`⏰ Work Hours API: GET http://localhost:${port}/api/work-hours/:userId`);
  console.log(`⏰ Work Hours API: PUT http://localhost:${port}/api/work-hours/:userId`);
  console.log(`💼 Jobs API: GET http://localhost:${port}/api/jobs`);
  console.log(`💼 Jobs API: PUT http://localhost:${port}/api/jobs/:jobId`);
  console.log(`💼 Job Notes API: GET http://localhost:${port}/api/jobs/:jobId/notes`);
  console.log(`💼 Job Notes API: POST http://localhost:${port}/api/jobs/:jobId/notes`);
  console.log(`💼 Job Notes API: DELETE http://localhost:${port}/api/jobs/:jobId/notes/:noteId`);
  console.log(`💼 Client Jobs API: GET http://localhost:${port}/api/clients/:clientId/jobs`);
  console.log(`🔄 Subscriptions API: GET http://localhost:${port}/api/clients/:clientId/subscriptions`);
  console.log(`🔄 Subscriptions API: POST http://localhost:${port}/api/subscriptions`);
  console.log(`🔄 Subscriptions API: PUT http://localhost:${port}/api/subscriptions/:id`);
  console.log(`🔄 Subscriptions API: DELETE http://localhost:${port}/api/subscriptions/:id`);
  console.log(`💰 Invoices API: GET http://localhost:${port}/api/clients/:clientId/invoices`);
  console.log(`💰 Invoices API: POST http://localhost:${port}/api/clients/:clientId/invoices`);
  console.log(`💰 Invoices API: GET http://localhost:${port}/api/invoices/:invoiceId`);
  console.log(`💰 Invoices API: PUT http://localhost:${port}/api/invoices/:invoiceId/status`);
  console.log(`💰 Invoices API: DELETE http://localhost:${port}/api/invoices/:invoiceId`);
  console.log(`👥 Users API: GET http://localhost:${port}/api/admin/users`);
  console.log(`🏢 Companies API: GET http://localhost:${port}/api/admin/companies`);
  console.log(`🏢 Company Details API: GET http://localhost:${port}/api/admin/companies/:id`);
  console.log(`🛠️ Company Services API: GET http://localhost:${port}/api/admin/companies/:id/services`);
  console.log(`👥 Company Clients API: GET http://localhost:${port}/api/admin/companies/:id/clients`);
  console.log(`👤 Company Users API: GET http://localhost:${port}/api/admin/companies/:id/users`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use.`);
    console.error(`💡 Solution: Kill the existing process and try again.`);
    console.error(`   1. Find process: netstat -ano | findstr :${port}`);
    console.error(`   2. Kill process: taskkill /PID <PID> /F`);
    console.error(`   3. Restart server: npm run dev:server`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});
