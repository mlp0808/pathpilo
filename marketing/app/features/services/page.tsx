'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import FeaturePageAnalytics from '../../components/FeaturePageAnalytics'
import FeatureMedia from '../../components/FeatureMedia'
import Breadcrumbs, { BREADCRUMB_ON_DARK } from '../../components/Breadcrumbs'
import { breadcrumbsForRoute } from '../../lib/breadcrumbs'
import { resolveMarketingLocale, withAppLanguageParam, withLocalePath } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  BanknotesIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'

export default function ServiceCatalogFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="services" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'features/services')}
            className={BREADCRUMB_ON_DARK}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {da ? 'Ydelser' : 'Service catalog'}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                {da
                  ? 'Genbrugelige ydelser med pris og varighed'
                  : 'Reusable services with price and duration'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
                {da
                  ? 'Opret dit ydelseskatalog én gang — titel, pris og typisk varighed. Når du opretter jobs eller abonnementer, vælger du bare ydelsen og tilpasser den til kunden.'
                  : 'Set up your service catalog once — title, price, and typical duration. When you create jobs or subscriptions, pick the service and customise it per client.'}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {(da
                  ? [
                      'Standardpris og varighed pr. ydelse',
                      'Hurtig joboprettelse uden at taste alt igen',
                      'Kan overskrives pr. kunde eller job',
                    ]
                  : [
                      'Standard price and duration per service',
                      'Faster job creation without retyping',
                      'Override per client or job when needed',
                    ]
                ).map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-gray-300 sm:text-base">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-400" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  href={registerHref}
                  className="btn-primary inline-flex justify-center !px-6 !py-3 !text-base hover:!scale-100"
                  onClick={() =>
                    pushCtaClick({
                      ctaType: 'register',
                      ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                      linkUrl: registerHref,
                      location: 'feature_hero',
                      featureKey: 'services',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
                <Link
                  href={withLocalePath(locale, '/features/subscriptions')}
                  className="inline-flex justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 hover:text-white"
                >
                  {da ? 'Se abonnementsopgaver' : 'See recurring jobs'}
                </Link>
              </div>
            </div>
            <div className="flex w-full justify-center lg:justify-end">
              <FeatureMedia
                src="/images/features/services-hero.webp"
                alt={da ? 'PathPilo ydelseskatalog' : 'PathPilo service catalog'}
                className="max-h-[min(42vh,380px)] max-w-xl lg:max-h-none lg:max-w-none"
                priority
                width={1600}
                height={1000}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Et katalog der sparer tid hver dag' : 'A catalog that saves time every day'}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: Squares2X2Icon,
                  title: da ? 'Alle ydelser ét sted' : 'All services in one place',
                  text: da
                    ? 'Hold styr på hvad I tilbyder — uden at huske priser udenad.'
                    : 'Keep track of what you offer — without memorising prices.',
                },
                {
                  icon: BanknotesIcon,
                  title: da ? 'Pris som standard' : 'Default pricing',
                  text: da
                    ? 'Sæt en standardpris, så fakturering starter rigtigt.'
                    : 'Set a default price so invoicing starts correctly.',
                },
                {
                  icon: ClockIcon,
                  title: da ? 'Varighed til planlægning' : 'Duration for planning',
                  text: da
                    ? 'Typisk tid hjælper dig med at fylde dagen realistisk.'
                    : 'Typical duration helps you fill the day realistically.',
                },
                {
                  icon: DocumentDuplicateIcon,
                  title: da ? 'Genbrug i jobs' : 'Reuse in jobs',
                  text: da
                    ? 'Vælg ydelsen når du opretter jobs eller abonnementer.'
                    : 'Pick the service when you create jobs or subscriptions.',
                },
                {
                  icon: PencilSquareIcon,
                  title: da ? 'Tilpas pr. kunde' : 'Customise per client',
                  text: da
                    ? 'Standardværdier kan ændres på det enkelte job.'
                    : 'Defaults can be overridden on the individual job.',
                },
                {
                  icon: CheckCircleIcon,
                  title: da ? 'Hurtigere opsætning' : 'Faster setup',
                  text: da
                    ? 'Især nyttigt når nye medarbejdere opretter jobs.'
                    : 'Especially useful when new staff create jobs.',
                },
              ] as const
            ).map((card) => (
              <article key={card.title} className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm md:p-8">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-800">
                  <card.icon className="h-6 w-6 stroke-[1.8]" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-primary-800">{card.title}</h3>
                <p className="leading-relaxed text-gray-600">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Sæt dit katalog op på få minutter' : 'Set up your catalog in minutes'}
        subtitle={
          da
            ? 'Start gratis — tilføj dine ydelser, og opret næste job hurtigere.'
            : 'Start free — add your services, and create the next job faster.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="services"
      />
      <Footer />
    </>
  )
}
