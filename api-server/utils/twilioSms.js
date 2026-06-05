/**
 * Twilio SMS delivery. Expects E.164 numbers (e.g. +4550580896 for Denmark).
 */

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

  return null;
}

function estimateSmsSegments(body) {
  const len = String(body || '').length;
  if (len === 0) return 0;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

async function sendSms({ to, body }) {
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
