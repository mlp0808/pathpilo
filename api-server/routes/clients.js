const express = require('express');
const { pool } = require('../utils/database');
const {
  ensureInvoiceNumberNullable,
  clearInvoiceNumbersOnDrafts,
  computeNextSequenceNumber,
  resolveInvoiceNumberDisplay,
} = require('../utils/invoiceNumberAllocation');
const secureNotes = require('../utils/secureNotes');
const {
  deactivateSubscriptionsForClient,
  deleteFutureNonCompletedJobsForClient,
} = require('../utils/subscriptionStopCleanup');

const SECURE_NOTE_MAX_LENGTH = 10000;

const DELETED_CLIENT_NAME = 'Deleted client';

// Idempotently make sure the clients table has the columns we need for the
// "anonymize on delete" flow (keep the row + the foreign keys; clear PII).
// Runs once per process the first time the route fires.
let clientPrivacyMigrationDone = false;
async function ensureClientPrivacyColumns() {
  if (clientPrivacyMigrationDone) return;
  clientPrivacyMigrationDone = true;
  try {
    await pool.query(
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
    );
  } catch (e) {
    // Migration is opportunistic. If a permission error happens here we still
    // want the rest of the app to keep working; the next call will retry.
    clientPrivacyMigrationDone = false;
    console.warn('ensureClientPrivacyColumns failed:', e?.message || e);
  }
}

const router = express.Router();
const COUNTRY_TAX_DEFAULTS = {
  DK: 25,
  SE: 25,
  NO: 25,
  DE: 19,
  GB: 20,
  US: 0,
};
const COUNTRY_CURRENCY_DEFAULTS = {
  DK: 'DKK',
  SE: 'SEK',
  NO: 'NOK',
  DE: 'EUR',
  GB: 'GBP',
  US: 'USD',
};

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

// GET /api/clients/invoice-defaults - Country-based tax defaults
router.get('/invoice-defaults', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const companyRes = await pool.query('SELECT country_code FROM companies WHERE id = $1', [companyId]);
    const countryCode = String(companyRes.rows[0]?.country_code || 'DK').toUpperCase();
    const defaultTaxRate = COUNTRY_TAX_DEFAULTS[countryCode] ?? COUNTRY_TAX_DEFAULTS.DK;
    const defaultCurrency = COUNTRY_CURRENCY_DEFAULTS[countryCode] || COUNTRY_CURRENCY_DEFAULTS.DK;
    return res.json({ countryCode, defaultTaxRate, defaultCurrency });
  } catch (error) {
    console.error('Error fetching invoice defaults:', error);
    return res.status(500).json({ error: 'Failed to fetch invoice defaults' });
  }
});

// GET /api/clients/geocode/suggest?q=… — Mapbox forward geocode (token stays server-side)
router.get('/geocode/suggest', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ features: [] });
    }
    const mapboxToken =
      process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return res
        .status(503)
        .json({ error: 'Address search is not configured on the server' });
    }
    let countryParam = '';
    try {
      const cr = await pool.query(
        'SELECT country_code FROM companies WHERE id = $1',
        [companyId],
      );
      const cc = String(cr.rows[0]?.country_code || 'DK')
        .trim()
        .toLowerCase();
      if (cc.length === 2) {
        countryParam = `&country=${encodeURIComponent(cc)}`;
      }
    } catch (_) {
      /* optional */
    }
    const encoded = encodeURIComponent(q);
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
      `?access_token=${mapboxToken}` +
      '&types=address,place,locality,neighborhood,postcode' +
      '&limit=8&autocomplete=true' +
      countryParam;
    const r = await fetch(url);
    if (!r.ok) {
      console.warn('Mapbox geocode suggest failed', r.status);
      return res.json({ features: [] });
    }
    const data = await r.json();
    return res.json({
      features: Array.isArray(data.features) ? data.features : [],
    });
  } catch (e) {
    console.error('geocode suggest error', e);
    return res.status(500).json({ error: 'Address search failed' });
  }
});

// GET /api/clients - Get all clients for company
// Anonymized (deleted_at IS NOT NULL) clients are excluded by default. They
// still exist in the database so older jobs and invoices keep working; pass
// ?include_deleted=true if an admin tool needs to surface them.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    await ensureClientPrivacyColumns();
    const includeDeleted =
      String(req.query.include_deleted || '').toLowerCase() === 'true';

    const result = await pool.query(`
      SELECT
        c.*,
        COUNT(DISTINCT j.id) as job_count,
        MAX(j.scheduled_date) as last_job_date
      FROM clients c
      LEFT JOIN jobs j ON c.id = j.client_id AND j.status != 'cancelled'
      WHERE c.company_id = $1
      ${includeDeleted ? '' : 'AND c.deleted_at IS NULL'}
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
      phone,
      lat,
      lng,
      company_number,
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
      (company_id, name, last_name, client_type, address, zip_code, city, email, phone, lat, lng, company_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      companyId,
      name,
      last_name,
      client_type,
      address,
      zip_code,
      city,
      email,
      phone,
      lat || null,
      lng || null,
      company_number || null,
    ]);

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

// DELETE /api/clients/:clientId - Anonymize client ("right to be forgotten").
//
// The row is intentionally KEPT, but personal data is stripped and
// deleted_at is set. Why:
//   • Jobs (and any future invoice references) still point at this client_id,
//     so reports and history don't break.
//   • Invoices that were issued have already snapshotted the client onto the
//     invoice row (see utils/invoiceSnapshot.js), so the customer-facing
//     document is unaffected.
//   • Privacy-wise the personal data we hold for that client is removed.
//
// Active subscriptions for this client are deactivated, and materialized
// jobs from today onward that are not completed and not on an invoice are
// removed (same rules as stopping a subscription).
//
// If the caller wants a hard delete (only sensible when nothing references
// the row), pass ?hard=true and we attempt a real DELETE; this still fails
// if jobs exist.
router.delete('/:clientId', authenticateToken, async (req, res) => {
  const userId = req.user.userId || req.user?.id || null;

  try {
    const { clientId } = req.params;
    const cid = parseInt(String(clientId), 10);
    if (!Number.isFinite(cid)) {
      return res.status(400).json({ error: 'Invalid client id' });
    }

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    await ensureClientPrivacyColumns();

    const clientCheck = await pool.query(
      'SELECT id, deleted_at FROM clients WHERE id = $1 AND company_id = $2',
      [cid, companyId]
    );
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }
    if (clientCheck.rows[0].deleted_at) {
      return res.json({
        message: 'Client was already anonymized',
        already_deleted: true,
      });
    }

    const wantsHardDelete = String(req.query.hard || '').toLowerCase() === 'true';

    if (wantsHardDelete) {
      const jobCheck = await pool.query(
        'SELECT COUNT(*) as job_count FROM jobs WHERE client_id = $1',
        [cid]
      );
      if (Number(jobCheck.rows[0].job_count) > 0) {
        return res.status(400).json({
          error:
            'Cannot hard-delete a client with existing jobs. Anonymize instead, or remove the jobs first.',
        });
      }
      const pg = await pool.connect();
      try {
        await pg.query('BEGIN');
        await secureNotes.deleteAllNotesForEntity({
          companyId,
          entityType: 'client',
          entityId: cid,
          userId,
          dbClient: pg,
        });
        await pg.query('DELETE FROM clients WHERE id = $1 AND company_id = $2', [cid, companyId]);
        await pg.query('COMMIT');
      } catch (e) {
        try { await pg.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      } finally {
        pg.release();
      }
      return res.json({ message: 'Client deleted', hard: true });
    }

    // Anonymize. Keeps the row + foreign keys; wipes personal data and all
    // encrypted client notes in the same transaction.
    const pg = await pool.connect();
    try {
      await pg.query('BEGIN');
      await secureNotes.deleteAllNotesForEntity({
        companyId,
        entityType: 'client',
        entityId: cid,
        userId,
        dbClient: pg,
      });
      try {
        await deactivateSubscriptionsForClient(pg, companyId, cid);
      } catch (subErr) {
        if (
          subErr.code === '42P01' ||
          String(subErr.message || '').includes('recurring_jobs') ||
          String(subErr.message || '').includes('does not exist')
        ) {
          console.log('⚠️ [clients] Skipping subscription deactivation (recurring_jobs unavailable)');
        } else {
          throw subErr;
        }
      }
      await deleteFutureNonCompletedJobsForClient(pg, companyId, cid);
      await pg.query(
        `UPDATE clients SET
           name = $2,
           last_name = NULL,
           address = NULL,
           zip_code = NULL,
           city = NULL,
           country = NULL,
           email = NULL,
           phone = NULL,
           lat = NULL,
           lng = NULL,
           company_number = NULL,
           billing_address = NULL,
           billing_zip_code = NULL,
           billing_city = NULL,
           billing_email = NULL,
           billing_phone = NULL,
           ean_number = NULL,
           deleted_at = NOW(),
           updated_at = NOW()
         WHERE id = $1 AND company_id = $3`,
        [cid, DELETED_CLIENT_NAME, companyId],
      );
      await pg.query('COMMIT');
    } catch (e) {
      try { await pg.query('ROLLBACK'); } catch (_) { /* ignore */ }
      throw e;
    } finally {
      pg.release();
    }

    res.json({
      message: 'Client personal data removed',
      anonymized: true,
    });
  } catch (error) {
    console.error('Error anonymizing client:', error);
    res
      .status(500)
      .json({ error: 'Failed to remove client: ' + error.message });
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

    const nextPreview = await computeNextSequenceNumber(pool, companyId);
    res.json({
      invoices: result.rows.map(invoice => ({
        ...invoice,
        client_name: `${invoice.name || ''} ${invoice.last_name || ''}`.trim(),
        created_by_name: invoice.created_by_first_name && invoice.created_by_last_name
          ? `${invoice.created_by_first_name} ${invoice.created_by_last_name}`
          : null,
        invoice_number_display: resolveInvoiceNumberDisplay(invoice, nextPreview),
      }))
    });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// POST /api/clients/:clientId/invoices - Create a new invoice for a client
// Snapshot: line items from completed job services; due_date + payment_terms from body;
// client/company display on PDF & views resolve live from clients + companies (billing prefs + business settings).
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
    // Per-invoice snapshot of which payment providers should appear on the
    // PDF / online invoice. NULL = legacy invoices created before this gate;
    // the renderer falls back to "use whatever's enabled at company level".
    await dbClient.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS enabled_payment_methods JSONB
    `).catch(() => {});
    await dbClient.query(
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_numbering_configured BOOLEAN NOT NULL DEFAULT FALSE`
    ).catch(() => {});

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
      // Combined "Reference / PO" line for B2B invoices. Stored in a dedicated
      // column so it can be used by future EHF/PEPPOL e-invoice exports.
      reference_text: referenceTextInput = '',
      show_completed_date: showCompletedDate = false,
      enabled_payment_methods: enabledPaymentMethodsInput,
    } = req.body;

    // ── Gate 1: company must have explicitly chosen its starting invoice
    // number. We never want to silently start a customer at #1 when they
    // came from a previous system that was already at #847.
    //
    // We accept three signals as "configured":
    //   1. The boolean flag column is TRUE (modern saves write this).
    //   2. invoice_next_number is anything other than the schema default of
    //      1 — somebody explicitly set a starting number, even if a legacy
    //      save never wrote the flag.
    //   3. The company has already issued at least one invoice (legacy).
    // If any of these are true, also self-heal the flag column so the UI
    // and other gates stop nagging on subsequent requests.
    const numberingRow = await dbClient.query(
      `SELECT invoice_numbering_configured, COALESCE(invoice_next_number, 1) AS invoice_next_number FROM companies WHERE id = $1`,
      [companyId]
    );
    const numberingFlag = numberingRow.rows[0]?.invoice_numbering_configured === true;
    const explicitStart = Number(numberingRow.rows[0]?.invoice_next_number) > 1;
    let hasIssuedInvoice = false;
    if (!numberingFlag && !explicitStart) {
      const issuedRow = await dbClient.query(
        `SELECT 1 FROM invoices WHERE company_id = $1 AND invoice_number IS NOT NULL LIMIT 1`,
        [companyId]
      );
      hasIssuedInvoice = issuedRow.rows.length > 0;
    }
    const numberingConfigured = numberingFlag || explicitStart || hasIssuedInvoice;
    if (!numberingConfigured) {
      return res.status(400).json({
        error: 'Set up your invoice number start in Settings → Invoice options before creating an invoice.',
        code: 'numbering_not_configured',
      });
    }
    if (!numberingFlag && (explicitStart || hasIssuedInvoice)) {
      await dbClient.query(
        `UPDATE companies SET invoice_numbering_configured = TRUE WHERE id = $1`,
        [companyId]
      ).catch(() => {});
    }

    // ── Gate 2: the per-invoice payment options snapshot. We need at least
    // one method active. Two cases:
    //  • client sent an explicit list → use it (after intersecting with the
    //    company-level enabled providers, so the client can't sneak in a
    //    method that isn't actually configured).
    //  • client sent nothing → default to whatever's enabled at company
    //    level (back-compat with older clients / API consumers).
    const enabledProvidersRow = await dbClient.query(
      `
      SELECT ci.provider
      FROM company_integrations ci
      JOIN integration_registry r ON r.provider = ci.provider
      WHERE ci.company_id = $1
        AND ci.enabled = TRUE
        AND r.capabilities ? 'invoice_payment'
      `,
      [companyId]
    ).catch(() => ({ rows: [] }));
    const companyEnabledProviders = new Set(enabledProvidersRow.rows.map((r) => r.provider));

    let enabledPaymentMethods;
    if (Array.isArray(enabledPaymentMethodsInput)) {
      enabledPaymentMethods = enabledPaymentMethodsInput
        .map((p) => String(p || '').trim())
        .filter((p) => p && companyEnabledProviders.has(p));
    } else {
      enabledPaymentMethods = Array.from(companyEnabledProviders);
    }

    if (enabledPaymentMethods.length === 0) {
      return res.status(400).json({
        error:
          companyEnabledProviders.size === 0
            ? 'Activate at least one payment option in Settings → Invoice options before creating an invoice.'
            : 'Pick at least one payment option for this invoice.',
        code: 'no_payment_methods',
      });
    }

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

    await dbClient
      .query(
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number BIGINT NOT NULL DEFAULT 1`
      )
      .catch(() => {});
    await ensureInvoiceNumberNullable(dbClient);
    await clearInvoiceNumbersOnDrafts(dbClient);

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
        description, show_completed_date, status, enabled_payment_methods, reference_text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'draft', $17::jsonb, $18)
      RETURNING *
    `, [
      companyId, clientId, null, invoiceTitle || '', issue_date, due_date,
      subtotal, tax_rate, taxAmount, total, currency, notes, payment_terms, userId,
      (descriptionInput && String(descriptionInput).trim()) || '', !!showCompletedDate,
      JSON.stringify(enabledPaymentMethods),
      (referenceTextInput && String(referenceTextInput).trim()) || null,
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

// ---------------------------------------------------------------------------
// Encrypted "Standard notes" on a client (multiple notes per client).
//
// Storage: `secure_notes` rows with entity_type='client', entity_id=clientId.
// ---------------------------------------------------------------------------

async function loadClientForCompany(clientId, companyId) {
  const res = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND company_id = $2',
    [clientId, companyId],
  );
  return res.rows[0] || null;
}

function secureNoteUserId(req) {
  return req.user?.id || req.user?.userId || null;
}

function validateSecureNoteBody(note) {
  if (typeof note !== 'string') {
    return { error: 'Note must be a string' };
  }
  if (note.length > SECURE_NOTE_MAX_LENGTH) {
    return {
      error: `Note exceeds maximum length of ${SECURE_NOTE_MAX_LENGTH} characters`,
    };
  }
  return null;
}

router.get('/:clientId/secure-notes', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res
        .status(companyAccess.status)
        .json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const clientId = parseInt(req.params.clientId, 10);
    if (!Number.isFinite(clientId)) {
      return res.status(400).json({ error: 'Invalid client id' });
    }

    const client = await loadClientForCompany(clientId, companyId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const notes = await secureNotes.listNotesForEntity({
      companyId,
      entityType: 'client',
      entityId: clientId,
      userId: secureNoteUserId(req),
    });
    return res.json({ notes });
  } catch (err) {
    console.error('Error listing secure notes:', err);
    return res.status(500).json({
      error: 'Failed to load secure notes',
      ...(process.env.NODE_ENV === 'development' && {
        detail: err.message || String(err),
      }),
    });
  }
});

router.post('/:clientId/secure-notes', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res
        .status(companyAccess.status)
        .json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const clientId = parseInt(req.params.clientId, 10);
    if (!Number.isFinite(clientId)) {
      return res.status(400).json({ error: 'Invalid client id' });
    }

    const bodyErr = validateSecureNoteBody(req.body?.note);
    if (bodyErr) {
      return res.status(400).json({ error: bodyErr.error });
    }

    const client = await loadClientForCompany(clientId, companyId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    try {
      const created = await secureNotes.createNote({
        companyId,
        entityType: 'client',
        entityId: clientId,
        plainText: req.body.note,
        userId: secureNoteUserId(req),
      });
      return res.status(201).json({ note: created });
    } catch (e) {
      if (e.code === 'EMPTY_NOTE') {
        return res.status(400).json({ error: 'Note text is required' });
      }
      throw e;
    }
  } catch (err) {
    console.error('Error creating secure note:', err);
    return res.status(500).json({
      error: 'Failed to save secure note',
      ...(process.env.NODE_ENV === 'development' && {
        detail: err.message || String(err),
      }),
    });
  }
});

router.put(
  '/:clientId/secure-notes/:noteId',
  authenticateToken,
  async (req, res) => {
    try {
      const companyAccess = getActiveCompanyId(req);
      if (companyAccess.error) {
        return res
          .status(companyAccess.status)
          .json({ error: companyAccess.error });
      }
      const companyId = companyAccess.companyId;
      const clientId = parseInt(req.params.clientId, 10);
      const noteId = parseInt(req.params.noteId, 10);
      if (!Number.isFinite(clientId) || !Number.isFinite(noteId)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const bodyErr = validateSecureNoteBody(req.body?.note);
      if (bodyErr) {
        return res.status(400).json({ error: bodyErr.error });
      }

      const client = await loadClientForCompany(clientId, companyId);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      try {
        const updated = await secureNotes.updateNoteById({
          companyId,
          entityType: 'client',
          entityId: clientId,
          noteId,
          plainText: req.body.note,
          userId: secureNoteUserId(req),
        });
        if (!updated) {
          return res.status(404).json({ error: 'Note not found' });
        }
        return res.json({ note: updated });
      } catch (e) {
        if (e.code === 'EMPTY_NOTE') {
          return res.status(400).json({ error: 'Note text is required' });
        }
        throw e;
      }
    } catch (err) {
      console.error('Error updating secure note:', err);
      return res.status(500).json({
        error: 'Failed to save secure note',
        ...(process.env.NODE_ENV === 'development' && {
          detail: err.message || String(err),
        }),
      });
    }
  },
);

router.delete(
  '/:clientId/secure-notes/:noteId',
  authenticateToken,
  async (req, res) => {
    try {
      const companyAccess = getActiveCompanyId(req);
      if (companyAccess.error) {
        return res
          .status(companyAccess.status)
          .json({ error: companyAccess.error });
      }
      const companyId = companyAccess.companyId;
      const clientId = parseInt(req.params.clientId, 10);
      const noteId = parseInt(req.params.noteId, 10);
      if (!Number.isFinite(clientId) || !Number.isFinite(noteId)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const client = await loadClientForCompany(clientId, companyId);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const ok = await secureNotes.deleteNoteById({
        companyId,
        entityType: 'client',
        entityId: clientId,
        noteId,
        userId: secureNoteUserId(req),
      });
      if (!ok) {
        return res.status(404).json({ error: 'Note not found' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting secure note:', err);
      return res.status(500).json({
        error: 'Failed to delete secure note',
        ...(process.env.NODE_ENV === 'development' && {
          detail: err.message || String(err),
        }),
      });
    }
  },
);

module.exports = router;
