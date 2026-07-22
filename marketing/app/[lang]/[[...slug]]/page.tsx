import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import HomePage from '../../page'
import AboutPage from '../../about/page'
import ContactPage from '../../contact/page'
import FAQContent from '../../faq/FAQContent'
import PricingPage from '../../pricing/page'
import RoutePlanningFeaturePage from '../../features/routeplanning/page'
import SubscriptionsFeaturePage from '../../features/subscriptions/page'
import TeamManagementFeaturePage from '../../features/team/page'
import JobSchedulingFeaturePage from '../../features/scheduling/page'
import LeadFormsFeaturePage from '../../features/leads/page'
import ClientRemindersFeaturePage from '../../features/reminders/page'
import AnalyticsDashboardFeaturePage from '../../features/analytics/page'
import ServiceCatalogFeaturePage from '../../features/services/page'
import { TermsContent } from '../../terms/TermsContent'
import { PrivacyContent } from '../../privacy/PrivacyContent'
import { isMarketingLocale } from '../../lib/i18n'
import type { MarketingLocale } from '../../lib/i18n'
import JsonLd from '../../components/JsonLd'
import { getSiteFaqs } from '../../lib/faqData'
import {
  breadcrumbSchema,
  faqPageSchema,
  softwareApplicationSchema,
} from '../../lib/schema'
import { bilingualPageMetadata } from '../../lib/seo'

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
  'features/routeplanning': {
    en: {
      title: 'Route Planning Software for Service Teams | PathPilo',
      description:
        'Plan faster routes, rebalance jobs across employees, and see live duration impact with PathPilo Route Planning and Week Planner.',
    },
    da: {
      title: 'Routeplanning til serviceteams | PathPilo',
      description:
        'Planlaeg hurtigere ruter, flyt opgaver mellem medarbejdere og se live effekt pa varighed med PathPilo Route Planning og Ugeplanlaegger.',
    },
  },
  'features/subscriptions': {
    en: {
      title: 'Subscription Tasks & Recurring Jobs for Service Teams | PathPilo',
      description:
        'Manage unlimited client subscriptions, weekly or monthly schedules, reminders, notes, invoicing, and online confirmations in PathPilo.',
    },
    da: {
      title: 'Abonnementsopgaver og tilbagevendende jobs | PathPilo',
      description:
        'Styr ubegraensede kundeabonnementer med uge- eller maanedsplan, paamindelser, noter, fakturering og online bekraeftelser i PathPilo.',
    },
  },
  'features/team': {
    en: {
      title: 'Team Management for Service Businesses | PathPilo',
      description:
        'Manage unlimited employees, assign jobs and routes, handle time-off requests, and follow mobile progress in real time with PathPilo.',
    },
    da: {
      title: 'Teamstyring til servicevirksomheder | PathPilo',
      description:
        'Styr ubegrænset antal medarbejdere, tildel jobs og ruter, håndter fri-anmodninger og følg mobil-fremskridt i realtid med PathPilo.',
    },
  },
  'features/scheduling': {
    en: {
      title: 'Job Scheduling Software for Service Teams | PathPilo',
      description:
        'Plan jobs in week and month views, drag-and-drop between days and employees, then open day view for full route planning with PathPilo.',
    },
    da: {
      title: 'Opgaveplanlægning til serviceteams | PathPilo',
      description:
        'Planlæg jobs i uge- og månedsvisning, træk mellem dage og medarbejdere, og åbn dagsvisning for fuld ruteplanlægning med PathPilo.',
    },
  },
  'features/leads': {
    en: {
      title: 'Lead Forms for Service Businesses | PathPilo',
      description:
        'Build a branded website lead form, capture quote requests, track your pipeline, and convert leads into clients and jobs with PathPilo.',
    },
    da: {
      title: 'Leadformularer til servicevirksomheder | PathPilo',
      description:
        'Byg en branded leadformular til din hjemmeside, fang tilbudsanmodninger, følg pipeline og konvertér leads til kunder og jobs med PathPilo.',
    },
  },
  'features/reminders': {
    en: {
      title: 'Client Reminders & Appointment Notifications | PathPilo',
      description:
        'Send automated booking confirmations, before-job reminders, and on-my-way SMS to cut no-shows and wasted trips with PathPilo.',
    },
    da: {
      title: 'Kundepåmindelser og aftalebeskeder | PathPilo',
      description:
        'Send automatiske bookingbekræftelser, påmindelser før jobs og “på vej”-SMS, så du undgår no-shows og spildte ture med PathPilo.',
    },
  },
  'features/analytics': {
    en: {
      title: 'Analytics Dashboard for Service Businesses | PathPilo',
      description:
        'Track revenue, job volume, scheduled vs completed work, and team performance in one simple dashboard with PathPilo.',
    },
    da: {
      title: 'Statistik-dashboard til servicevirksomheder | PathPilo',
      description:
        'Følg omsætning, jobvolumen, planlagt vs. afsluttet og teampræstation i ét enkelt dashboard med PathPilo.',
    },
  },
  'features/services': {
    en: {
      title: 'Service Catalog for Field Service Businesses | PathPilo',
      description:
        'Create reusable services with default price and duration, then use them when scheduling jobs and recurring work in PathPilo.',
    },
    da: {
      title: 'Ydelseskatalog til servicevirksomheder | PathPilo',
      description:
        'Opret genbrugelige ydelser med standardpris og varighed, og brug dem når du planlægger jobs og abonnementer i PathPilo.',
    },
  },
  terms: {
    en: {
      title: 'Terms of Service | PathPilo',
      description:
        'The PathPilo Terms of Service. The agreement between you and PathPilo when you use our service management platform.',
    },
    da: {
      title: 'Servicevilkår | PathPilo',
      description:
        'PathPilos servicevilkår. Aftalen mellem dig og PathPilo, når du bruger vores serviceplatform.',
    },
  },
  privacy: {
    en: {
      title: 'Privacy Policy | PathPilo',
      description:
        'How PathPilo collects, uses and protects your data. Read our Privacy Policy and your rights under GDPR.',
    },
    da: {
      title: 'Privatlivspolitik | PathPilo',
      description:
        'Hvordan PathPilo indsamler, bruger og beskytter dine data. Læs vores privatlivspolitik og dine rettigheder under GDPR.',
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
  const ogByRoute: Record<string, string> = {
    pricing: '/images/og/og-pricing.png',
    'features/routeplanning': '/images/og/og-routeplanning.png',
  }

  return bilingualPageMetadata({
    lang,
    path: routePath || '/',
    title: current.title,
    description: current.description,
    image: ogByRoute[route],
  })
}

function pageSchemas(lang: MarketingLocale, route: string) {
  const da = lang === 'da'
  const graphs: Record<string, unknown>[] = []

  if (route === '') {
    graphs.push(
      softwareApplicationSchema({
        description: da
          ? 'PathPilo samler planlægning, kunder, opgaver og fakturering ét sted. Bygget til mobile servicevirksomheder.'
          : 'PathPilo helps service teams run scheduling, clients, jobs, and invoicing in one place. Built for mobile service businesses.',
        url: `/${lang}`,
        locale: lang,
      }),
    )
  }

  if (route === 'faq') {
    graphs.push(
      faqPageSchema(getSiteFaqs(lang)),
      breadcrumbSchema([
        { name: da ? 'Hjem' : 'Home', path: `/${lang}` },
        { name: 'FAQ', path: `/${lang}/faq` },
      ]),
    )
  }

  if (route === 'pricing') {
    graphs.push(
      softwareApplicationSchema({
        description: da
          ? 'Se PathPilo-priser. Kom i gang gratis uden kreditkort — betal først når du har brug for flere medarbejdere på samme dag.'
          : 'See PathPilo pricing. Start free with no credit card — pay only when you need multiple employees on the same day.',
        url: `/${lang}/pricing`,
        locale: lang,
        offerDescription: da
          ? 'Gratis forever for ubegrænsede kunder og opgaver'
          : 'Free forever for unlimited clients and jobs',
      }),
      breadcrumbSchema([
        { name: da ? 'Hjem' : 'Home', path: `/${lang}` },
        { name: da ? 'Priser' : 'Pricing', path: `/${lang}/pricing` },
      ]),
    )
  }

  if (route.startsWith('features/')) {
    const featureLabels: Record<string, { en: string; da: string }> = {
      'features/routeplanning': { en: 'Route Planning', da: 'Routeplanning' },
      'features/subscriptions': { en: 'Recurring Jobs', da: 'Abonnementsopgaver' },
      'features/team': { en: 'Team Management', da: 'Teamstyring' },
      'features/scheduling': { en: 'Job Scheduling', da: 'Opgaveplanlægning' },
      'features/leads': { en: 'Lead Forms', da: 'Leadformularer' },
      'features/reminders': { en: 'Client Reminders', da: 'Kundepåmindelser' },
      'features/analytics': { en: 'Analytics', da: 'Dashboard & statistik' },
      'features/services': { en: 'Service Catalog', da: 'Ydelser' },
    }
    const labels = featureLabels[route]
    const featureLabel = labels ? (da ? labels.da : labels.en) : da ? 'Funktion' : 'Feature'
    const seo = SEO_BY_ROUTE[route as keyof typeof SEO_BY_ROUTE]
    graphs.push(
      softwareApplicationSchema({
        name: `PathPilo — ${featureLabel}`,
        description: seo?.[lang].description ?? 'PathPilo',
        url: `/${lang}/${route}`,
        locale: lang,
      }),
      breadcrumbSchema([
        { name: da ? 'Hjem' : 'Home', path: `/${lang}` },
        { name: featureLabel, path: `/${lang}/${route}` },
      ]),
    )
  }

  return graphs
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
  const schemas = pageSchemas(resolved.lang, route)

  const page =
    route === '' ? (
      <HomePage locale={resolved.lang} />
    ) : route === 'about' ? (
      <AboutPage locale={resolved.lang} />
    ) : route === 'contact' ? (
      <ContactPage locale={resolved.lang} />
    ) : route === 'faq' ? (
      <FAQContent locale={resolved.lang} />
    ) : route === 'pricing' ? (
      <PricingPage locale={resolved.lang} />
    ) : route === 'features/routeplanning' ? (
      <RoutePlanningFeaturePage locale={resolved.lang} />
    ) : route === 'features/subscriptions' ? (
      <SubscriptionsFeaturePage locale={resolved.lang} />
    ) : route === 'features/team' ? (
      <TeamManagementFeaturePage locale={resolved.lang} />
    ) : route === 'features/scheduling' ? (
      <JobSchedulingFeaturePage locale={resolved.lang} />
    ) : route === 'features/leads' ? (
      <LeadFormsFeaturePage locale={resolved.lang} />
    ) : route === 'features/reminders' ? (
      <ClientRemindersFeaturePage locale={resolved.lang} />
    ) : route === 'features/analytics' ? (
      <AnalyticsDashboardFeaturePage locale={resolved.lang} />
    ) : route === 'features/services' ? (
      <ServiceCatalogFeaturePage locale={resolved.lang} />
    ) : route === 'terms' ? (
      <TermsContent locale={resolved.lang} />
    ) : route === 'privacy' ? (
      <PrivacyContent locale={resolved.lang} />
    ) : null

  if (!page) notFound()

  return (
    <>
      {schemas.length > 0 && <JsonLd data={schemas} />}
      {page}
    </>
  )
}
