// Server-side helpers for the lead form (version 3).
//
// Mirrors a subset of app/config/leadForm.ts. The public submit handler uses
// this to map a submission back onto the saved form config so it can write the
// right `leads` columns and keep a readable copy of every answer in `meta`.

// Columns on the `leads` table that a field may map to.
const MAPPING_COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'country',
  'address',
  'zip_code',
  'city',
  'preferred_date',
  'preferred_time',
  'message',
];

const FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'radio',
  'checkboxes',
  'consent',
  'heading',
  'paragraph',
];

// Types that don't collect an answer.
const DISPLAY_ONLY = new Set(['heading', 'paragraph']);

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate the config shape enough to store it safely. We don't deeply migrate
 * legacy forms here — the builder handles that on load. Returns the config as-is
 * if it looks like v3, otherwise null.
 */
function sanitizeConfig(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== 3 || !Array.isArray(raw.fields)) return null;
  return raw;
}

function fieldOptionLabel(field, value) {
  if (!Array.isArray(field.options)) return value;
  const match = field.options.find((o) => o && (o.id === value || o.label === value));
  return match ? match.label : value;
}

/**
 * Map a raw submission ({ values: { [fieldId]: value } }) against the saved
 * config. Returns:
 *   - columns: object of leads-column → value (only mapped, non-empty fields)
 *   - answers: [{ label, value }] readable list for the leads detail view
 *   - missingRequired: [labels] of required fields left blank
 */
function mapSubmission(config, submittedValues) {
  const values = isPlainObject(submittedValues) ? submittedValues : {};
  const columns = {};
  const answers = [];
  const missingRequired = [];

  const fields = Array.isArray(config?.fields) ? config.fields : [];

  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    if (DISPLAY_ONLY.has(field.type)) continue;

    let value = values[field.id];

    // Normalize value into a display string + capture emptiness.
    let isEmpty;
    let displayValue;

    if (field.type === 'checkboxes') {
      const arr = Array.isArray(value) ? value : [];
      const labels = arr.map((v) => fieldOptionLabel(field, v));
      isEmpty = labels.length === 0;
      displayValue = labels.join(', ');
      value = labels.join(', ');
    } else if (field.type === 'consent') {
      const checked = value === true || value === 'true' || value === 'on';
      isEmpty = !checked;
      displayValue = checked ? 'Yes' : '';
      value = checked ? 'Yes' : '';
    } else if (field.type === 'select' || field.type === 'radio') {
      displayValue = value ? fieldOptionLabel(field, value) : '';
      isEmpty = !displayValue;
      value = displayValue;
    } else {
      displayValue = value == null ? '' : String(value).trim();
      isEmpty = displayValue === '';
      value = displayValue;
    }

    if (field.required && isEmpty) {
      missingRequired.push(field.label || field.type);
    }

    if (isEmpty) continue;

    // Mapped fields write directly to a leads column.
    if (field.mapping && MAPPING_COLUMNS.includes(field.mapping) && columns[field.mapping] == null) {
      columns[field.mapping] = value;
    }

    // Everything is also captured as a readable answer (for the detail view),
    // skipping plain mapped customer-name/email/phone to avoid duplication is
    // unnecessary — we keep them so the form is self-describing.
    answers.push({
      label: field.label || field.mapping || field.type,
      value: displayValue,
      type: field.type,
    });
  }

  return { columns, answers, missingRequired };
}

module.exports = {
  MAPPING_COLUMNS,
  FIELD_TYPES,
  sanitizeConfig,
  mapSubmission,
};
