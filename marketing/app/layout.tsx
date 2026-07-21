import type { Metadata } from 'next'
import Script from 'next/script'
import { headers } from 'next/headers'
import { Inter } from 'next/font/google'
import './globals.css'
import { ShowInterestSignalTracker } from './components/ShowInterestSignalTracker'
import { CrispChat } from '../components/CrispChat'
import JsonLd from './components/JsonLd'
import { organizationSchema, webSiteSchema } from './lib/schema'
import type { MarketingLocale } from './lib/i18n'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'PathPilo - Complete Service Management Platform for Mobile Service Businesses',
    template: '%s | PathPilo',
  },
  description: 'Streamline your service business operations with PathPilo. Manage scheduling, clients, jobs, invoicing, and team coordination all in one powerful platform. Perfect for cleaning companies, landscapers, and home maintenance services.',
  keywords: [
    'service management software',
    'field service management',
    'job scheduling software',
    'client management',
    'service business software',
    'mobile service management',
    'recurring jobs',
    'team scheduling',
    'service invoicing',
    'lead management',
  ],
  authors: [{ name: 'PathPilo Team' }],
  creator: 'PathPilo',
  publisher: 'PathPilo',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://pathpilo.com'),
  icons: {
    icon: '/pathpilo_favicon.png',
    apple: '/pathpilo_favicon.png',
  },
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': [{ url: '/articles/rss.xml', title: 'PathPilo Articles' }],
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://pathpilo.com',
    siteName: 'PathPilo',
    title: 'PathPilo - Complete Service Management Platform',
    description: 'The all-in-one platform for managing your mobile service business',
    images: [
      {
        url: '/images/og/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PathPilo Service Management Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PathPilo - Complete Service Management Platform',
    description: 'The all-in-one platform for managing your mobile service business',
    images: ['/images/og/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const locale = (headersList.get('x-locale') || 'en') as MarketingLocale
  const gtmId = 'GTM-5FLVBF65'
  const hotjarId = process.env.NEXT_PUBLIC_HOTJAR_ID
  const hotjarSv = process.env.NEXT_PUBLIC_HOTJAR_SV || '6'
  const shouldEnableHotjar = Boolean(hotjarId)
  const schemaLocale = locale === 'da' ? 'da' : 'en'

  return (
    <html lang={locale} className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <JsonLd data={[organizationSchema(schemaLocale), webSiteSchema(schemaLocale)]} />
        {/* GTM — all pixels and tags are fired from GTM, not hardcoded here. */}
        <Script
          id="gtm-base"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`,
          }}
        />
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {shouldEnableHotjar && (
          <Script
            id="hotjar-init"
            strategy="beforeInteractive"
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
        <CrispChat />
        {children}
        <ShowInterestSignalTracker />
      </body>
    </html>
  )
}