'use client'

import React, { useEffect, useState } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: (opts: { notify: boolean, message: string, subject: string }) => void
  defaultMessage?: string | (() => string)
  defaultSubject?: string | (() => string)
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
  enableNotification = true,
  isSubmitting = false,
  children
}: ConfirmModalProps) {
  const [notify, setNotify] = useState(false)
  const [message, setMessage] = useState(typeof defaultMessage === 'function' ? (defaultMessage as () => string)() : defaultMessage)
  const [subject, setSubject] = useState(typeof defaultSubject === 'function' ? (defaultSubject as () => string)() : defaultSubject)

  useEffect(() => {
    if (isOpen) {
      setNotify(false)
      setMessage(typeof defaultMessage === 'function' ? (defaultMessage as () => string)() : (defaultMessage || ''))
      setSubject(typeof defaultSubject === 'function' ? (defaultSubject as () => string)() : (defaultSubject || ''))
    }
  }, [isOpen, defaultMessage])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
          </div>

          <div className="px-5 py-4 space-y-3">
            {children}

            {enableNotification && (
              <div className="space-y-2">
                <label className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Notify customer</span>
                </label>
                {notify && (
                  <>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Email subject..."
                    />
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Email message to customer..."
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-2 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 ease-out rounded hover:bg-gray-100"
              disabled={isSubmitting}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ notify, message, subject })}
              disabled={isSubmitting}
              className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

