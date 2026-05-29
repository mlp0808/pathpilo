/**
 * Manual job customer emails (date change, on-the-way, cancel, etc.)
 * Loads per-company templates from email_templates and applies placeholders.
 */

const DEFAULT_ON_THE_WAY = {
  subject: 'We are on our way',
  message:
    'Hi {Client first name},\n\n' +
    'We are on our way to you right now and expect to arrive in about {Selected minutes} minutes.\n\n' +
    'The agreed location is {Client location}.\n\n' +
    'Kind regards,\n' +
    '{Owner name}\n' +
    '{Company name}',
};

const DEFAULTS_BY_TYPE = {
  on_the_way: DEFAULT_ON_THE_WAY,
};

function timePart(value) {
  if (!value) return '';
  const s = String(value);
  return s.length >= 5 ? s.substring(0, 5) : s;
}

function formatJobDate(raw) {
  if (!raw) return '';
  const s = String(raw).split('T')[0].split(' ')[0];
  const d = new Date(s + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return s;
  try {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return s;
  }
}

function formatNowDate() {
  try {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatNowTime() {
  try {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function buildClientLocation(row) {
  const street = row?.address || row?.client_address || '';
  const zip = row?.zip_code || row?.client_zip || '';
  const city = row?.city || row?.client_city || '';
  const cityLine = [zip, city].filter(Boolean).join(' ').trim();
  return [street, cityLine].filter(Boolean).join(', ').trim();
}

/**
 * Apply placeholders for manual job emails (matches web app tags where possible).
 */
function applyManualJobTemplate(text, data) {
  if (!text) return '';
  const clientFirst = (data.clientFirstName || '').trim() || 'there';
  const clientLast = (data.clientLastName || '').trim();
  const clientName =
    (data.clientName || '').trim() ||
    [clientFirst, clientLast].filter(Boolean).join(' ').trim() ||
    'Customer';

  const selectedMinutes =
    data.selectedMinutes != null && data.selectedMinutes !== ''
      ? String(data.selectedMinutes)
      : '';

  const tf = (data.jobTimeFrom || '').toString().trim();
  const tt = (data.jobTimeTo || '').toString().trim();
  let jobTimeSmart = '';
  if (tf && tt && tf !== tt) jobTimeSmart = `${tf} – ${tt}`;
  else jobTimeSmart = tf || tt || '';

  return String(text)
    .replace(/{Client name}/g, clientName)
    .replace(/{Client first name}/g, clientFirst)
    .replace(/{Client last name}/g, clientLast)
    .replace(/{Job date}/g, data.jobDate || '')
    .replace(/{Job old date}/g, data.jobOldDate || '')
    .replace(/{Job new date}/g, data.jobNewDate || '')
    .replace(/{Job time}/g, jobTimeSmart)
    .replace(/{Job time from}/g, tf)
    .replace(/{Job time to}/g, tt)
    .replace(/{Job old time}/g, data.jobOldTime || '')
    .replace(/{Job new time}/g, data.jobNewTime || '')
    .replace(/{Employee name}/g, data.employeeName || '')
    .replace(/{Employee old name}/g, data.employeeOldName || '')
    .replace(/{Employee new name}/g, data.employeeNewName || '')
    .replace(/{User name}/g, data.userName || 'We')
    .replace(/{Current user}/g, data.userName || 'We')
    .replace(/{Company name}/g, data.companyName || '')
    .replace(/{Company owner}/g, data.companyOwner || '')
    .replace(/{Owner name}/g, data.companyOwner || data.userName || '')
    .replace(/{Job address}/g, data.jobAddress || '')
    .replace(/{Job city}/g, data.jobCity || '')
    .replace(/{Client location}/g, data.clientLocation || data.jobAddress || '')
    .replace(/{Current date}/g, data.currentDate || formatNowDate())
    .replace(/{Current time}/g, data.currentTime || formatNowTime())
    .replace(/{Selected minutes}/g, selectedMinutes)
    .replace(/{Job services}/g, data.jobServices || '')
    .replace(/{Job total price}/g, data.jobTotalPrice != null ? String(data.jobTotalPrice) : '—');
}

async function getCompanyEmailTemplate(pool, companyId, templateType) {
  const fallback = DEFAULTS_BY_TYPE[templateType] || { subject: '', message: '' };
  try {
    const res = await pool.query(
      'SELECT subject, message FROM email_templates WHERE company_id = $1 AND template_type = $2',
      [companyId, templateType]
    );
    const row = res.rows[0];
    if (!row) return { ...fallback };
    return {
      subject: (row.subject && String(row.subject).trim()) || fallback.subject,
      message: (row.message && String(row.message).trim()) || fallback.message,
    };
  } catch {
    return { ...fallback };
  }
}

async function renderManualJobEmail(pool, companyId, templateType, data) {
  const template = await getCompanyEmailTemplate(pool, companyId, templateType);
  return {
    subject: applyManualJobTemplate(template.subject, data),
    message: applyManualJobTemplate(template.message, data),
  };
}

module.exports = {
  DEFAULT_ON_THE_WAY,
  applyManualJobTemplate,
  getCompanyEmailTemplate,
  renderManualJobEmail,
  buildClientLocation,
  formatJobDate,
  timePart,
};
