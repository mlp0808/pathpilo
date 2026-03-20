import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ClientI18nProvider } from './components/I18nProvider'

export const metadata: Metadata = {
  title: 'PathPilo - Client Management for Service Companies',
  description: 'Streamline your service business with PathPilo. Manage clients, jobs, and recurring tasks all in one place.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const hotjarId = process.env.NEXT_PUBLIC_HOTJAR_ID
  const hotjarSv = process.env.NEXT_PUBLIC_HOTJAR_SV || '6'
  const shouldEnableHotjar = Boolean(hotjarId)

  return (
    <html lang="en">
      <body className="antialiased">
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





