import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import HomePage from '../../page'
import AboutPage from '../../about/page'
import ContactPage from '../../contact/page'
import FAQPage from '../../faq/page'
import PricingPage from '../../pricing/page'
import { isMarketingLocale } from '../../lib/i18n'

const SEO_BY_ROUTE = {
  '': {
    en: {
      title: 'PathPilo - Service Management Platform',
      description:
        'PathPilo helps service teams run scheduling, clients, jobs, and invoicing in one place. Built for mobile service businesses.',
    },
    da: {
      title: 'PathPilo - Serviceplatform til servicevirksomheder',
      description:
        'PathPilo samler planlægning, kunder, opgaver og fakturering ét sted. Bygget til mobile servicevirksomheder.',
    },
  },
  about: {
    en: {
      title: 'About PathPilo',
      description:
        'Learn about PathPilo, our mission, and how we help service businesses grow with smarter planning and operations.',
    },
    da: {
      title: 'Om PathPilo',
      description:
        'Læs om PathPilo, vores mission og hvordan vi hjælper servicevirksomheder med smartere planlægning og drift.',
    },
  },
  contact: {
    en: {
      title: 'Contact PathPilo',
      description:
        'Get in touch with PathPilo. Ask questions, request help, or talk to us about using PathPilo in your service business.',
    },
    da: {
      title: 'Kontakt PathPilo',
      description:
        'Kontakt PathPilo. Stil spørgsmål, få hjælp eller tal med os om at bruge PathPilo i din servicevirksomhed.',
    },
  },
  faq: {
    en: {
      title: 'PathPilo FAQ',
      description:
        'Find answers about PathPilo features, setup, scheduling, invoicing, team management, and support for service businesses.',
    },
    da: {
      title: 'PathPilo FAQ',
      description:
        'Find svar om PathPilo-funktioner, opsætning, planlægning, fakturering, teamstyring og support til servicevirksomheder.',
    },
  },
  pricing: {
    en: {
      title: 'PathPilo Pricing',
      description:
        'See PathPilo pricing information and request a custom plan for your service business. Start free with no credit card required.',
    },
    da: {
      title: 'PathPilo Priser',
      description:
        'Se prisinformation for PathPilo og få en plan, der passer til din servicevirksomhed. Kom i gang gratis uden kreditkort.',
    },
  },
} as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>
}): Promise<Metadata> {
  const resolved = await params
  const lang = isMarketingLocale(resolved.lang) ? resolved.lang : 'en'
  const route = (resolved.slug ?? []).join('/')
  const seo = SEO_BY_ROUTE[route as keyof typeof SEO_BY_ROUTE]
  if (!seo) {
    return {}
  }
  const current = seo[lang]
  const routePath = route ? `/${route}` : ''
  const canonical = `/${lang}${routePath}`
  const enAlt = `/en${routePath}`
  const daAlt = `/da${routePath}`

  return {
    title: current.title,
    description: current.description,
    alternates: {
      canonical,
      languages: {
        en: enAlt,
        da: daAlt,
        'x-default': enAlt,
      },
    },
  }
}

export default async function LocalizedMarketingPage({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>
}) {
  const resolved = await params
  if (!isMarketingLocale(resolved.lang)) {
    notFound()
  }

  const slug = resolved.slug ?? []
  const route = slug.join('/')

  if (route === '') return <HomePage locale={resolved.lang} />
  if (route === 'about') return <AboutPage locale={resolved.lang} />
  if (route === 'contact') return <ContactPage locale={resolved.lang} />
  if (route === 'faq') return <FAQPage locale={resolved.lang} />
  if (route === 'pricing') return <PricingPage locale={resolved.lang} />

  notFound()
}
