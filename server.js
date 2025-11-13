const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret (in production, use environment variable)
const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';

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

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'vevago_',
  user: 'vevago.app',
  password: 'E9n!GdczqusW@43i' // Update this with your PostgreSQL password
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Hello Vevago! Server is working!' });
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    console.log('Registration attempt:', { firstName, lastName, email });

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user without company (will be created later)
    const userResult = await pool.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, role, created_at',
      [firstName, lastName, email, passwordHash, 'company-owner']
    );

    const user = userResult.rows[0];

    // Generate JWT token for auto-login
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: null
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        companyId: null,
        companyName: null
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', { email });

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user with company info
    const result = await pool.query(`
      SELECT 
        u.id, u.first_name, u.last_name, u.email, u.password_hash, u.role, u.company_id,
        c.name as company_name
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      WHERE u.email = $1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyId: user.company_id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// Create company endpoint (for users without companies)
app.post('/api/companies', authenticateToken, async (req, res) => {
  try {
    const { name, country, cvrNumber, address, city, zipCode } = req.body;
    const userId = req.user.userId;

    console.log('Company creation attempt:', { name, country, cvrNumber, address, city, zipCode, userId });

    // Validate input
    if (!name || !country || !address || !city || !zipCode) {
      return res.status(400).json({ error: 'Company name, country, address, city, and zip code are required' });
    }

    // Check if user already has a company
    const existingUser = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    if (existingUser.rows[0].company_id) {
      return res.status(400).json({ error: 'User already has a company' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create company
      const companyResult = await client.query(
        'INSERT INTO companies (name, country, cvr_number, address, city, zip_code, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, country, cvr_number, address, city, zip_code, created_at',
        [name, country, cvrNumber, address, city, zipCode, userId]
      );

      const company = companyResult.rows[0];

      // Update user with company_id
      await client.query(
        'UPDATE users SET company_id = $1 WHERE id = $2',
        [company.id, userId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Company created successfully',
        company: {
          id: company.id,
          name: company.name,
          cvrNumber: company.cvr_number,
          address: company.address,
          zipCode: company.zip_code,
          city: company.city,
          createdAt: company.created_at
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Company creation error:', error);
    res.status(500).json({ error: 'Company creation failed: ' + error.message });
  }
});

// Get all users (admin endpoint - protected)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.email, 
        u.role,
        u.created_at,
        c.name as company_name,
        c.id as company_id
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        companyName: user.company_name,
        createdAt: user.created_at
      }))
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users: ' + error.message });
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to create services' });
    }

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to update services' });
    }

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to delete services' });
    }

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to create jobs' });
    }

    // Verify client belongs to user's company
    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [client_id, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    // Verify assigned user belongs to user's company
    const assignedUserCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2',
      [assigned_user_id, companyId]
    );

    if (assignedUserCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Assigned user not found or access denied' });
    }

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

      // Add services to job
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
      first_name, 
      last_name, 
      country,
      personal_address, 
      personal_zip_code, 
      personal_email, 
      personal_phone,
      billing_address,
      billing_zip_code,
      billing_email,
      billing_phone
    } = req.body;
    const userId = req.user.userId;

    console.log('Client creation attempt:', { 
      first_name, 
      last_name, 
      country,
      personal_address, 
      personal_zip_code, 
      personal_email, 
      personal_phone,
      billing_address,
      billing_zip_code,
      billing_email,
      billing_phone,
      userId 
    });

    // Validate input - only first_name is required
    if (!first_name) {
      return res.status(400).json({ error: 'First name is required' });
    }

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to create clients' });
    }

    // Create client
    const result = await pool.query(
      `INSERT INTO clients (
        company_id, first_name, last_name, country,
        personal_address, personal_zip_code, personal_email, personal_phone,
        billing_address, billing_zip_code, billing_email, billing_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        companyId, first_name, last_name, country,
        personal_address, personal_zip_code, personal_email, personal_phone,
        billing_address, billing_zip_code, billing_email, billing_phone
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
      first_name, 
      last_name, 
      country,
      personal_address, 
      personal_zip_code, 
      personal_city,
      personal_email, 
      personal_phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone
    } = req.body;
    const userId = req.user.userId;

    console.log('Client update attempt:', { 
      clientId,
      first_name, 
      last_name, 
      country,
      personal_address, 
      personal_zip_code, 
      personal_city,
      personal_email, 
      personal_phone,
      billing_address,
      billing_zip_code,
      billing_city,
      billing_email,
      billing_phone,
      userId 
    });

    // Validate input - only first_name is required
    if (!first_name) {
      return res.status(400).json({ error: 'First name is required' });
    }

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to update clients' });
    }

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
        first_name = $1, last_name = $2, country = $3,
        personal_address = $4, personal_zip_code = $5, personal_city = $6, personal_email = $7, personal_phone = $8,
        billing_address = $9, billing_zip_code = $10, billing_city = $11, billing_email = $12, billing_phone = $13,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $14 AND company_id = $15 RETURNING *`,
      [
        first_name, last_name, country,
        personal_address, personal_zip_code, personal_city, personal_email, personal_phone,
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

// Get jobs for a specific client
app.get('/api/clients/:clientId/jobs', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching jobs for client:', { clientId, userId });

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view jobs' });
    }

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
        c.first_name,
        c.last_name,
        c.personal_address,
        c.personal_zip_code,
        c.personal_city,
        COUNT(js.id) as service_count,
        SUM(js.custom_price) as total_price,
        SUM(js.custom_duration_minutes) as total_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN job_services js ON j.id = js.job_id
      WHERE j.client_id = $1 AND j.company_id = $2
      GROUP BY j.id, c.first_name, c.last_name, c.personal_address, c.personal_zip_code, c.personal_city
      ORDER BY j.scheduled_date DESC, j.created_at DESC`,
      [clientId, companyId]
    );

    // Get services for each job
    const jobsWithServices = await Promise.all(
      jobsResult.rows.map(async (job) => {
        const servicesResult = await pool.query(
          `SELECT 
            js.*,
            s.title,
            s.price,
            s.duration_minutes
          FROM job_services js
          JOIN services s ON js.service_id = s.id
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;
    
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId])
    const companyId = userResult.rows[0].company_id

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view jobs' })
    }

    // Get real jobs
    let query = `
      SELECT 
        j.*,
        c.first_name,
        c.last_name,
        c.personal_address,
        c.personal_zip_code,
        c.personal_city,
        COUNT(js.id) as service_count,
        SUM(js.custom_price) as total_price,
        SUM(js.custom_duration_minutes) as total_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN job_services js ON j.id = js.job_id
      WHERE j.company_id = $1
    `
    
    const params = [companyId]
    
    if (start_date && end_date) {
      query += ' AND j.scheduled_date >= $2 AND j.scheduled_date <= $3'
      params.push(start_date, end_date)
    }
    
    query += `
      GROUP BY j.id, c.first_name, c.last_name, c.personal_address, c.personal_zip_code, c.personal_city
      ORDER BY j.scheduled_date ASC, j.created_at ASC
    `

    const realJobsResult = await pool.query(query, params)
    const realJobs = realJobsResult.rows

    // Get projected jobs from active subscriptions if date range is provided
    let projectedJobs = []
    if (start_date && end_date) {
      // Get all active subscriptions for the company
      const subscriptionsResult = await pool.query(
        `SELECT 
          rj.*,
          c.first_name,
          c.last_name,
          c.personal_address,
          c.personal_zip_code,
          c.personal_city
        FROM recurring_jobs rj
        LEFT JOIN clients c ON rj.client_id = c.id
        WHERE rj.company_id = $1 AND rj.is_active = true`,
        [companyId]
      )

      const subscriptions = subscriptionsResult.rows

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
          
          // Validate day_of_week
          if (subscription.day_of_week === null || subscription.day_of_week === undefined) {
            console.log(`⚠️ Subscription ${subscription.id} has no day_of_week, skipping`)
            continue
          }
          
          const firstOccurrenceDateStr = calculateFirstOccurrence(subscriptionStartingDate, subscription.day_of_week)
          
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
            const intervalsSinceFirst = Math.floor(daysSinceFirst / (7 * subscription.interval_weeks))
            const remainderDays = daysSinceFirst % (7 * subscription.interval_weeks)
            
            // If there's a remainder, we're not on an interval boundary - move to the next interval
            if (remainderDays !== 0 || currentDate < firstOccurrenceDateObj) {
              const nextIntervalOccurrence = new Date(firstOccurrenceDateObj)
              nextIntervalOccurrence.setDate(firstOccurrenceDateObj.getDate() + ((intervalsSinceFirst + 1) * 7 * subscription.interval_weeks))
              currentDate = nextIntervalOccurrence
            }
          }
          
          // Generate dates for this subscription
          while (currentDate <= endDateObj) {
            // Only generate if the date is >= first occurrence (subscription has started) and >= startDate
            if (currentDate >= firstOccurrenceDateObj && currentDate >= startDateObj) {
              const dateStr = formatDateString(currentDate)
              
              // Check if a real job already exists for this subscription on this date
              const existingJob = realJobs.find(job => 
                job.scheduled_date === dateStr && 
                job.recurring_job_id === subscription.id
              )

              // Only create a projected job if no real job exists
              if (!existingJob) {
                projectedJobs.push({
                  id: `subscription-${subscription.id}-${dateStr}`, // Virtual ID
                  company_id: companyId,
                  client_id: subscription.client_id,
                  assigned_user_id: subscription.assigned_user_id,
                  title: subscription.title,
                  note: subscription.note,
                  scheduled_date: dateStr,
                  scheduled_time_from: subscription.scheduled_time_from,
                  scheduled_time_to: subscription.scheduled_time_to,
                  status: 'scheduled',
                  recurring_job_id: subscription.id,
                  is_generated: true,
                  first_name: subscription.first_name,
                  last_name: subscription.last_name,
                  personal_address: subscription.personal_address,
                  personal_zip_code: subscription.personal_zip_code,
                  personal_city: subscription.personal_city,
                  service_count: subscriptionServices.length,
                  total_price: totalPrice,
                  total_duration: totalDuration,
                  is_projected: true // Flag to indicate this is a projected job
                })
              }
            }
            
            // Move to next occurrence based on interval
            currentDate.setDate(currentDate.getDate() + (7 * subscription.interval_weeks))
          }
        } catch (subscriptionError) {
          console.error(`❌ Error processing subscription ${subscription.id}:`, subscriptionError)
          // Continue with other subscriptions even if one fails
          continue
        }
      }
    }

    // Combine real jobs and projected jobs, sorted by date
    const allJobs = [...realJobs, ...projectedJobs].sort((a, b) => {
      if (a.scheduled_date < b.scheduled_date) return -1
      if (a.scheduled_date > b.scheduled_date) return 1
      return 0
    })

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to update jobs' });
    }

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
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

// Get notes for a specific job
app.get('/api/jobs/:jobId/notes', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching notes for job:', { jobId, userId });

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view job notes' });
    }

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to add job notes' });
    }

    // Verify job belongs to user's company
    const jobCheck = await pool.query(
      'SELECT id FROM jobs WHERE id = $1 AND company_id = $2',
      [jobId, companyId]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }

    // Add the note
    const noteResult = await pool.query(
      'INSERT INTO job_notes (job_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [jobId, userId, content.trim()]
    );

    // Get the note with user information
    const noteWithUser = await pool.query(
      `SELECT 
        jn.*,
        u.first_name,
        u.last_name
      FROM job_notes jn
      JOIN users u ON jn.user_id = u.id
      WHERE jn.id = $1`,
      [noteResult.rows[0].id]
    );

    res.status(201).json({
      message: 'Note added successfully',
      note: noteWithUser.rows[0]
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to delete job notes' });
    }

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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view team members' });
    }

    // Get all users for the company (excluding sensitive data)
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, role, created_at FROM users WHERE company_id = $1 ORDER BY created_at ASC',
      [companyId]
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

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view clients' });
    }

    // Get clients for the user's company
    const result = await pool.query(
      'SELECT * FROM clients WHERE company_id = $1 ORDER BY created_at DESC',
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

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view clients' });
    }

    // Get client for the user's company
    const result = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND company_id = $2',
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    console.log('🔍 DEBUG: User query result:', userResult.rows);
    
    if (userResult.rows.length === 0) {
      console.log('🔍 DEBUG: User not found in database');
      return res.status(404).json({ error: 'User not found. Please log in again.' });
    }
    
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.json({ services: [] });
    }

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

    // Get users for the specified company (ALL columns)
    const result = await pool.query(
      'SELECT * FROM users WHERE company_id = $1 ORDER BY created_at ASC',
      [companyId]
    );

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

    const result = await pool.query(
      'SELECT c.* FROM companies c JOIN users u ON c.id = u.company_id WHERE u.id = $1',
      [userId]
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
    const userResult = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const companyId = userResult.rows[0].company_id;

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

    // Get current user's company
    const userResult = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [currentUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const companyId = userResult.rows[0].company_id;

    // Verify the target user belongs to the same company
    const targetUserResult = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [userId]
    );

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (targetUserResult.rows[0].company_id !== companyId) {
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

    // Get current user's company and role
    const userResult = await pool.query(
      'SELECT company_id, role FROM users WHERE id = $1',
      [currentUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    const { company_id: companyId, role } = userResult.rows[0];

    // Only owners and admins can edit work hours
    if (!['company-owner', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Access denied: Only owners and admins can edit work hours' });
    }

    // Verify the target user belongs to the same company
    const targetUserResult = await pool.query(
      'SELECT company_id FROM users WHERE id = $1',
      [userId]
    );

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    if (targetUserResult.rows[0].company_id !== companyId) {
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to view subscriptions' });
    }

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
          JOIN services s ON rjs.service_id = s.id
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
    const { title, client_id, assigned_user_id, services, starting_date, day_of_week, interval_weeks, scheduled_time_from, scheduled_time_to, note } = req.body;
    const userId = req.user.userId;

    console.log('Subscription creation attempt:', { 
      title, 
      client_id, 
      assigned_user_id, 
      services, 
      starting_date,
      day_of_week, 
      interval_weeks,
      scheduled_time_from,
      scheduled_time_to,
      note,
      userId 
    });

    // Validate input
    if (!title || !client_id || !services || !Array.isArray(services) || services.length === 0 || !starting_date || day_of_week === null || day_of_week === undefined || !interval_weeks) {
      return res.status(400).json({ error: 'Title, client, services, starting date, day of week, and interval are required' });
    }

    // Get user's company
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to create subscriptions' });
    }

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
      const assignedUserCheck = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND company_id = $2',
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

    const firstOccurrence = calculateFirstOccurrence(starting_date, day_of_week)

    // Start transaction
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Create subscription (recurring_job) with both starting_date and next_occurrence_date
      // Convert undefined to null for assigned_user_id (optional field)
      const assignedUserId = assigned_user_id || null
      const subscriptionResult = await dbClient.query(
        'INSERT INTO recurring_jobs (company_id, client_id, assigned_user_id, title, note, scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks, is_active, starting_date, next_occurrence_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
        [companyId, client_id, assignedUserId, title, note, scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks, true, starting_date, firstOccurrence]
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to update subscriptions' });
    }

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
      const assignedUserCheck = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND company_id = $2',
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
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
    const companyId = userResult.rows[0].company_id;

    if (!companyId) {
      return res.status(400).json({ error: 'User must have a company to delete subscriptions' });
    }

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

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
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
  console.log(`👥 Users API: GET http://localhost:${port}/api/admin/users`);
  console.log(`🏢 Companies API: GET http://localhost:${port}/api/admin/companies`);
  console.log(`🏢 Company Details API: GET http://localhost:${port}/api/admin/companies/:id`);
  console.log(`🛠️ Company Services API: GET http://localhost:${port}/api/admin/companies/:id/services`);
  console.log(`👥 Company Clients API: GET http://localhost:${port}/api/admin/companies/:id/clients`);
  console.log(`👤 Company Users API: GET http://localhost:${port}/api/admin/companies/:id/users`);
});
