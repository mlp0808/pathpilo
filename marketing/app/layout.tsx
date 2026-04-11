import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ShowInterestSignalTracker } from './components/ShowInterestSignalTracker'

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
  const metaPixelId = '2410572729416293'
  const hotjarId = process.env.NEXT_PUBLIC_HOTJAR_ID
  const hotjarSv = process.env.NEXT_PUBLIC_HOTJAR_SV || '6'
  const shouldEnableHotjar = Boolean(hotjarId)

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
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
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
        {children}
        <ShowInterestSignalTracker />
      </body>
    </html>
  )
}