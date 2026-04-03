const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const SUPPORTED_PROVIDERS = ['bank_transfer'];

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

async function ensureIntegrationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_registry (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_integrations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL REFERENCES integration_registry(provider) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, provider)
    );
  `);

  await pool.query(`
    INSERT INTO integration_registry (provider, title, description, capabilities, is_active)
    VALUES (
      'bank_transfer',
      'Bank transfer',
      'Accept invoice payments by manual bank transfer.',
      '["invoice_payment"]'::jsonb,
      TRUE
    )
    ON CONFLICT (provider) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP;
  `);
}

async function getActiveCompanyId(req) {
  const companyId = req.user?.activeCompanyId;
  const userId = req.user?.userId;

  if (!companyId || !userId) {
    return { error: 'No active company found in token', status: 400 };
  }

  const member = await pool.query(
    'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
    [userId, companyId]
  );
  if (member.rows.length === 0) {
    return { error: 'Not a member of the active company', status: 403 };
  }

  return { companyId };
}

function normalizeBankTransferConfig(input) {
  const body = input || {};
  return {
    accountHolder: String(body.accountHolder || '').trim(),
    iban: String(body.iban || '').trim().replace(/\s+/g, ''),
    accountNumber: String(body.accountNumber || '').trim(),
    registrationNumber: String(body.registrationNumber || '').trim(),
  };
}

function validateBankTransferConfig(config, enabled) {
  if (!enabled) return null;

  if (!config.accountHolder) return 'Account holder is required before enabling.';
  if (!config.iban) return 'IBAN is required before enabling.';

  return null;
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureIntegrationTables();
    const companyAccess = await getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }

    const result = await pool.query(
      `
      SELECT
        r.provider,
        r.title,
        r.description,
        r.capabilities,
        COALESCE(ci.enabled, FALSE) AS enabled,
        COALESCE(ci.config, '{}'::jsonb) AS config
      FROM integration_registry r
      LEFT JOIN company_integrations ci
        ON ci.provider = r.provider AND ci.company_id = $1
      WHERE r.provider = ANY($2::text[])
      ORDER BY r.title ASC
      `,
      [companyAccess.companyId, SUPPORTED_PROVIDERS]
    );

    res.json({
      integrations: result.rows.map((row) => ({
        provider: row.provider,
        title: row.title,
        description: row.description,
        capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
        enabled: row.enabled,
        config: row.config || {},
      })),
    });
  } catch (error) {
    console.error('Error loading integrations:', error);
    res.status(500).json({ error: 'Failed to load integrations' });
  }
});

router.put('/:provider/config', authenticateToken, async (req, res) => {
  try {
    await ensureIntegrationTables();
    const companyAccess = await getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }

    const provider = String(req.params.provider || '').trim();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return res.status(404).json({ error: 'Integration provider not found' });
    }

    const enabled = Boolean(req.body?.enabled);
    let config = req.body?.config || {};

    if (provider === 'bank_transfer') {
      config = normalizeBankTransferConfig(config);
      const validationError = validateBankTransferConfig(config, enabled);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
    }

    const upsert = await pool.query(
      `
      INSERT INTO company_integrations (company_id, provider, enabled, config, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (company_id, provider) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        updated_at = CURRENT_TIMESTAMP
      RETURNING company_id, provider, enabled, config, updated_at
      `,
      [companyAccess.companyId, provider, enabled, JSON.stringify(config)]
    );

    res.json({
      message: 'Integration configuration saved',
      integration: {
        provider: upsert.rows[0].provider,
        enabled: upsert.rows[0].enabled,
        config: upsert.rows[0].config || {},
        updatedAt: upsert.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error('Error saving integration configuration:', error);
    res.status(500).json({ error: 'Failed to save integration configuration' });
  }
});

module.exports = router;
