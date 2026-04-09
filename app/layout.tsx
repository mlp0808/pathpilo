import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ClientI18nProvider } from './components/I18nProvider'

export const metadata: Metadata = {
  title: 'PathPilo - Client Management for Service Companies',
  description: 'Streamline your service business with PathPilo. Manage clients, jobs, and recurring tasks all in one place.',
  icons: {
    icon: '/pathpilo_favicon.png',
    apple: '/pathpilo_favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const metaPixelId = '2410572729416293'
  const hotjarId = process.env.NEXT_PUBLIC_HOTJAR_ID
  const hotjarSv = process.env.NEXT_PUBLIC_HOTJAR_SV || '6'
  const shouldEnableHotjar = Boolean(hotjarId)

  return (
    <html lang="en">
      <body className="antialiased">
        <Script
          id="meta-pixel-base"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        {shouldEnableHotjar && (
          <Script
            id="hotjar-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(h,o,t,j,a,r){
                    h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
                    h._hjSettings={hjid:${hotjarId},hjsv:${hotjarSv}};
                    a=o.getElementsByTagName('head')[0];
                    r=o.createElement('script');r.async=1;
                    r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
                    a.appendChild(r);
                })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
              `,
            }}
          />
        )}
        <ClientI18nProvider>
          {children}
        </ClientI18nProvider>
      </body>
    </html>
  )
}





