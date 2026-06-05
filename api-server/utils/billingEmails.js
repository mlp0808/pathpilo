/**
 * Transactional billing emails (trial started, etc.).
 * Reuses the branded white-card shell from automatedEmails so styling matches
 * the rest of PathPilo's outbound mail.
 */

const { sendEmail } = require('./email');
const { buildBrandedAutomatedEmail, getPlatformWatermarkLogoUrl } = require('./automatedEmails');

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateLong(iso, locale = 'en-GB') {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatMoney(amount, currency = 'GBP') {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Send the "your free trial has started" email.
 * @param {object} args
 * @param {string} args.to - recipient email
 * @param {string} args.firstName - owner first name
 * @param {string} args.companyName - their company name
 * @param {number} args.companyId - for footer context
 * @param {string} args.trialEndIso - ISO date the trial ends / first charge
 * @param {number} args.amount - first charge amount (major units)
 * @param {string} args.currency - e.g. 'GBP'
 * @param {string} args.interval - 'month' | 'year'
 * @param {string} args.billingUrl - link to billing settings
 */
async function sendTrialStartedEmail(args) {
  const {
    to,
    firstName,
    companyName,
    companyId,
    trialEndIso,
    amount,
    currency = 'GBP',
    interval = 'month',
    billingUrl,
  } = args;

  if (!to) return;

  const platform = process.env.PLATFORM_NAME || 'PathPilo';
  const greetingName = firstName && String(firstName).trim() ? String(firstName).trim() : 'there';
  const trialEndLabel = formatDateLong(trialEndIso);
  const priceLabel = amount != null ? formatMoney(amount, currency) : '';
  const intervalLabel = interval === 'year' ? 'per year' : 'per month';

  const features = [
    'Unlimited team members & roles',
    'Team scheduling & assignments',
    'Team performance overview',
    'Everything in the Solo plan',
  ];

  const featureRows = features
    .map(
      (f) => `
      <tr>
        <td style="padding:4px 0;font-size:14px;line-height:1.5;color:#374151;">
          <span style="color:#16a34a;font-weight:700;margin-right:8px;">&#10003;</span>${escapeHtml(f)}
        </td>
      </tr>`
    )
    .join('');

  const ctaButton = billingUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
         <tr>
           <td style="border-radius:10px;background:#111827;">
             <a href="${escapeHtml(billingUrl)}"
                style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
               Manage your plan &amp; payment
             </a>
           </td>
         </tr>
       </table>`
    : '';

  const chargeLine =
    trialEndLabel && priceLabel
      ? `Your card won't be charged during the trial. On <strong>${escapeHtml(
          trialEndLabel
        )}</strong> your subscription begins at <strong>${escapeHtml(priceLabel)}</strong> ${escapeHtml(
          intervalLabel
        )}, unless you cancel before then.`
      : trialEndLabel
        ? `Your card won't be charged during the trial. Your subscription begins on <strong>${escapeHtml(
            trialEndLabel
          )}</strong> unless you cancel before then.`
        : `Your card won't be charged during the trial. You can cancel anytime before it ends.`;

  const innerHtml = `
    <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">Your 14-day free trial has started 🎉</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
      Hi ${escapeHtml(greetingName)}, ${escapeHtml(companyName || 'your company')} is now on the
      <strong>Company plan</strong> with full Pro access. Here's what you've unlocked:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:0 0 4px;border:1px solid #e5e7eb;border-radius:12px;">
      <tr><td style="padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${featureRows}</table>
      </td></tr>
    </table>

    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#374151;">${chargeLine}</p>

    ${ctaButton}

    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
      Need a hand getting set up? Just reply and our team will help.
    </p>
  `;

  const bodyPlain = [
    `Your 14-day free trial has started.`,
    ``,
    `Hi ${greetingName}, ${companyName || 'your company'} is now on the Company plan with full Pro access.`,
    ``,
    `You've unlocked: ${features.join(', ')}.`,
    ``,
    trialEndLabel && priceLabel
      ? `Your card won't be charged during the trial. On ${trialEndLabel} your subscription begins at ${priceLabel} ${intervalLabel}, unless you cancel before then.`
      : `Your card won't be charged during the trial. You can cancel anytime before it ends.`,
    billingUrl ? `\nManage your plan: ${billingUrl}` : '',
  ].join('\n');

  const branded = buildBrandedAutomatedEmail({
    companyName: platform,
    bodyPlain,
    innerHtml,
    watermarkLogoUrl: getPlatformWatermarkLogoUrl ? getPlatformWatermarkLogoUrl() : null,
  });

  await sendEmail({
    to,
    subject: `Your ${platform} free trial has started`,
    fromName: platform,
    text: branded.text,
    html: branded.html,
    companyId,
  });
}

module.exports = { sendTrialStartedEmail };
