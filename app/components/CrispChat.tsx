'use client'

import { useCallback, useEffect, useState } from 'react'
import Script from 'next/script'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { CrispIdentitySync } from './CrispIdentitySync'
import {
  CRISP_READY_EVENT,
  CRISP_WEBSITE_ID,
  dismissCrispPermanently,
  HELP_CENTER_URL,
  isCrispDismissed,
  isCrispEnabled,
} from '../utils/crisp'

/** Live chat via Crisp. Disabled when NEXT_PUBLIC_CRISP_WEBSITE_ID is unset. */
export function CrispChat() {
  const { t } = useAppI18n()
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)

  useEffect(() => {
    const off = isCrispDismissed()
    setDismissed(off)
    if (off) return

    const onReady = () => setWidgetReady(true)
    window.addEventListener(CRISP_READY_EVENT, onReady)
    return () => window.removeEventListener(CRISP_READY_EVENT, onReady)
  }, [])

  const handleConfirmDismiss = useCallback(() => {
    dismissCrispPermanently()
    setDismissed(true)
    setWidgetReady(false)
    setConfirmDismiss(false)
  }, [])

  if (!isCrispEnabled() || dismissed !== false) {
    return null
  }

  return (
    <>
      <Script
        id="crisp-chat"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.$crisp=window.$crisp||[];
window.CRISP_WEBSITE_ID="${CRISP_WEBSITE_ID}";
window.CRISP_READY_TRIGGER=function(){window.dispatchEvent(new Event("${CRISP_READY_EVENT}"));};
(function(){var d=document,s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`,
        }}
      />
      <CrispIdentitySync />

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
              aria-labelledby="crisp-dismiss-title"
            >
              <p id="crisp-dismiss-title" className="text-sm font-medium text-gray-900">
                {t('app.crisp.dismissTitle', 'Hide live chat?')}
              </p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {t(
                  'app.crisp.dismissBody',
                  'The chat bubble will not come back on this device. You can always use our Help Center for guides and answers.',
                )}
              </p>
              <a
                href={HELP_CENTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-accent-600 hover:text-accent-700"
              >
                {t('app.crisp.helpCenter', 'Open Help Center')} →
              </a>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDismiss(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('app.crisp.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDismiss}
                  className="flex-1 rounded-lg bg-gray-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-black"
                >
                  {t('app.crisp.confirmHide', 'Hide permanently')}
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
              {t('app.crisp.hideChat', 'Hide chat')}
            </button>
          )}
        </div>
      )}
    </>
  )
}
