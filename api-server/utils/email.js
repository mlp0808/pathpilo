const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { pool } = require('./database');

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Place inside the main content cell so the standard footer renders inside the white card. */
const STANDARD_FOOTER_PLACEHOLDER = '<!--__VEVAGO_STANDARD_FOOTER__-->';

function normalizeCompanyIdForEmail(companyId) {
  if (companyId == null || companyId === '') return null;
  const n = typeof companyId === 'number' && !Number.isNaN(companyId) ? companyId : parseInt(String(companyId), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function escapeHtmlFooter(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @returns {{ companyName: string, replyTo: string|undefined, contactEmail: string, countryCode: string }}
 */
async function fetchCompanyEmailContext(companyId) {
  const r = await pool.query(
    `SELECT c.name, c.reply_to_email, c.country_code, u.email AS owner_email
     FROM companies c
     LEFT JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1`,
    [companyId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const rawReply = row.reply_to_email != null ? String(row.reply_to_email).trim() : '';
  const owner = row.owner_email != null ? String(row.owner_email).trim() : '';
  const replyTo =
    rawReply && SIMPLE_EMAIL_RE.test(rawReply) ? rawReply : owner && SIMPLE_EMAIL_RE.test(owner) ? owner : undefined;
  const contactEmail = replyTo || owner || '';
  return {
    companyName: row.name || '',
    replyTo,
    contactEmail,
    countryCode: row.country_code ? String(row.country_code).trim().toUpperCase() : 'US',
  };
}

const COUNTRY_TO_LANG = {
  DK: 'da', NO: 'no', SE: 'sv', DE: 'de',
};

const FOOTER_STRINGS = {
  en: {
    noReply: (email) =>
      email
        ? `This message was sent automatically — please do not reply to this email. For questions, contact ${email}.`
        : 'This message was sent automatically — please do not reply to this email.',
    sentWith: (plat, cn) => (cn ? `Sent with ${plat} on behalf of ${cn}.` : `Sent with ${plat}.`),
    sentWithHtml: (plat, platUrl, cn) =>
      cn
        ? `Sent with <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a> on behalf of ${escapeHtmlFooter(cn)}.`
        : `Sent with <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a>.`,
  },
  da: {
    noReply: (email) =>
      email
        ? `Denne besked er sendt automatisk — svar venligst ikke på denne e-mail. Ved spørgsmål, kontakt ${email}.`
        : 'Denne besked er sendt automatisk — svar venligst ikke på denne e-mail.',
    sentWith: (plat, cn) => (cn ? `Sendt med ${plat} på vegne af ${cn}.` : `Sendt med ${plat}.`),
    sentWithHtml: (plat, platUrl, cn) =>
      cn
        ? `Sendt med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a> på vegne af ${escapeHtmlFooter(cn)}.`
        : `Sendt med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a>.`,
  },
  no: {
    noReply: (email) =>
      email
        ? `Denne meldingen ble sendt automatisk — vennligst ikke svar på denne e-posten. For spørsmål, kontakt ${email}.`
        : 'Denne meldingen ble sendt automatisk — vennligst ikke svar på denne e-posten.',
    sentWith: (plat, cn) => (cn ? `Sendt med ${plat} på vegne av ${cn}.` : `Sendt med ${plat}.`),
    sentWithHtml: (plat, platUrl, cn) =>
      cn
        ? `Sendt med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a> på vegne av ${escapeHtmlFooter(cn)}.`
        : `Sendt med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a>.`,
  },
  sv: {
    noReply: (email) =>
      email
        ? `Det här meddelandet skickades automatiskt — vänligen svara inte på detta e-postmeddelande. Vid frågor, kontakta ${email}.`
        : 'Det här meddelandet skickades automatiskt — vänligen svara inte på detta e-postmeddelande.',
    sentWith: (plat, cn) => (cn ? `Skickat med ${plat} på uppdrag av ${cn}.` : `Skickat med ${plat}.`),
    sentWithHtml: (plat, platUrl, cn) =>
      cn
        ? `Skickat med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a> på uppdrag av ${escapeHtmlFooter(cn)}.`
        : `Skickat med <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a>.`,
  },
  de: {
    noReply: (email) =>
      email
        ? `Diese Nachricht wurde automatisch gesendet — bitte antworten Sie nicht auf diese E-Mail. Bei Fragen wenden Sie sich an ${email}.`
        : 'Diese Nachricht wurde automatisch gesendet — bitte antworten Sie nicht auf diese E-Mail.',
    sentWith: (plat, cn) => (cn ? `Gesendet mit ${plat} im Namen von ${cn}.` : `Gesendet mit ${plat}.`),
    sentWithHtml: (plat, platUrl, cn) =>
      cn
        ? `Gesendet mit <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a> im Namen von ${escapeHtmlFooter(cn)}.`
        : `Gesendet mit <a href="${escapeHtmlFooter(platUrl)}" style="color:#6b7280;text-decoration:underline;">${escapeHtmlFooter(plat)}</a>.`,
  },
};

function buildStandardFooterParts(contactEmail, companyName, countryCode) {
  const plat = process.env.PLATFORM_NAME || 'PathPilo';
  const platUrl = process.env.PLATFORM_URL || 'https://pathpilo.com';
  const lang = COUNTRY_TO_LANG[String(countryCode || '').toUpperCase()] || 'en';
  const strings = FOOTER_STRINGS[lang] || FOOTER_STRINGS.en;
  const email = contactEmail && SIMPLE_EMAIL_RE.test(String(contactEmail).trim()) ? String(contactEmail).trim() : '';
  const cn = companyName && String(companyName).trim();
  const line1 = strings.noReply(email);
  const line2Plain = strings.sentWith(plat, cn);
  const line2Html = strings.sentWithHtml(plat, platUrl, cn);
  const footerHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
  <tr><td style="height:1px;line-height:1px;font-size:0;background:#e5e7eb;">&nbsp;</td></tr>
  <tr><td style="padding:14px 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <p style="margin:0 0 5px;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtmlFooter(line1)}</p>
    <p style="margin:0;font-size:11px;line-height:1.5;color:#b0b8c4;">${line2Html}</p>
  </td></tr>
</table>`;
  const footerText = `${line1}\n\n${line2Plain}`;
  return { footerHtml, footerText };
}

function injectHtmlFooter(html, footerHtml) {
  if (!html || !footerHtml) return html;
  const s = String(html);
  const lower = s.toLowerCase();
  const idx = lower.lastIndexOf('</body>');
  if (idx !== -1) {
    return `${s.slice(0, idx)}\n${footerHtml}\n${s.slice(idx)}`;
  }
  return `${s}\n${footerHtml}`;
}

function applyFooterToHtml(html, footerHtml) {
  if (!html || !footerHtml) return html;
  const s = String(html);
  if (s.includes(STANDARD_FOOTER_PLACEHOLDER)) {
    return s.split(STANDARD_FOOTER_PLACEHOLDER).join(footerHtml);
  }
  return injectHtmlFooter(s, footerHtml);
}

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
      client: nodemailer.createTransport({
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

/** Resend free tier: ~5 requests/sec — serialize sends and space them out. */
let resendQueueTail = Promise.resolve();
let lastResendApiAt = 0;

function enqueueResendSend(sendFn) {
  const gapMs = Math.max(100, parseInt(process.env.RESEND_MIN_GAP_MS || '220', 10));
  const run = resendQueueTail.then(async () => {
    const now = Date.now();
    // Skip gap before the very first Resend call (lastResendApiAt === 0)
    if (lastResendApiAt > 0) {
      const wait = Math.max(0, lastResendApiAt + gapMs - now);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    try {
      return await sendFn();
    } finally {
      lastResendApiAt = Date.now();
    }
  });
  resendQueueTail = run.catch(() => {});
  return run;
}

async function sendEmail(options) {
  let { to, cc, from, fromName, replyTo, subject, text, html, attachments, companyId, skipFooter } = options;

  let footerContact = null;
  let footerCompanyName = null;
  let footerCountryCode = 'US';
  const cid = normalizeCompanyIdForEmail(companyId);
  if (cid != null) {
    try {
      const ctx = await fetchCompanyEmailContext(cid);
      if (ctx) {
        if (ctx.replyTo) replyTo = ctx.replyTo;
        footerContact = ctx.contactEmail;
        footerCompanyName = ctx.companyName;
        footerCountryCode = ctx.countryCode || 'US';
      }
    } catch (e) {
      console.warn('[email] fetchCompanyEmailContext failed:', e.message || e);
    }
  }

  if (!skipFooter && (html || text)) {
    const { footerHtml, footerText } = buildStandardFooterParts(footerContact, footerCompanyName, footerCountryCode);
    if (html) html = applyFooterToHtml(html, footerHtml);
    if (text) text = `${text}\n\n${footerText}`;
    else if (html && !text) {
      text = footerText;
    }
  }

  const fromEmail = from || process.env.FROM_EMAIL || 'noreply@yourapp.com';
  const resolvedFromName = fromName ?? process.env.FROM_NAME;
  const fromAddr = resolvedFromName ? `"${String(resolvedFromName).replace(/"/g, '')}" <${fromEmail}>` : fromEmail;
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
        type: att.type || att.contentType || 'application/octet-stream',
        disposition: att.disposition || 'attachment',
        content_id: att.content_id || att.cid
      };
    });
    return enqueueResendSend(async () => {
      try {
        const result = await emailTransporter.client.emails.send({
          from: fromAddr,
          to: Array.isArray(to) ? to : [to],
          cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
          subject,
          text: text || undefined,
          html: html || undefined,
          attachments: att.length ? att : undefined,
          replyTo: replyTo || undefined,
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
    });
  }

  const mailOptions = {
    from: fromAddr,
    to,
    cc: cc || undefined,
    subject,
    text,
    html,
    attachments,
    replyTo: replyTo || undefined,
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

module.exports = { sendEmail, STANDARD_FOOTER_PLACEHOLDER };
