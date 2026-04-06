const path = require('path');
// Root .env first (shared secrets like ADMIN_*), then api-server/.env overrides for local API
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const app = express();
const port = process.env.API_PORT || 8000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : ['http://localhost:3000', 'http://localhost:3002'], // Allow Next.js dev and new frontend
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Email configuration (copied from main server)
const emailTransporter = (() => {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    console.log('✅ Using Resend for email delivery');
    return new Resend(resendApiKey);
  }

  const host = process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (host && user && pass) {
    console.log('📧 Using SMTP for email delivery');
    return nodemailer.createTransporter({
      host,
      port: port || 587,
      secure: (port || 587) === 465,
      auth: { user, pass }
    });
  }

  console.log('⚠️ No email provider configured. Using JSON transport (emails will not be delivered).');
  console.log('   Set RESEND_API_KEY for production email delivery.');
  return nodemailer.createTransport({ jsonTransport: true });
})();

// Unified email sending function
async function sendEmail(options) {
  const { to, from, subject, text, html, attachments } = options;

  try {
    if (emailTransporter.constructor.name === 'Resend') {
      // Resend API
      const result = await emailTransporter.emails.send({
        from: from || process.env.FROM_EMAIL || 'noreply@yourapp.com',
        to,
        subject,
        text,
        html,
        attachments: attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          type: att.type,
          disposition: att.disposition || 'attachment'
        }))
      });
      console.log('📧 Email sent via Resend:', result.data?.id);
      return result;
    } else {
      // Nodemailer (SMTP or JSON)
      const mailOptions = {
        from: from || process.env.FROM_EMAIL || 'noreply@yourapp.com',
        to,
        subject,
        text,
        html,
        attachments
      };

      const info = await emailTransporter.sendMail(mailOptions);
      console.log('📧 Email sent via SMTP:', info.messageId);
      return info;
    }
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Import route modules
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const leadRoutes = require('./routes/leads');
const leadFormRoutes = require('./routes/lead-form');
const publicLeadFormRoutes = require('./routes/public-lead-forms');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const jobRoutes = require('./routes/jobs');
const clientRoutes = require('./routes/clients');
const invoiceRoutes = require('./routes/invoices');
const subscriptionRoutes = require('./routes/subscriptions');
const integrationRoutes = require('./routes/integrations');
const futureRoutes = require('./routes/future');
const workHoursRoutes = require('./routes/work-hours');
const adminRoutes = require('./routes/admin');
const companyUsersRoutes = require('./routes/company-users');
const emailTemplateRoutes = require('./routes/email-templates');
const videoGuideRoutes = require('./routes/video-guides');
const dailyRoutesRoutes = require('./routes/daily-routes');
const employeeLeaveRoutes = require('./routes/employee-leave');
const invitationRoutes = require('./routes/invitations');
const trialRoutes = require('./routes/trial');
const publicInvoiceRoutes = require('./routes/public-invoices');
const { runAutomatedEmailTick } = require('./utils/automatedEmails');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/lead-form', leadFormRoutes);
app.use('/api/public', publicLeadFormRoutes);
app.use('/api/public/invoices', publicInvoiceRoutes);
// Admin routes must be mounted BEFORE /api/admin/users so that
// GET /api/admin/users hits the admin list endpoint, not the company-users route.
app.use('/api/admin', adminRoutes);
app.use('/api/users', companyUsersRoutes); // Company users
app.use('/api/user', companyUsersRoutes); // User profile (PUT /api/user/profile)
app.use('/api/services', serviceRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/work-hours', workHoursRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/video-guides', videoGuideRoutes);
app.use('/api/daily-routes', dailyRoutesRoutes);
app.use('/api/employee-leave', employeeLeaveRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/trial', trialRoutes);
app.use('/api', futureRoutes); // Future endpoints (maps, notifications, etc.)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'PathPilo API',
    version: '1.0.0',
    description: 'API for PathPilo job management platform',
    endpoints: {
      auth: '/api/auth',
      companies: '/api/companies',
      leads: '/api/leads',
      users: '/api/admin/users',
      services: '/api/services',
      jobs: '/api/jobs',
      clients: '/api/clients',
      subscriptions: '/api/subscriptions',
      health: '/api/health'
    }
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 PathPilo API Server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`📚 API documentation: http://localhost:${port}/`);
  runAutomatedEmailTick(pool);
  setInterval(() => {
    runAutomatedEmailTick(pool);
  }, 60 * 1000);
});

// Export for testing
module.exports = app;
