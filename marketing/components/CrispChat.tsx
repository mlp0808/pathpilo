import Script from 'next/script'

const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID?.trim() || ''

/**
 * Crisp live chat for the marketing site.
 * Disabled when NEXT_PUBLIC_CRISP_WEBSITE_ID is unset — remove that env var to turn off forever.
 */
export function CrispChat() {
  if (!CRISP_WEBSITE_ID) return null

  return (
    <Script
      id="crisp-chat"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.$crisp=window.$crisp||[];
window.CRISP_WEBSITE_ID="${CRISP_WEBSITE_ID}";
(function(){var d=document,s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`,
      }}
    />
  )
}
