'use client'

import { useState, useEffect, useRef } from 'react'
import { BellIcon, PencilIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { clearEmailTemplateCache } from '../../utils/emailTemplates'

interface EmailTemplate {
  subject: string
  message: string
}

interface Templates {
  change_date: EmailTemplate
  change_time: EmailTemplate
  change_employee: EmailTemplate
  cancel_job: EmailTemplate
  send_invoice: EmailTemplate
}

interface TemplateOption {
  key: keyof Templates
  label: string
  description: string
}

// Template options for dropdown
const templateOptions: TemplateOption[] = [
  {
    key: 'change_date',
    label: 'Change Date Notification',
    description: 'Sent when a job date is changed'
  },
  {
    key: 'change_time',
    label: 'Change Time Notification',
    description: 'Sent when a job time is changed'
  },
  {
    key: 'change_employee',
    label: 'Change Employee Notification',
    description: 'Sent when the assigned employee is changed'
  },
  {
    key: 'cancel_job',
    label: 'Cancel Job Notification',
    description: 'Sent when a job is cancelled'
  },
  {
    key: 'send_invoice',
    label: 'Send Invoice',
    description: 'Sent when you email an invoice to the client'
  }
]

// Available personalization snippets
const snippets = [
  { key: '{Client name}', description: 'Client\'s full name' },
  { key: '{Client first name}', description: 'Client\'s first name' },
  { key: '{Client last name}', description: 'Client\'s last name' },
  { key: '{Job date}', description: 'Current job date' },
  { key: '{Job old date}', description: 'Previous job date (for date changes)' },
  { key: '{Job new date}', description: 'New job date (for date changes)' },
  { key: '{Job time}', description: 'Current job time' },
  { key: '{Job old time}', description: 'Previous job time (for time changes)' },
  { key: '{Job new time}', description: 'New job time (for time changes)' },
  { key: '{Job time from}', description: 'Job start time' },
  { key: '{Job time to}', description: 'Job end time' },
  { key: '{Job old time from}', description: 'Previous start time' },
  { key: '{Job old time to}', description: 'Previous end time' },
  { key: '{Job new time from}', description: 'New start time' },
  { key: '{Job new time to}', description: 'New end time' },
  { key: '{Employee name}', description: 'Assigned employee name' },
  { key: '{Employee old name}', description: 'Previous employee name (for employee changes)' },
  { key: '{Employee new name}', description: 'New employee name (for employee changes)' },
  { key: '{Assigned user}', description: 'Name of the user assigned to the job' },
  { key: '{User name}', description: 'Name of user making the change' },
  { key: '{Current user}', description: 'Name of the user performing the action' },
  { key: '{Company name}', description: 'Your company name' },
  { key: '{Company owner}', description: 'Name of the company owner' },
  { key: '{Job address}', description: 'Job address' },
  { key: '{Job city}', description: 'Job city' },
  { key: '{Job services}', description: 'List of services for the job' }
]

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<keyof Templates>('change_date')
  const [showSnippets, setShowSnippets] = useState(false)
  const [templates, setTemplates] = useState<Templates>({
    change_date: { subject: '', message: '' },
    change_time: { subject: '', message: '' },
    change_employee: { subject: '', message: '' },
    cancel_job: { subject: '', message: '' },
    send_invoice: { subject: '', message: '' }
  })

  const subjectRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/email-templates'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        // Try to parse JSON, but handle HTML error pages gracefully
        let errorData: any = {}
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = await response.json()
          } catch (e) {
            // If JSON parsing fails, use empty object
          }
        }
        
        // If table doesn't exist yet or any server error, just use empty templates
        if (response.status >= 500) {
          console.warn('Email templates table may not exist yet. Using empty templates.')
          setTemplates({
            change_date: { subject: '', message: '' },
            change_time: { subject: '', message: '' },
            change_employee: { subject: '', message: '' },
            cancel_job: { subject: '', message: '' },
            send_invoice: { subject: '', message: '' }
          } as Templates)
          return
        }
        
        // For other errors, show message but still allow editing
        console.warn('Failed to fetch templates:', errorData.error || 'Unknown error')
        setTemplates({
          change_date: { subject: '', message: '' },
          change_time: { subject: '', message: '' },
          change_employee: { subject: '', message: '' },
          cancel_job: { subject: '', message: '' },
          send_invoice: { subject: '', message: '' }
        } as Templates)
        return
      }

      const data = await response.json()
      setTemplates((data.templates || {
        change_date: { subject: '', message: '' },
        change_time: { subject: '', message: '' },
        change_employee: { subject: '', message: '' },
        cancel_job: { subject: '', message: '' },
        send_invoice: { subject: '', message: '' }
      }) as Templates)
    } catch (error) {
      console.error('Error fetching templates:', error)
      // On any error, just use empty templates - user can still create new ones
      setTemplates({
        change_date: { subject: '', message: '' },
        change_time: { subject: '', message: '' },
        change_employee: { subject: '', message: '' },
        cancel_job: { subject: '', message: '' },
        send_invoice: { subject: '', message: '' }
      } as Templates)
    } finally {
      setLoading(false)
    }
  }

  const handleTemplateChange = (type: keyof Templates, field: 'subject' | 'message', value: string) => {
    setTemplates(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value
      }
    }))
  }

  const insertSnippet = (snippet: string, field: 'subject' | 'message') => {
    const ref = field === 'subject' ? subjectRef : messageRef
    const input = ref.current
    if (!input) return

    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const text = input.value
    const newText = text.substring(0, start) + snippet + text.substring(end)

    handleTemplateChange(selectedTemplate, field, newText)

    // Set cursor position after inserted snippet
    setTimeout(() => {
      input.focus()
      const newPosition = start + snippet.length
      input.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/email-templates'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ templates })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save email templates')
      }

      setSuccess('Email templates saved successfully!')
      clearEmailTemplateCache() // Clear cache so new templates are used immediately
      setTimeout(() => setSuccess(''), 3000)
    } catch (error) {
      console.error('Error saving templates:', error)
      setError(error instanceof Error ? error.message : 'Failed to save email templates')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading email templates...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BellIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Email Notifications</h1>
              <p className="text-gray-600 mt-1">Manage default email templates for customer notifications</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Template Selector */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Email Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as keyof Templates)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {templateOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {templateOptions.find(option => option.key === selectedTemplate)?.description}
            </p>
          </div>

          {/* Selected Template Form */}
          <div className="bg-gray-50 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {templateOptions.find(option => option.key === selectedTemplate)?.label}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  ref={subjectRef}
                  type="text"
                  value={templates[selectedTemplate].subject}
                  onChange={(e) => handleTemplateChange(selectedTemplate, 'subject', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`e.g., ${templateOptions.find(option => option.key === selectedTemplate)?.label} - {Client name}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  ref={messageRef}
                  value={templates[selectedTemplate].message}
                  onChange={(e) => handleTemplateChange(selectedTemplate, 'message', e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder={`e.g., Hi {Client first name},&#10;&#10;${templateOptions.find(option => option.key === selectedTemplate)?.description.toLowerCase()}.&#10;&#10;Best regards,&#10;{User name}`}
                />
                <button
                  type="button"
                  onClick={() => setShowSnippets(!showSnippets)}
                  className="mt-2 w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 transition-colors flex items-center justify-between"
                >
                  <span>Personalization</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${showSnippets ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showSnippets && (
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-600 mb-2">Click a snippet to insert it at the cursor position:</p>
                    <div className="flex flex-wrap gap-2">
                      {snippets.map((snippet) => (
                        <button
                          key={snippet.key}
                          type="button"
                          onClick={() => {
                            // Insert into message field by default
                            insertSnippet(snippet.key, 'message')
                          }}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          title={snippet.description}
                        >
                          {snippet.key}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Personalization Snippets Reference */}
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">Available Snippets</h3>
            <p className="text-xs text-blue-700 mb-3">These placeholders will be replaced with actual values when the email is sent.</p>
            <div className="flex flex-wrap gap-2">
              {snippets.map((snippet) => (
                <span
                  key={snippet.key}
                  className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-mono text-blue-700"
                  title={snippet.description}
                >
                  {snippet.key}
                </span>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <PencilIcon className="w-4 h-4" />
                  <span>Save Templates</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

