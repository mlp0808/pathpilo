'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import FeaturePageAnalytics from '../../components/FeaturePageAnalytics'
import FeatureMedia from '../../components/FeatureMedia'
import Breadcrumbs, { BREADCRUMB_ON_DARK } from '../../components/Breadcrumbs'
import { marketingImages } from '../../config/marketingImages'
import { breadcrumbsForRoute } from '../../lib/breadcrumbs'
import { resolveMarketingLocale, withAppLanguageParam } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  BanknotesIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

export default function AnalyticsDashboardFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="analytics" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'features/analytics')}
            className={BREADCRUMB_ON_DARK}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {da ? 'Dashboard & statistik' : 'Analytics dashboard'}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                {da
                  ? 'Se omsætning, jobs og teamets præstation ét sted'
                  : 'See revenue, jobs, and team performance in one place'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
                {da
                  ? 'PathPilos dashboard viser hvad der er afsluttet, hvad der er planlagt, og hvordan teamet performede — så du kan styre forretningen uden regneark.'
                  : 'PathPilo’s dashboard shows what’s completed, what’s scheduled, and how the team performed — so you can run the business without spreadsheets.'}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {(da
                  ? [
                      'Omsætning eller antal jobs over tid',
                      'Afsluttet vs. planlagt (inkl. abonnementer)',
                      'Teampræstation pr. medarbejder',
                    ]
                  : [
                      'Revenue or job count over time',
                      'Completed vs scheduled (including subscriptions)',
                      'Team performance per employee',
                    ]
                ).map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-gray-300 sm:text-base">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-400" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <Link
                  href={registerHref}
                  className="btn-primary inline-flex justify-center !px-6 !py-3 !text-base hover:!scale-100"
                  onClick={() =>
                    pushCtaClick({
                      ctaType: 'register',
                      ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                      linkUrl: registerHref,
                      location: 'feature_hero',
                      featureKey: 'analytics',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
              </div>
            </div>
            <div className="flex w-full justify-center lg:justify-end">
              <FeatureMedia
                src={marketingImages.features.analytics}
                alt={da ? 'PathPilo statistik-dashboard' : 'PathPilo analytics dashboard'}
                className="max-h-[min(42vh,380px)] max-w-xl lg:max-h-none lg:max-w-none"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Tal der hjælper dig med at beslutte' : 'Numbers that help you decide'}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: BanknotesIcon,
                  title: da ? 'Omsætningsoverblik' : 'Revenue overview',
                  text: da
                    ? 'Følg indtægt over året — dag for dag eller uge for uge.'
                    : 'Track income across the year — day by day or week by week.',
                },
                {
                  icon: ClipboardDocumentListIcon,
                  title: da ? 'Jobvolumen' : 'Job volume',
                  text: da
                    ? 'Se hvor mange jobs der er kørt, og hvor mange der kommer.'
                    : 'See how many jobs were done, and how many are coming.',
                },
                {
                  icon: CalendarDaysIcon,
                  title: da ? 'Planlagt vs. afsluttet' : 'Scheduled vs completed',
                  text: da
                    ? 'Inkluderer abonnementer, så fremtiden ikke er gætteri.'
                    : 'Includes subscriptions, so the future isn’t a guess.',
                },
                {
                  icon: UserGroupIcon,
                  title: da ? 'Teampræstation' : 'Team performance',
                  text: da
                    ? 'Omsætning, jobs og timer pr. medarbejder i den valgte periode.'
                    : 'Revenue, jobs, and hours per employee for the selected range.',
                },
                {
                  icon: ChartBarIcon,
                  title: da ? 'Enkel visualisering' : 'Simple charts',
                  text: da
                    ? 'Bygget til ejere — ikke til dataanalytikere.'
                    : 'Built for owners — not data analysts.',
                },
                {
                  icon: CheckCircleIcon,
                  title: da ? 'Altid opdateret' : 'Always up to date',
                  text: da
                    ? 'Dashboardet følger dine jobs og fakturaer automatisk.'
                    : 'The dashboard follows your jobs and invoices automatically.',
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
        title={da ? 'Få overblikket uden ekstra arbejde' : 'Get the overview without extra work'}
        subtitle={
          da
            ? 'Start gratis — dashboardet bygger sig selv, mens du planlægger og afslutter jobs.'
            : 'Start free — the dashboard builds itself as you schedule and complete jobs.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="analytics"
      />
      <Footer />
    </>
  )
}
