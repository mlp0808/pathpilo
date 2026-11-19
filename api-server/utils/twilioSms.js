/**
 * Twilio SMS delivery. Expects E.164 numbers (e.g. +4550580896 for Denmark).
 */

const { outboundBlockReason } = require('./demoGuard');

let twilioClient = null;

function isTwilioConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

function getTwilioClient() {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)');
  }
  if (!twilioClient) {
    // eslint-disable-next-line global-require
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

/** Strip formatting and validate E.164 (+ followed by 8–15 digits). */
function normalizePhoneToE164(raw, defaultCountryCode = 'DK') {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (!s) return null;

  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    const digits = s.slice(1);
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }

  const cc = String(defaultCountryCode || 'DK').trim().toUpperCase();
  if (cc === 'DK' && /^\d{8}$/.test(s)) return `+45${s}`;
  if (cc === 'SE' && /^\d{6,10}$/.test(s)) return `+46${s.replace(/^0+/, '')}`;
  if (cc === 'NO' && /^\d{8}$/.test(s)) return `+47${s}`;
  if (cc === 'GB' && /^0?\d{10,11}$/.test(s)) return `+44${s.replace(/^0+/, '')}`;
  // Countries that write national numbers with a leading trunk 0.
  if (cc === 'IE' && /^0?\d{8,9}$/.test(s)) return `+353${s.replace(/^0+/, '')}`;
  if (cc === 'AU' && /^0?\d{9}$/.test(s)) return `+61${s.replace(/^0+/, '')}`;
  if (cc === 'NZ' && /^0?\d{8,9}$/.test(s)) return `+64${s.replace(/^0+/, '')}`;

  return null;
}

function estimateSmsSegments(body) {
  const len = String(body || '').length;
  if (len === 0) return 0;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

async function sendSms({ to, body, companyId }) {
  const blockedBecause = await outboundBlockReason({ companyId });
  if (blockedBecause) {
    console.log(`🛑 [sms] Not sent (${blockedBecause})`);
    return { sid: 'demo-blocked', to: String(to || ''), segments: 0, blocked: true };
  }

  const normalized = normalizePhoneToE164(to);
  if (!normalized) {
    throw new Error(`Invalid phone number: ${to}`);
  }

  const from = String(process.env.TWILIO_PHONE_NUMBER || '').trim();
  const client = getTwilioClient();

  console.log(`📱 [sms] Sending to ${normalized} (Twilio)...`);
  const msg = await client.messages.create({
    to: normalized,
    from,
    body: String(body || '').trim(),
  });

  const segments = Number(msg.numSegments) || estimateSmsSegments(body);
  console.log(`✅ [sms] Sent via Twilio, sid: ${msg.sid}, segments: ${segments}`);
  return { sid: msg.sid, to: normalized, segments };
}

module.exports = {
  isTwilioConfigured,
  normalizePhoneToE164,
  estimateSmsSegments,
  sendSms,
};
