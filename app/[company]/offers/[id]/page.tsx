'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import ConfirmModal from '@/app/components/ConfirmModal'
import { useAppI18n } from '@/app/components/I18nProvider'
import { apiUrl } from '@/app/utils/api'
import OfferDocument from '@/app/components/offers/OfferDocument'
import OfferStatusPill from '@/app/components/offers/OfferStatusPill'
import {
  formatDay,
  formatDocMoney,
  offerPublicHref,
  parseOfferList,
  type OfferDate,
  type OfferDocumentData,
  type OfferRecord,
} from '@/app/lib/offers'
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'

const CreateOfferModal = dynamic(() => import('@/app/components/offers/CreateOfferModal'), { ssr: false })

function authHeaders(json = false): HeadersInit {
  const token = localStorage.getItem('token')
  return json ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${token}` }
}

function stamp(iso: string | null | undefined, locale: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(locale === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function OfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t, locale } = useAppI18n()
  const company = typeof params?.company === 'string' ? params.company : ''
  const id = typeof params?.id === 'string' ? params.id : ''
  const [offer, setOffer] = useState<OfferRecord | null>(null)
  const [doc, setDoc] = useState<OfferDocumentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'send' | 'revoke' | 'confirm' | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const load = useCallback(() => {
    fetch(apiUrl(`/offers/${id}`), { headers: authHeaders() })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Not found')
        setOffer(data.offer)
        setDoc(data.document)
      })
      .catch(e => setError(e.message || 'Not found'))
  }, [id])

  useEffect(() => { load() }, [load])

  if (error && !offer) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm font-semibold text-gray-800">{error}</p>
          <Link href={`/${company}/pipeline`} className="mt-3 inline-block text-sm font-semibold text-accent-600">
            {t('app.pipeline.backToPipeline', 'Back to pipeline')}
          </Link>
        </div>
      </AppLayout>
    )
  }

  if (!offer || !doc) {
    return (
      <AppLayout>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[520px] animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </AppLayout>
    )
  }

  const href = offerPublicHref(offer)
  const dates = parseOfferList<OfferDate>(offer.proposed_dates)
  const accepted = offer.status === 'accepted'
  const recipientEmail = offer.contact_email || offer.client_email || ''
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* blocked */ }
  }

  const send = async () => {
    setBusy('send')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(apiUrl(`/offers/${offer.id}/send`), { method: 'POST', headers: authHeaders(true), body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send')
      setNotice(`${t('app.offers.emailedTo', 'Emailed to')} ${data.emailed}`)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const confirmBooking = async () => {
    setBusy('confirm')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(apiUrl(`/offers/${offer.id}/confirm`), { method: 'POST', headers: authHeaders(true), body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not confirm')
      setNotice(data.emailed ? t('app.pipeline.flash.confirmedEmailed', 'Verified — confirmation sent to the client') : t('app.pipeline.flash.booked', 'Verified — added to the day'))
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    setBusy('revoke')
    try {
      const res = await fetch(apiUrl(`/offers/${offer.id}`), { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Could not withdraw')
      router.push(`/${company}/pipeline`)
    } catch (e: any) {
      setError(e.message)
      setBusy(null)
    }
  }

  const timeline: { label: string; at: string | null | undefined }[] = [
    { label: t('app.offers.tlCreated', 'Created'), at: offer.created_at },
    { label: t('app.offers.tlSent', 'Sent'), at: offer.sent_at },
    { label: t('app.offers.tlViewed', 'Opened by client'), at: offer.viewed_at },
    ...(offer.status === 'declined'
      ? [{ label: t('app.pipeline.activity.declined', 'Declined'), at: offer.declined_at }]
      : [
          { label: t('app.offers.tlAccepted', 'Accepted'), at: offer.accepted_at },
          { label: t('app.pipeline.activity.confirmed', 'Verified by you'), at: offer.confirmed_at },
        ]),
  ]
  const pendingBooking = accepted && !offer.confirmed_at && !!offer.created_job_id
  const reached = timeline.filter(s => s.at).length

  const secondary = 'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50'

  return (
    <AppLayout>
      <div>
        <div className="mb-5 flex items-center gap-3">
          <Link
            href={`/${company}/pipeline?offer=${offer.id}`}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition hover:bg-gray-50"
            aria-label={t('app.pipeline.backToPipeline', 'Back to pipeline')}
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-xl font-bold text-primary-500 sm:text-2xl">
              <span className="truncate">{offer.recipient_name}</span>
              <span className="flex-shrink-0 text-base font-semibold tabular-nums text-gray-400">#{offer.number}</span>
            </h1>
            <div className="mt-0.5 flex items-center gap-2">
              <OfferStatusPill offer={offer} />
              <span className="truncate text-xs text-gray-500">{offer.title}</span>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="order-2 lg:order-1">
            <OfferDocument data={doc}>
              {(dates.length > 0 || accepted) && (
                <div className="px-6 py-5 sm:px-10">
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {accepted ? t('app.offers.bookedDay', 'Booked day') : t('app.offers.suggestedDays', 'Suggested days')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {accepted && offer.accepted_date && !dates.some(d => d.date === String(offer.accepted_date).slice(0, 10)) && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-3 py-2 text-sm font-semibold text-white">
                        <CheckIcon className="h-4 w-4" />
                        {formatDay(String(offer.accepted_date).slice(0, 10), locale, { weekday: 'long', day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {dates.map(d => {
                      const chosen = accepted && String(offer.accepted_date || '').slice(0, 10) === d.date
                      return (
                        <span
                          key={d.date}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                            chosen ? 'bg-accent-500 text-white' : accepted ? 'bg-gray-50 text-gray-400 line-through' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {chosen && <CheckIcon className="h-4 w-4" />}
                          {formatDay(d.date, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                          {d.user_name && !accepted && <span className="text-xs font-medium text-gray-500">· {d.user_name.split(' ')[0]}</span>}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </OfferDocument>
          </div>

          <aside className="order-1 space-y-4 lg:sticky lg:top-6 lg:order-2">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('app.offers.total', 'Total')}</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{formatDocMoney(doc.total, doc.currency, doc.moneyLocale || locale)}</p>
                {doc.taxRate > 0 && (
                  <p className="text-xs text-gray-500">
                    {t('app.offers.incl', 'incl.')} {doc.taxLabel} {formatDocMoney(doc.taxAmount, doc.currency, doc.moneyLocale || locale)}
                  </p>
                )}
              </div>

              <ol className="space-y-0 px-5 py-4">
                {timeline.map((s, i) => {
                  const done = !!s.at
                  const last = i === timeline.length - 1
                  return (
                    <li key={s.label} className="relative flex gap-3 pb-3.5 last:pb-0">
                      {!last && (
                        <span className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5 ${i < reached - 1 ? 'bg-accent-500' : 'bg-gray-200'}`} />
                      )}
                      <span className={`relative z-10 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                        done ? 'bg-accent-500' : 'border-2 border-gray-200 bg-white'
                      }`}>
                        {done && <CheckIcon className="h-3 w-3 text-white" />}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                        {done && <p className="text-xs text-gray-500">{stamp(s.at, locale)}</p>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-2">
              {!accepted && (
                <button
                  type="button"
                  onClick={send}
                  disabled={busy != null || !recipientEmail}
                  title={recipientEmail ? recipientEmail : t('app.offers.noEmail', 'No email on this client')}
                  className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-600 disabled:opacity-40 disabled:shadow-none"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {busy === 'send'
                    ? t('app.offers.sending', 'Sending…')
                    : offer.sent_at
                      ? t('app.offers.resend', 'Send again')
                      : t('app.offers.sendEmail', 'Send by email')}
                </button>
              )}
              {pendingBooking && (
                <button
                  type="button"
                  onClick={confirmBooking}
                  disabled={busy != null}
                  className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-600 disabled:opacity-60"
                >
                  <CheckIcon className="h-4 w-4" />
                  {t('app.pipeline.action.confirm', 'Verify job')}
                </button>
              )}
              {accepted && offer.created_job_id && (
                <Link
                  href={`/${company}/jobs?${offer.accepted_date ? `date=${String(offer.accepted_date).slice(0, 10)}&` : ''}job=${offer.created_job_id}`}
                  className={
                    pendingBooking
                      ? `${secondary} w-full`
                      : 'mb-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/20 transition hover:bg-accent-600'
                  }
                >
                  <BriefcaseIcon className={pendingBooking ? 'h-4 w-4 text-gray-400' : 'h-4 w-4'} />
                  {pendingBooking ? t('app.pipeline.action.changeDay', 'Change day') : t('app.offers.openJob', 'Open job')}
                </Link>
              )}
              {notice && <p className="px-3 py-1.5 text-xs font-medium text-accent-700">{notice}</p>}
              {error && <p className="px-3 py-1.5 text-xs font-medium text-red-600">{error}</p>}

              <button type="button" onClick={copy} className={`${secondary} w-full`}>
                {copied ? <CheckIcon className="h-4 w-4 text-accent-600" /> : <ClipboardDocumentIcon className="h-4 w-4 text-gray-400" />}
                {copied ? t('app.offers.copied', 'Copied') : t('app.offers.copyLink', 'Copy link')}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => navigator.share({ title: `${t('app.offers.offer', 'Offer')} #${offer.number}`, url: href }).catch(() => {})}
                  className={`${secondary} w-full`}
                >
                  <ShareIcon className="h-4 w-4 text-gray-400" />
                  {t('app.offers.share', 'Share')}
                </button>
              )}
              <a href={`/o/${offer.token}?preview=1`} target="_blank" rel="noreferrer" className={secondary}>
                <EyeIcon className="h-4 w-4 text-gray-400" />
                {t('app.offers.previewAsClient', 'View as client')}
              </a>
              {!accepted && (
                <>
                  <button type="button" onClick={() => setEditing(true)} className={`${secondary} w-full`}>
                    <PencilSquareIcon className="h-4 w-4 text-gray-400" />
                    {t('app.offers.edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(true)}
                    className={`${secondary} w-full text-gray-500 hover:bg-red-50 hover:text-red-600`}
                  >
                    <TrashIcon className="h-4 w-4" />
                    {t('app.offers.withdraw', 'Withdraw')}
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>

      <CreateOfferModal
        isOpen={editing}
        onClose={() => setEditing(false)}
        existing={offer}
        lockClient={!!offer.client_id}
        onCreated={() => load()}
      />

      <ConfirmModal
        isOpen={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() => { setConfirmRevoke(false); void revoke() }}
        title={t('app.offers.withdrawTitle', 'Withdraw this offer?')}
        description={t('app.offers.withdrawBody', 'The link stops working and the client can no longer accept it.')}
        confirmLabel={t('app.offers.withdraw', 'Withdraw')}
        enableNotification={false}
      />
    </AppLayout>
  )
}
