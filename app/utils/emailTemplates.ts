import { apiUrl } from './api'
import { getDefaultTemplate, getCompanyCountryCodeSync } from './emailTemplateDefaults'

interface EmailTemplate {
  subject: string
  message: string
}
type TemplateType = 'change_date' | 'change_time' | 'change_employee' | 'cancel_job' | 'send_invoice'

interface TemplateData {
  clientName?: string
  clientFirstName?: string
  clientLastName?: string
  jobDate?: string
  jobOldDate?: string
  jobNewDate?: string
  jobTime?: string
  jobOldTime?: string
  jobNewTime?: string
  jobTimeFrom?: string
  jobTimeTo?: string
  jobOldTimeFrom?: string
  jobOldTimeTo?: string
  jobNewTimeFrom?: string
  jobNewTimeTo?: string
  employeeName?: string
  employeeOldName?: string
  employeeNewName?: string
  userName?: string
  companyName?: string
  companyOwner?: string
  jobAddress?: string
  jobCity?: string
  jobServices?: string
  jobTotalPrice?: string
  jobTimeRange?: string
}

// Cache for templates
let templatesCache: { [key: string]: EmailTemplate } | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// template-type → notifications page template id mapping (for translated fallbacks)
const templateTypeToId: Partial<Record<TemplateType, string>> = {
  change_date: 'email_date_changed',
  change_time: 'email_time_updated',
  change_employee: 'email_employee_changed',
  cancel_job: 'email_job_cancelled',
}

// Hardcoded English fallbacks for types not covered by the translations utility (e.g. send_invoice)
const STATIC_FALLBACK: Record<string, EmailTemplate> = {
  send_invoice: {
    subject: 'Your invoice from {Company name}',
    message:
      'Hi {Client first name},\n\nPlease find your invoice attached.\n\nIf you have any questions, feel free to reply.\n\nBest regards,\n{Company name}',
  },
}

function getFallbackTemplate(templateType: TemplateType): EmailTemplate {
  const id = templateTypeToId[templateType]
  if (id) {
    const cc = getCompanyCountryCodeSync()
    return getDefaultTemplate(id, cc)
  }
  return STATIC_FALLBACK[templateType] || { subject: '', message: '' }
}

function pickTemplate(templateType: TemplateType, template?: EmailTemplate): EmailTemplate {
  const fallback = getFallbackTemplate(templateType)
  const subject = template?.subject?.trim() ? template.subject : fallback.subject
  const message = template?.message?.trim() ? template.message : fallback.message
  return { subject, message }
}

export async function getEmailTemplate(
  templateType: TemplateType,
  data: TemplateData
): Promise<{ subject: string; message: string }> {
  try {
    // Check cache first
    const now = Date.now()
    if (templatesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      const template = pickTemplate(templateType, templatesCache[templateType])
      return {
        subject: replacePlaceholders(template.subject, data),
        message: replacePlaceholders(template.message, data)
      }
    }

    // Fetch from API
    const token = localStorage.getItem('token')
    const response = await fetch(apiUrl('/email-templates'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch email templates')
    }

    const result = await response.json()
    const templates = (result.templates || {}) as Record<string, EmailTemplate>
    templatesCache = templates
    cacheTimestamp = now

    const template = pickTemplate(templateType, templates[templateType])
    return {
      subject: replacePlaceholders(template.subject, data),
      message: replacePlaceholders(template.message, data)
    }
  } catch (error) {
    console.error('Error fetching email template:', error)
    const template = pickTemplate(templateType)
    return {
      subject: replacePlaceholders(template.subject, data),
      message: replacePlaceholders(template.message, data),
    }
  }
}

function replacePlaceholders(text: string, data: TemplateData): string {
  if (!text) return ''

  const d = data as TemplateData & { name?: string; first_name?: string; last_name?: string }
  const firstFromApi = (d.name ?? d.first_name ?? '').toString().trim()
  const lastFromApi = (d.last_name ?? '').toString().trim()
  const clientFirst =
    (data.clientFirstName && String(data.clientFirstName).trim()) || firstFromApi || ''
  const clientLast =
    (data.clientLastName && String(data.clientLastName).trim()) || lastFromApi || ''
  const clientFull =
    (data.clientName && String(data.clientName).trim()) ||
    [clientFirst, clientLast].filter(Boolean).join(' ').trim() ||
    [firstFromApi, lastFromApi].filter(Boolean).join(' ').trim() ||
    'Customer'

  const greetFirst =
    clientFirst ||
    (clientFull && clientFull !== 'Customer' ? clientFull.split(/\s+/)[0] : '') ||
    'there'

  const tf = (data.jobTimeFrom || '').toString().trim()
  const tt = (data.jobTimeTo || '').toString().trim()
  let jobTimeDetail = ''
  if (tf && tt) jobTimeDetail = `• Time: ${tf} – ${tt}`
  else if (tf || tt) jobTimeDetail = `• Time: ${tf || tt}`
  const jobTimeDetailBlock = jobTimeDetail ? `${jobTimeDetail}\n` : ''

  return text
    .replace(/{Client name}/g, clientFull)
    .replace(/{Client first name}/g, greetFirst)
    .replace(/{Client last name}/g, clientLast)
    .replace(/{Job date}/g, data.jobDate || '')
    .replace(/{Job old date}/g, data.jobOldDate || '')
    .replace(/{Job new date}/g, data.jobNewDate || '')
    .replace(/{Job time}/g, data.jobTime || '')
    .replace(/{Job old time}/g, data.jobOldTime || '')
    .replace(/{Job new time}/g, data.jobNewTime || '')
    .replace(/{Job time from}/g, data.jobTimeFrom || '')
    .replace(/{Job time to}/g, data.jobTimeTo || '')
    .replace(/{Job time range}/g, data.jobTimeRange || '')
    .replace(/{Job old time from}/g, data.jobOldTimeFrom || '')
    .replace(/{Job old time to}/g, data.jobOldTimeTo || '')
    .replace(/{Job new time from}/g, data.jobNewTimeFrom || '')
    .replace(/{Job new time to}/g, data.jobNewTimeTo || '')
    .replace(/{Employee name}/g, data.employeeName || '')
    .replace(/{Employee old name}/g, data.employeeOldName || '')
    .replace(/{Employee new name}/g, data.employeeNewName || '')
    .replace(/{Assigned user}/g, data.employeeName || '') // Same as Employee name
    .replace(/{User name}/g, data.userName || 'We')
    .replace(/{Current user}/g, data.userName || 'We') // Same as User name
    .replace(/{Company name}/g, data.companyName || '')
    .replace(/{Company owner}/g, data.companyOwner || '')
    .replace(/{Job address}/g, data.jobAddress || '')
    .replace(/{Job city}/g, data.jobCity || '')
    .replace(/{Job services}/g, data.jobServices || '')
    .replace(/{Job total price}/g, data.jobTotalPrice != null && data.jobTotalPrice !== '' ? data.jobTotalPrice : '—')
    .replace(/\[Insert total price\]/gi, data.jobTotalPrice != null && data.jobTotalPrice !== '' ? data.jobTotalPrice : '—')
    .replace(/{Job time detail}/g, jobTimeDetailBlock)
}

// Clear cache (useful after saving templates)
export function clearEmailTemplateCache() {
  templatesCache = null
  cacheTimestamp = 0
}

