import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

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
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const gtmId = 'GTM-5FLVBF65'

  return (
    <html lang="en">
      <body className="antialiased">
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
        {children}
      </body>
    </html>
  )
}