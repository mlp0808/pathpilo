const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();

// JWT Secret - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// POST /api/auth/register
router.post('/register', async (req, res) => {
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    console.log('Login attempt for:', email);

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

module.exports = router;
