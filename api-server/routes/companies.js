const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();

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
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(`
      SELECT c.id, c.name, c.slug
      FROM companies c
      JOIN user_companies uc ON uc.company_id = c.id
      WHERE uc.user_id = $1 AND c.slug = $2
    `, [userId, slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found or access denied' });
    }

    res.json({ company: result.rows[0] });
  } catch (error) {
    console.error('Error resolving company by slug:', error);
    res.status(500).json({ error: 'Failed to resolve company' });
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
      'SELECT id, name, COALESCE(slug, LOWER(REGEXP_REPLACE(name, \'[^a-z0-9]+\', \'-\', \'g\'))) as slug, owner_id FROM companies WHERE id = $1',
      [targetCompanyId]
    );
    const company = companyResult.rows[0];
    
    if (!company) {
      console.error('Company not found:', targetCompanyId);
      return res.status(404).json({ error: 'Company not found' });
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
      role: c.user_role,
      isOwner: c.is_owner
    }));

    // Get user details first
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, role FROM users WHERE id = $1',
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
        role: userRole,
        companyId: company.id,
        companyName: company.name,
        companies: allCompanies,
        activeCompany: {
          id: company.id,
          name: company.name,
          slug: company.slug,
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

    const companyResult = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
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

// PUT /api/companies/profile - Update company profile (uses active company from token when available)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
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

    await pool.query(
      'UPDATE companies SET name = $1, country = $2, cvr_number = $3, address = $4, city = $5, zip_code = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7',
      [name != null ? String(name).trim() : null, country != null ? String(country).trim() : null, cvrNumber != null ? String(cvrNumber).trim() : null, address != null ? String(address).trim() : null, city != null ? String(city).trim() : null, zipCode != null ? String(zipCode).trim() : null, companyId]
    );

    res.json({
      message: 'Company profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating company profile:', error);
    res.status(500).json({ error: 'Failed to update company profile' });
  }
});

// PUT /api/companies/:companyId - Update company (setup wizard; owner only)
router.put('/:companyId', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
    const userId = req.user.userId;

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

    // Generate new slug if name changed
    let slug = currentCompany.slug;
    if (newName !== currentCompany.name) {
      const generateSlug = (n) => {
        return n
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      };
      slug = generateSlug(newName);
      let counter = 1;
      let slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1 AND id != $2', [slug, companyId]);
      while (slugCheck.rows.length > 0) {
        slug = generateSlug(newName) + '-' + counter;
        slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1 AND id != $2', [slug, companyId]);
        counter++;
      }
    }

    const result = await pool.query(`
      UPDATE companies
      SET name = $1, slug = $2, country = $3, cvr_number = $4, address = $5, city = $6, zip_code = $7, updated_at = NOW()
      WHERE id = $8
      RETURNING id, name, slug, country, cvr_number as "cvrNumber", address, city, zip_code as "zipCode"
    `, [
      newName,
      slug,
      country != null ? String(country).trim() : null,
      cvrNumber != null ? String(cvrNumber).trim() : null,
      address != null ? String(address).trim() : null,
      city != null ? String(city).trim() : null,
      zipCode != null ? String(zipCode).trim() : null,
      companyId
    ]);

    const company = result.rows[0];
    res.json({
      message: 'Company updated successfully',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        country: company.country,
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
    const { name, ownerEmail } = req.body;
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

    // Generate slug
    const generateSlug = (name) => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    };

    let slug = generateSlug(name);
    // Ensure uniqueness
    let counter = 1;
    let slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
    while (slugCheck.rows.length > 0) {
      slug = generateSlug(name) + '-' + counter;
      slugCheck = await pool.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      counter++;
    }

    // Create company
    const result = await pool.query(`
      INSERT INTO companies (name, slug, owner_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, slug, ownerId]);

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
