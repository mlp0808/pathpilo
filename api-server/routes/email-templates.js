const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

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

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }
  return { companyId: activeCompanyId };
};

const DEFAULT_TEMPLATES = {
  change_date: { subject: '', message: '' },
  change_time: { subject: '', message: '' },
  change_employee: { subject: '', message: '' },
  cancel_job: { subject: '', message: '' },
  send_invoice: { subject: '', message: '' }
};

// GET /api/email-templates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(
      'SELECT template_type, subject, message FROM email_templates WHERE company_id = $1',
      [companyId]
    );

    const templates = {};
    result.rows.forEach(row => {
      templates[row.template_type] = {
        subject: row.subject || '',
        message: row.message || ''
      };
    });

    res.json({ templates: { ...DEFAULT_TEMPLATES, ...templates } });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return res.json({ templates: DEFAULT_TEMPLATES });
    }
    res.status(500).json({ error: 'Failed to fetch email templates', details: error.message });
  }
});

// PUT /api/email-templates
router.put('/', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const { templates } = req.body;
    if (!templates || typeof templates !== 'object') {
      return res.status(400).json({ error: 'Templates object required' });
    }

    for (const [templateType, templateData] of Object.entries(templates)) {
      const { subject, message } = templateData;
      await pool.query(
        `INSERT INTO email_templates (company_id, template_type, subject, message)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, template_type)
         DO UPDATE SET subject = EXCLUDED.subject, message = EXCLUDED.message, updated_at = NOW()`,
        [companyId, templateType, subject || '', message || '']
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving email templates:', error);
    res.status(500).json({ error: 'Failed to save email templates', details: error.message });
  }
});

module.exports = router;
