'use client'

import { useEffect, useState } from 'react'

interface SendInvoiceModalProps {
  isOpen: boolean
  invoiceNumber?: string
  defaultSubject: string
  defaultMessage: string
  isSending?: boolean
  onClose: () => void
  onSend: (data: { subject: string; message: string }) => void
}

export default function SendInvoiceModal({
  isOpen,
  invoiceNumber,
  defaultSubject,
  defaultMessage,
  isSending = false,
  onClose,
  onSend
}: SendInvoiceModalProps) {
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)

  useEffect(() => {
    if (!isOpen) return
    setSubject(defaultSubject)
    setMessage(defaultMessage)
  }, [isOpen, defaultSubject, defaultMessage])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 animate-backdrop-in" onClick={onClose} />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-4">
        <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-gray-200 overflow-hidden pb-safe animate-sheet-in-bottom sm:animate-pop">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Send invoice</h3>
              <p className="text-sm text-gray-500 mt-1">
                Email invoice{invoiceNumber ? ` #${invoiceNumber}` : ''} to the client. Sending will mark it as <span className="font-medium">sent</span>.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Invoice subject..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Message to the client..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: You can set the default template under <span className="font-medium">Settings → Email Notifications → Send Invoice</span>.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSend({ subject, message })}
              disabled={isSending || !subject.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Send invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}




