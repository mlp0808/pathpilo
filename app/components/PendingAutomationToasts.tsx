'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'
import {
  automationChannelFromKey,
  automationLabelKey,
  formatAutomationEta,
} from '../utils/automationEta'

type PendingItem = {
  key: string
  channel: 'email' | 'sms'
  sendAt: string
  jobId: number | null
  invoiceId: number | null
  label: string | null
}

const LABEL_FALLBACKS: Record<string, string> = {
  'app.automation.bookingConfirmation': 'Booking confirmation',
  'app.automation.jobReminder': 'Job reminder',
  'app.automation.invoiceDueReminder': 'Invoice due reminder',
  'app.automation.smsOnTheWay': 'On the way SMS',
  'app.automation.smsDayBefore': 'Day-before SMS',
  'app.automation.generic': 'Scheduled message',
}

export default function PendingAutomationToasts() {
  const { t } = useAppI18n()
  const [pending, setPending] = useState<PendingItem[]>([])
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [tick, setTick] = useState(0)
  const [cancellingKey, setCancellingKey] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setPending([])
      return
    }
    try {
      const res = await fetch(apiUrl('/companies/pending-automations'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setPending([])
        return
      }
      const data = await res.json()
      setPending(Array.isArray(data.pending) ? data.pending : [])
      const serverNow = Date.parse(data.serverNow)
      if (!Number.isNaN(serverNow)) {
        setClockOffsetMs(serverNow - Date.now())
      }
    } catch {
      setPending([])
    }
  }, [])

  useEffect(() => {
    void fetchPending()
    const poll = setInterval(() => void fetchPending(), 15000)
    return () => clearInterval(poll)
  }, [fetchPending])

  useEffect(() => {
    if (pending.length === 0) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [pending.length])

  const handleCancel = async (item: PendingItem) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const cancelId = `${item.key}-${item.jobId ?? item.invoiceId}`
    setCancellingKey(cancelId)
    try {
      if (item.jobId != null) {
        await fetch(apiUrl(`/jobs/${item.jobId}/automation-cancel/${item.key}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      } else if (item.invoiceId != null) {
        await fetch(apiUrl(`/invoices/${item.invoiceId}/invoice-reminder`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      setPending((prev) =>
        prev.filter(
          (p) =>
            !(
              p.key === item.key &&
              p.jobId === item.jobId &&
              p.invoiceId === item.invoiceId
            ),
        ),
      )
      void fetchPending()
    } catch {
      // ignore
    } finally {
      setCancellingKey(null)
    }
  }

  if (pending.length === 0) return null

  void tick
  const soon = t('app.jobView.automationSoon', 'Soon')

  return (
    <div
      className="fixed bottom-20 right-4 z-[38] flex flex-col items-end gap-2 pointer-events-none max-w-[min(100vw-2rem,18rem)]"
      aria-live="polite"
    >
      {pending.map((item) => {
        const sendAtMs = Date.parse(item.sendAt)
        const ms = sendAtMs - (Date.now() + clockOffsetMs)
        const eta =
          !Number.isFinite(sendAtMs) || ms <= 0 ? soon : formatAutomationEta(ms, soon)
        const channel = item.channel || automationChannelFromKey(item.key)
        const isSms = channel === 'sms'
        const labelKey = automationLabelKey(item.key)
        const title = t(labelKey, LABEL_FALLBACKS[labelKey] || 'Scheduled message')
        const cancelId = `${item.key}-${item.jobId ?? item.invoiceId}`

        return (
          <div
            key={cancelId}
            className={`pointer-events-auto w-full rounded-xl border shadow-lg backdrop-blur-sm px-3 py-2.5 flex items-start gap-2.5 ${
              isSms
                ? 'border-emerald-200/80 bg-white/95'
                : 'border-violet-200/80 bg-white/95'
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isSms ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'
              }`}
            >
              {isSms ? (
                <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden />
              ) : (
                <EnvelopeIcon className="h-4 w-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 truncate">{title}</p>
              {item.label ? (
                <p className="text-[11px] text-gray-500 truncate">{item.label}</p>
              ) : null}
              <p
                className={`mt-0.5 text-[11px] font-medium tabular-nums ${
                  isSms ? 'text-emerald-700' : 'text-violet-700'
                }`}
              >
                {isSms
                  ? t('app.automation.smsSendingIn', 'SMS sending in {{time}}').replace(
                      '{{time}}',
                      eta,
                    )
                  : t('app.automation.emailSendingIn', 'Email sending in {{time}}').replace(
                      '{{time}}',
                      eta,
                    )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCancel(item)}
              disabled={cancellingKey === cancelId}
              className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              aria-label={t('app.automation.cancelSend', 'Cancel scheduled send')}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
