const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Helper function to get active company ID from JWT token
const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }

  return { companyId: activeCompanyId };
};

// GET /api/clients - Get all clients for company
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(`
      SELECT
        c.*,
        COUNT(DISTINCT j.id) as job_count,
        MAX(j.scheduled_date) as last_job_date
      FROM clients c
      LEFT JOIN jobs j ON c.id = j.client_id AND j.status != 'cancelled'
      WHERE c.company_id = $1
      GROUP BY c.id
      ORDER BY c.name ASC, c.last_name ASC
    `, [companyId]);

    res.json({
      clients: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients: ' + error.message });
  }
});

// GET /api/clients/:clientId - Get single client
router.get('/:clientId', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user?.userId || req.user?.id;

    console.log('Fetching client:', { clientId, userId, user: req.user });

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token: missing user ID' });
    }

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      console.error('Company access error:', companyAccess.error);
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    console.log('Company ID from token:', companyId);

    const result = await pool.query(`
      SELECT
        c.*,
        COUNT(DISTINCT j.id) as job_count,
        MAX(j.scheduled_date) as last_job_date,
        COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_spent
      FROM clients c
      LEFT JOIN jobs j ON c.id = j.client_id AND j.status = 'completed'
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE c.id = $1 AND c.company_id = $2
      GROUP BY c.id
    `, [clientId, companyId]);

    console.log('Client query result:', { clientId, companyId, found: result.rows.length });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    res.json({ client: result.rows[0] });

  } catch (error) {
    console.error('Error fetching client:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch client: ' + error.message });
  }
});

// POST /api/clients - Create new client
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      last_name,
      client_type,
      address,
      zip_code,
      city,
      email,
      phone
    } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!name || !client_type) {
      return res.status(400).json({ error: 'Name and client type are required' });
    }

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(`
      INSERT INTO clients
      (company_id, name, last_name, client_type, address, zip_code, city, email, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [companyId, name, last_name, client_type, address, zip_code, city, email, phone]);

    res.status(201).json({
      message: 'Client created successfully',
      client: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client: ' + error.message });
  }
});

// PUT /api/clients/:clientId - Update client
router.put('/:clientId', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
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

    // Build update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && key !== 'id' && key !== 'company_id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(clientId);

    const updateQuery = `
      UPDATE clients
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      message: 'Client updated successfully',
      client: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client: ' + error.message });
  }
});

// DELETE /api/clients/:clientId - Delete client
router.delete('/:clientId', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
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

    // Check if client has any jobs
    const jobCheck = await pool.query(
      'SELECT COUNT(*) as job_count FROM jobs WHERE client_id = $1',
      [clientId]
    );

    if (jobCheck.rows[0].job_count > 0) {
      return res.status(400).json({
        error: 'Cannot delete client with existing jobs. Cancel all jobs first.'
      });
    }

    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);

    res.json({
      message: 'Client deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client: ' + error.message });
  }
});

// GET /api/clients/:clientId/jobs - Get jobs for a specific client
router.get('/:clientId/jobs', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user.userId;

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
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

    const result = await pool.query(`
      SELECT
        j.*,
        MAX(c.name) as name,
        MAX(c.last_name) as last_name,
        MAX(c.email) as client_email,
        MAX(c.phone) as client_phone,
        COUNT(js.id) as service_count,
        COALESCE(SUM(COALESCE(js.custom_price, s.price)), 0) as total_price,
        COALESCE(SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes)), 0) as total_duration
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      LEFT JOIN job_services js ON j.id = js.job_id
      LEFT JOIN services s ON js.service_id = s.id
      WHERE j.client_id = $1 AND j.company_id = $2 AND j.status != 'cancelled'
      GROUP BY j.id
      ORDER BY j.scheduled_date DESC, j.created_at DESC
    `, [clientId, companyId]);

    const jobs = result.rows;

    // Fetch services for each job
    for (let job of jobs) {
      const servicesQuery = `
        SELECT
          js.id,
          js.job_id,
          js.service_id,
          js.custom_title,
          js.custom_price,
          js.custom_duration_minutes,
          COALESCE(js.custom_title, s.title) as service_title,
          COALESCE(js.custom_price, s.price) as price,
          COALESCE(js.custom_duration_minutes, s.duration_minutes) as duration_minutes
        FROM job_services js
        LEFT JOIN services s ON js.service_id = s.id
        WHERE js.job_id = $1
        ORDER BY js.id ASC
      `;
      
      const servicesResult = await pool.query(servicesQuery, [job.id]);
      job.services = servicesResult.rows.map(service => ({
        id: service.id,
        service_id: service.service_id,
        service_title: service.service_title,
        custom_title: service.custom_title,
        price: parseFloat(service.price) || 0,
        duration_minutes: parseInt(service.duration_minutes) || 0
      }));
    }

    res.json({
      jobs: jobs,
      total: jobs.length
    });

  } catch (error) {
    console.error('Error fetching client jobs:', error);
    res.status(500).json({ error: 'Failed to fetch client jobs: ' + error.message });
  }
});

// GET /api/clients/:clientId/invoices - Get all invoices for a client
router.get('/:clientId/invoices', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { clientId } = req.params;

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
        c.name,
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
        client_name: `${invoice.name || ''} ${invoice.last_name || ''}`.trim(),
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

// POST /api/clients/:clientId/invoices - Create a new invoice for a client
router.post('/:clientId/invoices', authenticateToken, async (req, res) => {
  let dbClient;
  try {
    dbClient = await pool.connect();
    await dbClient.query('BEGIN');

    // Ensure invoices.title column exists (migration for DBs created before title was added)
    await dbClient.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS title VARCHAR(50) DEFAULT ''
    `).catch(() => {});
    await dbClient.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
    `).catch(() => {});
    await dbClient.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS show_completed_date BOOLEAN DEFAULT false
    `).catch(() => {});

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { clientId } = req.params;
    const userId = req.user.userId || req.user.id;

    const {
      job_ids,
      title: titleInput,
      issue_date,
      due_date: dueDateBody,
      due_days,
      tax_rate = 0,
      currency = 'DKK',
      notes,
      payment_terms,
      discounts = {},
      description: descriptionInput = '',
      show_completed_date: showCompletedDate = false
    } = req.body;

    let due_date = dueDateBody;
    if (due_days != null && due_days !== '' && issue_date) {
      const d = new Date(issue_date);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + Number(due_days));
        due_date = d.toISOString().split('T')[0];
      }
    }

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({ error: 'At least one job must be selected' });
    }

    if (!issue_date || !due_date) {
      return res.status(400).json({ error: 'Issue date and due date are required' });
    }

    const clientCheck = await dbClient.query(
      'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
      [clientId, companyId]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const jobCheck = await dbClient.query(`
      SELECT j.id, j.title, j.status
      FROM jobs j
      WHERE j.id = ANY($1) AND j.client_id = $2
        AND (j.status = 'completed' OR j.status = 'sub_completed')
        AND j.invoice_id IS NULL
    `, [job_ids, clientId]);

    if (jobCheck.rows.length !== job_ids.length) {
      return res.status(400).json({ error: 'Some jobs not found or not invoiceable (must be completed/sub-completed and not already invoiced)' });
    }

    // Invoice title: default "Invoice", max 30 chars + "..." if over
    const MAX_TITLE_LEN = 30;
    let invoiceTitle = titleInput && String(titleInput).trim();
    if (!invoiceTitle) {
      invoiceTitle = 'Invoice';
    }
    if (invoiceTitle.length > MAX_TITLE_LEN) {
      invoiceTitle = invoiceTitle.slice(0, MAX_TITLE_LEN) + '...';
    }

    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const invoiceCountResult = await dbClient.query(
      'SELECT COUNT(*) as count FROM invoices WHERE company_id = $1 AND invoice_number LIKE $2',
      [companyId, `${year}${month}%`]
    );
    const invoiceNumber = `${year}${month}${String(invoiceCountResult.rows[0].count + 1).padStart(4, '0')}`;

    let subtotal = 0;
    const invoiceItems = [];

    for (const job of jobCheck.rows) {
      const jobServices = await dbClient.query(`
        SELECT
          js.*,
          COALESCE(s.title, js.custom_title) as service_title,
          s.price,
          s.duration_minutes
        FROM job_services js
        LEFT JOIN services s ON js.service_id = s.id
        WHERE js.job_id = $1 AND js.status = 'completed'
      `, [job.id]);

      if (jobServices.rows.length === 0) {
        continue;
      }

      let jobTotal = 0;
      for (const service of jobServices.rows) {
        const quantity = 1;
        const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0);
        jobTotal += unitPrice * quantity;
      }

      const jobDiscount = discounts[job.id] || 0;
      const finalJobTotal = Math.max(0, jobTotal - jobDiscount);

      for (const service of jobServices.rows) {
        const quantity = 1;
        const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0);
        const serviceProportion = jobTotal > 0 ? unitPrice / jobTotal : 0;
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

    if (invoiceItems.length === 0) {
      return res.status(400).json({ error: 'No completed services found for the selected jobs. Only completed services are invoiced.' });
    }

    const taxAmount = subtotal * (tax_rate / 100);
    const total = subtotal + taxAmount;

    const invoiceResult = await dbClient.query(`
      INSERT INTO invoices (
        company_id, client_id, invoice_number, title, issue_date, due_date,
        subtotal, tax_rate, tax_amount, total, currency, notes, payment_terms, created_by,
        description, show_completed_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'draft')
      RETURNING *
    `, [
      companyId, clientId, invoiceNumber, invoiceTitle || '', issue_date, due_date,
      subtotal, tax_rate, taxAmount, total, currency, notes, payment_terms, userId,
      (descriptionInput && String(descriptionInput).trim()) || '', !!showCompletedDate
    ]);

    const invoice = invoiceResult.rows[0];

    for (const item of invoiceItems) {
      await dbClient.query(`
        INSERT INTO invoice_items (
          invoice_id, job_id, service_id, description, quantity, unit_price, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        invoice.id, item.job_id, item.service_id, item.description,
        item.quantity, item.unit_price, item.line_total
      ]);
    }

    const invoicedJobIds = [...new Set(invoiceItems.map(i => i.job_id))];
    await dbClient.query(
      'UPDATE jobs SET invoice_id = $1 WHERE id = ANY($2::int[])',
      [invoice.id, invoicedJobIds]
    );

    await dbClient.query('COMMIT');

    res.status(201).json({
      invoice: {
        ...invoice,
        items: invoiceItems
      }
    });
  } catch (error) {
    if (dbClient) await dbClient.query('ROLLBACK').catch(() => {});
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  } finally {
    if (dbClient) dbClient.release();
  }
});

// GET /api/clients/:clientId/subscriptions - Get subscriptions for a specific client
router.get('/:clientId/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const userId = req.user?.userId || req.user?.id;

    console.log('Fetching subscriptions for client:', { clientId, userId });

    // Get user's active company from JWT token
    const companyAccess = getActiveCompanyId(req);
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
    res.status(500).json({ error: 'Failed to fetch subscriptions: ' + error.message });
  }
});

module.exports = router;
