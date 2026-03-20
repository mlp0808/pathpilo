const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const emailTransporter = (() => {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    console.log('✅ [email] Using Resend API for delivery (RESEND_API_KEY set)');
    return { isResend: true, isJsonTransport: false, client: new Resend(resendApiKey) };
  }
  const host = process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (host && user && pass) {
    console.log('✅ [email] Using SMTP for delivery:', host);
    return {
      isResend: false,
      isJsonTransport: false,
      client: nodemailer.createTransporter({
        host,
        port: port || 587,
        secure: (port || 587) === 465,
        auth: { user, pass }
      })
    };
  }
  console.warn('⚠️ [email] No provider configured. Emails will NOT be sent (JSON transport only).');
  console.warn('   To send emails: set RESEND_API_KEY (Resend API) or EMAIL_HOST + EMAIL_USER + EMAIL_PASS (SMTP).');
  return {
    isResend: false,
    isJsonTransport: true,
    client: nodemailer.createTransport({ jsonTransport: true })
  };
})();

async function sendEmail(options) {
  const { to, cc, from, subject, text, html, attachments } = options;
  const fromEmail = from || process.env.FROM_EMAIL || 'noreply@yourapp.com';
  const fromName = process.env.FROM_NAME;
  const fromAddr = fromName ? `"${fromName.replace(/"/g, '')}" <${fromEmail}>` : fromEmail;
  const transportLabel = emailTransporter.isResend ? 'Resend' : (emailTransporter.isJsonTransport ? 'JSON (no delivery)' : 'SMTP');
  console.log(`📧 [email] Sending to ${to} (${transportLabel})...`);

  if (emailTransporter.isResend) {
    const att = (attachments || []).map(att => {
      let content = att.content;
      if (Buffer.isBuffer(content)) {
        content = content.toString('base64');
      }
      return {
        filename: att.filename,
        content,
        type: att.type,
        disposition: att.disposition || 'attachment',
        content_id: att.content_id || att.cid
      };
    });
    try {
      const result = await emailTransporter.client.emails.send({
        from: fromAddr,
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        subject,
        text: text || undefined,
        html: html || undefined,
        attachments: att.length ? att : undefined
      });
      if (result.error) {
        console.error('❌ [email] Resend error:', result.error.message || result.error);
        throw result.error;
      }
      console.log('✅ [email] Sent via Resend, id:', result.data?.id || 'ok');
      return result;
    } catch (err) {
      console.error('❌ [email] Resend failed:', err.message || err);
      throw err;
    }
  }

  const mailOptions = {
    from: fromAddr,
    to,
    cc: cc || undefined,
    subject,
    text,
    html,
    attachments
  };
  try {
    const info = await emailTransporter.client.sendMail(mailOptions);
    if (emailTransporter.isJsonTransport) {
      console.warn('⚠️ [email] JSON transport used – email was NOT delivered. Configure RESEND_API_KEY or SMTP to send real email.');
    } else {
      console.log('✅ [email] Sent via SMTP:', info.messageId || 'ok');
    }
    return info;
  } catch (err) {
    console.error('❌ [email] Send failed:', err.message || err);
    throw err;
  }
}

module.exports = { sendEmail };
