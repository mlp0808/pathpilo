'use client'

import { useCallback, useEffect, useState } from 'react'
import Script from 'next/script'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { TawkIdentitySync } from './TawkIdentitySync'
import {
  dismissTawkPermanently,
  HELP_CENTER_URL,
  isTawkDismissed,
} from '../utils/tawk'

const TAWK_EMBED_SRC = 'https://embed.tawk.to/69dd54b75b2ee31c3842497a/1jm495rg8'

const TAWK_READY_EVENT = 'pathpilo-tawk-ready'

export function TawkChat() {
  const { t } = useAppI18n()
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)

  useEffect(() => {
    const off = isTawkDismissed()
    setDismissed(off)
    if (off) return

    const onReady = () => setWidgetReady(true)
    window.addEventListener(TAWK_READY_EVENT, onReady)
    return () => window.removeEventListener(TAWK_READY_EVENT, onReady)
  }, [])

  const handleConfirmDismiss = useCallback(() => {
    dismissTawkPermanently()
    setDismissed(true)
    setWidgetReady(false)
    setConfirmDismiss(false)
  }, [])

  if (dismissed !== false) {
    return null
  }

  return (
    <>
      <Script
        id="tawk-to-bootstrap"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.Tawk_API=window.Tawk_API||{};
window.Tawk_LoadStart=new Date();
window.Tawk_API.customStyle={zIndex:30};
window.Tawk_API.onLoad=function(){window.dispatchEvent(new Event("${TAWK_READY_EVENT}"));};`,
        }}
      />
      <Script
        id="tawk-to-embed"
        src={TAWK_EMBED_SRC}
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
      <TawkIdentitySync />

      {widgetReady && (
        <div
          className="fixed z-[31] flex flex-col items-end gap-2 pointer-events-none"
          style={{
            bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))',
            right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
          }}
        >
          {confirmDismiss ? (
            <div
              className="pointer-events-auto w-[min(100vw-1.5rem,18rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg text-left"
              role="dialog"
              aria-labelledby="tawk-dismiss-title"
            >
              <p id="tawk-dismiss-title" className="text-sm font-medium text-gray-900">
                {t('app.tawk.dismissTitle', 'Hide live chat?')}
              </p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {t(
                  'app.tawk.dismissBody',
                  'The chat bubble will not come back on this device. You can always use our Help Center for guides and answers.',
                )}
              </p>
              <a
                href={HELP_CENTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-accent-600 hover:text-accent-700"
              >
                {t('app.tawk.helpCenter', 'Open Help Center')} →
              </a>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('app.tawk.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDismiss}
                  className="flex-1 rounded-lg bg-gray-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-black"
                >
                  {t('app.tawk.confirmHide', 'Hide permanently')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDismiss(true)}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-md backdrop-blur hover:bg-white hover:text-gray-900"
            >
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
              {t('app.tawk.hideChat', 'Hide chat')}
            </button>
          )}
        </div>
      )}
    </>
  )
}
