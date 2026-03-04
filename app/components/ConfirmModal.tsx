'use client'

import React, { useEffect, useState } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: (opts: { notify: boolean, message: string, subject: string, email?: string }) => void
  defaultMessage?: string | (() => string)
  defaultSubject?: string | (() => string)
  defaultEmail?: string
  enableNotification?: boolean
  isSubmitting?: boolean
  children?: React.ReactNode
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
  defaultMessage = '',
  defaultSubject = '',
  defaultEmail = '',
  enableNotification = true,
  isSubmitting = false,
  children
}: ConfirmModalProps) {
  const [notify, setNotify] = useState(false)
  const [message, setMessage] = useState(typeof defaultMessage === 'function' ? (defaultMessage as () => string)() : defaultMessage)
  const [subject, setSubject] = useState(typeof defaultSubject === 'function' ? (defaultSubject as () => string)() : defaultSubject)
  const [email, setEmail] = useState(defaultEmail)

  useEffect(() => {
    if (isOpen) {
      setNotify(false)
      setMessage(typeof defaultMessage === 'function' ? (defaultMessage as () => string)() : (defaultMessage || ''))
      setSubject(typeof defaultSubject === 'function' ? (defaultSubject as () => string)() : (defaultSubject || ''))
      setEmail(defaultEmail || '')
    }
  }, [isOpen, defaultMessage, defaultSubject, defaultEmail])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-200 animate-slideDown">
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
            <h3 className="text-xl font-bold text-primary-800 tracking-tight">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-1.5 font-medium">{description}</p>}
          </div>

          <div className="px-6 py-5 space-y-4">
            {children}

            {enableNotification && (
              <div className="space-y-3 pt-2">
                <label className="inline-flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="rounded border-gray-300 text-accent-500 focus:ring-accent-500 focus:ring-2"
                  />
                  <span className="text-sm font-semibold text-primary-700">Notify customer</span>
                </label>
                {notify && (
                  <>
                    <label className="block text-xs font-medium text-gray-500">Send to</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                    />
                    <label className="block text-xs font-medium text-gray-500">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                      placeholder="Email subject..."
                    />
                    <label className="block text-xs font-medium text-gray-500">Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 resize-none"
                      placeholder="Email message to customer..."
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end space-x-3 rounded-b-3xl">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-all duration-200 ease-out rounded-xl hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
              disabled={isSubmitting}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ notify, message, subject, email: notify ? email : undefined })}
              disabled={isSubmitting}
              className="px-6 py-2.5 text-sm font-semibold bg-accent-500 text-white rounded-xl hover:bg-accent-600 transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/30 hover:scale-[1.02] active:scale-[0.98] transform"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

