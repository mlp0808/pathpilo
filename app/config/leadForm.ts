// Shared lead-form configuration model (version 3).
//
// The whole builder + public form render from a single ordered `fields` array.
// Built-in fields carry a `mapping` to a real `leads` column; everything else
// is stored under `meta.answers` so it still shows up in the leads area.
//
// This file is the single source of truth for the frontend. The API mirrors a
// subset of it in `api-server/utils/leadForm.js`.

export type LeadFieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'radio'
  | 'checkboxes'
  | 'consent'
  | 'heading'
  | 'paragraph'

export type LeadFieldMapping =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'country'
  | 'address'
  | 'zip_code'
  | 'city'
  | 'preferred_date'
  | 'preferred_time'
  | 'message'

export type LeadFieldOption = { id: string; label: string }

export type LeadField = {
  id: string
  type: LeadFieldType
  label: string
  placeholder?: string
  help?: string
  required?: boolean
  width?: 'full' | 'half'
  /** Built-in fields write straight into a leads column. Custom fields omit this. */
  mapping?: LeadFieldMapping | null
  /** Choice fields (select / radio / checkboxes). */
  options?: LeadFieldOption[]
  /** Display-only content for heading / paragraph / consent. */
  content?: string
}

export type LeadFormTheme = {
  /** Accent / button color as a hex string. */
  accent: string
  /** Corner radius style for inputs and buttons. */
  corners: 'sharp' | 'rounded' | 'pill'
  /** Page background behind the card. */
  background: 'white' | 'tint'
}

export type LeadFormConfig = {
  version: 3
  title: string
  description: string
  fields: LeadField[]
  submitText: string
  successTitle: string
  successMessage: string
  /** Optional internal address to be notified when a lead comes in. */
  notifyEmail: string
  theme: LeadFormTheme
}

// ─────────────────────────────────────────────────────────────────────────────
// Field type catalogue (drives the builder's "Add field" palette)
// ─────────────────────────────────────────────────────────────────────────────

export type FieldTypeMeta = {
  type: LeadFieldType
  /** Human label for the palette. */
  label: string
  /** One-line hint. */
  hint: string
  /** Whether this type has user-editable options. */
  hasOptions?: boolean
  /** Whether this type collects an answer (false for heading/paragraph). */
  collectsValue?: boolean
}

export const FIELD_TYPES: FieldTypeMeta[] = [
  { type: 'short_text', label: 'Short text', hint: 'A single line of text', collectsValue: true },
  { type: 'long_text', label: 'Paragraph', hint: 'A multi-line message', collectsValue: true },
  { type: 'email', label: 'Email', hint: 'Email address with validation', collectsValue: true },
  { type: 'phone', label: 'Phone', hint: 'Phone number', collectsValue: true },
  { type: 'number', label: 'Number', hint: 'Numeric value', collectsValue: true },
  { type: 'date', label: 'Date', hint: 'Date picker', collectsValue: true },
  { type: 'time', label: 'Time', hint: 'Time picker', collectsValue: true },
  { type: 'select', label: 'Dropdown', hint: 'Pick one from a list', hasOptions: true, collectsValue: true },
  { type: 'radio', label: 'Single choice', hint: 'Pick one (buttons)', hasOptions: true, collectsValue: true },
  { type: 'checkboxes', label: 'Multiple choice', hint: 'Pick several', hasOptions: true, collectsValue: true },
  { type: 'consent', label: 'Consent', hint: 'A required checkbox (terms, privacy)', collectsValue: true },
  { type: 'heading', label: 'Section title', hint: 'A bold heading to group fields', collectsValue: false },
  { type: 'paragraph', label: 'Text block', hint: 'Helper text or instructions', collectsValue: false },
]

export function fieldTypeMeta(type: LeadFieldType): FieldTypeMeta {
  return FIELD_TYPES.find((f) => f.type === type) || FIELD_TYPES[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// IDs + factory helpers
// ─────────────────────────────────────────────────────────────────────────────

export function genId(prefix = 'f'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function makeField(type: LeadFieldType): LeadField {
  const base: LeadField = {
    id: genId(),
    type,
    label: defaultLabelForType(type),
    required: false,
    width: 'full',
    mapping: null,
  }
  if (type === 'select' || type === 'radio' || type === 'checkboxes') {
    base.options = [
      { id: genId('o'), label: 'Option 1' },
      { id: genId('o'), label: 'Option 2' },
    ]
  }
  if (type === 'consent') {
    base.required = true
    base.content = 'I agree to be contacted about my request.'
  }
  if (type === 'heading') base.content = 'Section title'
  if (type === 'paragraph') base.content = 'Add a short note for the people filling out this form.'
  return base
}

function defaultLabelForType(type: LeadFieldType): string {
  switch (type) {
    case 'short_text':
      return 'Short answer'
    case 'long_text':
      return 'Your message'
    case 'email':
      return 'Email'
    case 'phone':
      return 'Phone'
    case 'number':
      return 'Number'
    case 'date':
      return 'Preferred date'
    case 'time':
      return 'Preferred time'
    case 'select':
      return 'Choose an option'
    case 'radio':
      return 'Choose one'
    case 'checkboxes':
      return 'Select all that apply'
    case 'consent':
      return 'Consent'
    case 'heading':
      return 'Section title'
    case 'paragraph':
      return 'Text'
    default:
      return 'Field'
  }
}

/** A field carrying one of these mappings writes to that leads column. */
export const MAPPING_LABELS: Record<LeadFieldMapping, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  country: 'Country',
  address: 'Address',
  zip_code: 'Zip / postal code',
  city: 'City',
  preferred_date: 'Preferred date',
  preferred_time: 'Preferred time',
  message: 'Message',
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults — what a brand-new form looks like
// ─────────────────────────────────────────────────────────────────────────────

export function defaultLeadFormConfig(): LeadFormConfig {
  return {
    version: 3,
    title: 'Request a quote',
    description: 'Tell us a little about what you need and we’ll get back to you shortly.',
    fields: [
      { id: genId(), type: 'short_text', label: 'First name', required: true, width: 'half', mapping: 'first_name' },
      { id: genId(), type: 'short_text', label: 'Last name', required: false, width: 'half', mapping: 'last_name' },
      { id: genId(), type: 'email', label: 'Email', required: true, width: 'half', mapping: 'email' },
      { id: genId(), type: 'phone', label: 'Phone', required: false, width: 'half', mapping: 'phone' },
      { id: genId(), type: 'long_text', label: 'How can we help?', required: false, width: 'full', mapping: 'message' },
    ],
    submitText: 'Send request',
    successTitle: 'Thank you!',
    successMessage: 'We’ve received your request and will be in touch soon.',
    notifyEmail: '',
    theme: {
      accent: '#0F766E',
      corners: 'rounded',
      background: 'tint',
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization — coerce any stored/legacy settings into a valid config
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeConfig(raw: any): LeadFormConfig {
  const d = defaultLeadFormConfig()
  if (!raw || typeof raw !== 'object') return d

  // Legacy (version < 3) forms used a totally different shape. We don't try to
  // migrate field-by-field — we just fall back to defaults so the admin gets a
  // clean, working form to start from in the new builder.
  if (raw.version !== 3 || !Array.isArray(raw.fields)) {
    return d
  }

  const fields: LeadField[] = (raw.fields as any[])
    .filter((f) => f && typeof f === 'object' && typeof f.type === 'string')
    .map((f) => {
      const field: LeadField = {
        id: typeof f.id === 'string' && f.id ? f.id : genId(),
        type: f.type,
        label: typeof f.label === 'string' ? f.label : '',
        placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined,
        help: typeof f.help === 'string' ? f.help : undefined,
        required: !!f.required,
        width: f.width === 'half' ? 'half' : 'full',
        mapping: typeof f.mapping === 'string' ? f.mapping : null,
        content: typeof f.content === 'string' ? f.content : undefined,
      }
      if (Array.isArray(f.options)) {
        field.options = f.options
          .filter((o: any) => o && typeof o === 'object')
          .map((o: any) => ({
            id: typeof o.id === 'string' && o.id ? o.id : genId('o'),
            label: typeof o.label === 'string' ? o.label : '',
          }))
      }
      return field
    })

  return {
    version: 3,
    title: typeof raw.title === 'string' ? raw.title : d.title,
    description: typeof raw.description === 'string' ? raw.description : d.description,
    fields: fields.length ? fields : d.fields,
    submitText: typeof raw.submitText === 'string' && raw.submitText ? raw.submitText : d.submitText,
    successTitle: typeof raw.successTitle === 'string' && raw.successTitle ? raw.successTitle : d.successTitle,
    successMessage:
      typeof raw.successMessage === 'string' && raw.successMessage ? raw.successMessage : d.successMessage,
    notifyEmail: typeof raw.notifyEmail === 'string' ? raw.notifyEmail : '',
    theme: {
      accent:
        typeof raw?.theme?.accent === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.theme.accent)
          ? raw.theme.accent
          : d.theme.accent,
      corners: ['sharp', 'rounded', 'pill'].includes(raw?.theme?.corners) ? raw.theme.corners : d.theme.corners,
      background: ['white', 'tint'].includes(raw?.theme?.background) ? raw.theme.background : d.theme.background,
    },
  }
}

/** Corner radius → Tailwind class for inputs / cards. */
export function cornerClass(corners: LeadFormTheme['corners']): string {
  switch (corners) {
    case 'sharp':
      return 'rounded-none'
    case 'pill':
      return 'rounded-full'
    default:
      return 'rounded-lg'
  }
}
