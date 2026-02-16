const { Resend } = require('resend');
const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('=== EMAIL CONFIGURATION TEST ===\n');

console.log('Environment variables:');
console.log('RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);
console.log('EMAIL_HOST set:', !!process.env.EMAIL_HOST);
console.log('EMAIL_USER set:', !!process.env.EMAIL_USER);
console.log('EMAIL_PASS set:', !!process.env.EMAIL_PASS);

console.log('\nDetermining email transporter...');

// Test what transporter would be used (same logic as server.js)
const emailTransporter = (() => {
  const resendApiKey = process.env.RESEND_API_KEY;

  // Use Resend if API key is available (recommended for production)
  if (resendApiKey) {
    console.log('✅ Using Resend for email delivery');
    return new Resend(resendApiKey);
  }

  // Fallback to SMTP if configured
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

  // Final fallback: JSON transport for local development
  console.log('⚠️ No email provider configured. Using JSON transport (emails will not be delivered).');
  console.log('   Set RESEND_API_KEY for production email delivery.');
  return nodemailer.createTransport({ jsonTransport: true });
})();

console.log('Transporter type:', emailTransporter.constructor.name);
console.log('\n=== CONFIGURATION COMPLETE ===');
