import { apiUrl } from './api'

interface EmailTemplate {
  subject: string
  message: string
}

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
}

// Cache for templates
let templatesCache: { [key: string]: EmailTemplate } | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function getEmailTemplate(
  templateType: 'change_date' | 'change_time' | 'change_employee' | 'cancel_job' | 'send_invoice',
  data: TemplateData
): Promise<{ subject: string; message: string }> {
  try {
    // Check cache first
    const now = Date.now()
    if (templatesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      const template = templatesCache[templateType]
      if (template) {
        return {
          subject: replacePlaceholders(template.subject, data),
          message: replacePlaceholders(template.message, data)
        }
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

    const template = templates[templateType] || { subject: '', message: '' }
    return {
      subject: replacePlaceholders(template.subject, data),
      message: replacePlaceholders(template.message, data)
    }
  } catch (error) {
    console.error('Error fetching email template:', error)
    // Return empty templates on error
    return { subject: '', message: '' }
  }
}

function replacePlaceholders(text: string, data: TemplateData): string {
  if (!text) return ''

  return text
    .replace(/{Client name}/g, data.clientName || 'Customer')
    .replace(/{Client first name}/g, data.clientFirstName || 'Customer')
    .replace(/{Client last name}/g, data.clientLastName || '')
    .replace(/{Job date}/g, data.jobDate || '')
    .replace(/{Job old date}/g, data.jobOldDate || '')
    .replace(/{Job new date}/g, data.jobNewDate || '')
    .replace(/{Job time}/g, data.jobTime || '')
    .replace(/{Job old time}/g, data.jobOldTime || '')
    .replace(/{Job new time}/g, data.jobNewTime || '')
    .replace(/{Job time from}/g, data.jobTimeFrom || '')
    .replace(/{Job time to}/g, data.jobTimeTo || '')
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
}

// Clear cache (useful after saving templates)
export function clearEmailTemplateCache() {
  templatesCache = null
  cacheTimestamp = 0
}

