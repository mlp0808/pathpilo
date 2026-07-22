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
import { resolveMarketingLocale, withAppLanguageParam, withLocalePath } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  ArrowsRightLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  MapIcon,
  UserGroupIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline'

export default function JobSchedulingFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="scheduling" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'features/scheduling')}
            className={BREADCRUMB_ON_DARK}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {da ? 'Opgaveplanlægning' : 'Job scheduling'}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                {da
                  ? 'Jobkalender der gør ugen overskuelig'
                  : 'A job calendar that makes the week clear'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
                {da
                  ? 'Planlæg opgaver i uge-, måned- eller dagsvisning. Træk jobs mellem dage og medarbejdere, og hop direkte til ruteplanlægning når dagen skal køres.'
                  : 'Schedule jobs in week, month, or day view. Drag work between days and people, then jump straight into route planning when it’s time to drive.'}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {(da
                  ? [
                      'Uge-, måned- og årsvisning af alle jobs',
                      'Træk-og-slip mellem dage og medarbejdere',
                      'Dagsvisning åbner den fulde ruteplanlægger',
                    ]
                  : [
                      'Week, month, and year views of every job',
                      'Drag-and-drop between days and employees',
                      'Day view opens the full route planner',
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
                      featureKey: 'scheduling',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
                <Link
                  href={withLocalePath(locale, '/features/routeplanning')}
                  className="inline-flex justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 hover:text-white"
                >
                  {da ? 'Se ruteplanlægning' : 'See route planning'}
                </Link>
              </div>
            </div>
            <div className="flex w-full justify-center lg:justify-end">
              <FeatureMedia
                src={marketingImages.features.scheduling}
                alt={da ? 'PathPilo jobkalender' : 'PathPilo job calendar'}
                className="max-h-[min(42vh,380px)] max-w-xl lg:max-h-none lg:max-w-none"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-white py-12 md:py-14">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 md:gap-6">
          {(
            [
              {
                title: da ? 'Én kalender for hele teamet' : 'One calendar for the whole team',
                text: da
                  ? 'Se alle jobs, alle medarbejdere og al kapacitet i samme overblik.'
                  : 'See every job, every employee, and all capacity in one place.',
              },
              {
                title: da ? 'Hurtige ændringer' : 'Fast rescheduling',
                text: da
                  ? 'Flyt et job med et træk — planen opdateres med det samme.'
                  : 'Move a job with a drag — the plan updates instantly.',
              },
              {
                title: da ? 'Fra plan til rute' : 'From plan to route',
                text: da
                  ? 'Åbn dagsvisningen, og du er i ruteplanlæggeren med kort og stop.'
                  : 'Open day view and you’re in the route planner with map and stops.',
              },
              {
                title: da ? 'Fungerer med abonnementer' : 'Works with recurring jobs',
                text: da
                  ? 'Tilbagevendende jobs lander automatisk i kalenderen.'
                  : 'Recurring jobs land in the calendar automatically.',
              },
            ] as const
          ).map((item) => (
            <div key={item.title} className="rounded-2xl border border-primary-100 bg-primary-50/40 p-5 md:p-6">
              <p className="text-sm font-semibold text-primary-800">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Planlæg dagen, ugen og måneden uden kaos' : 'Plan the day, week, and month without the chaos'}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: ViewColumnsIcon,
                  title: da ? 'Uge- og månedsvisning' : 'Week and month views',
                  text: da
                    ? 'Se belastning på tværs af dage, så ingen dag bliver for tung.'
                    : 'See load across days so no day gets overloaded.',
                },
                {
                  icon: ArrowsRightLeftIcon,
                  title: da ? 'Træk-og-slip planlægning' : 'Drag-and-drop scheduling',
                  text: da
                    ? 'Flyt jobs mellem dage og medarbejdere på sekunder.'
                    : 'Move jobs between days and people in seconds.',
                },
                {
                  icon: UserGroupIcon,
                  title: da ? 'Tildeling til team' : 'Team assignment',
                  text: da
                    ? 'Giv hver opgave en ejer — medarbejderen ser den i sin egen kalender.'
                    : 'Give every job an owner — they see it on their own calendar.',
                },
                {
                  icon: MapIcon,
                  title: da ? 'Dagsvisning = ruteplan' : 'Day view = route plan',
                  text: da
                    ? 'Når du åbner dagen, får du kort, rækkefølge og kørselstid.'
                    : 'Open the day and you get map, stop order, and drive time.',
                },
                {
                  icon: CalendarDaysIcon,
                  title: da ? 'Status på hvert job' : 'Status on every job',
                  text: da
                    ? 'Se hvad der er planlagt, i gang og afsluttet — uden at ringe rundt.'
                    : 'See what’s scheduled, in progress, and done — without chasing people.',
                },
                {
                  icon: ClockIcon,
                  title: da ? 'Kapacitet og arbejdstid' : 'Capacity and work hours',
                  text: da
                    ? 'Planlæg inden for medarbejdernes timer, så dagen holder.'
                    : 'Plan within employee hours so the day actually fits.',
                },
              ] as const
            ).map((card) => (
              <article
                key={card.title}
                className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm md:p-8"
              >
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

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
                {da ? 'Sådan virker det' : 'How it works'}
              </p>
              <h2 className="section-title text-left">
                {da ? 'Kalender først — rute når det gælder' : 'Calendar first — route when it matters'}
              </h2>
              <p className="mt-4 text-gray-600 leading-relaxed">
                {da
                  ? 'De fleste servicevirksomheder planlægger ugen i en kalender og kører dagen på et kort. PathPilo gør begge dele i samme system, så du ikke skifter mellem regneark, WhatsApp og Google Maps.'
                  : 'Most service businesses plan the week in a calendar and run the day on a map. PathPilo does both in one system — so you stop bouncing between spreadsheets, WhatsApp, and Google Maps.'}
              </p>
              <ul className="mt-6 space-y-3">
                {(da
                  ? [
                      'Læg jobs ind i ugen',
                      'Fordel dem på medarbejdere',
                      'Åbn dagen og optimér ruten',
                    ]
                  : ['Drop jobs into the week', 'Assign them to people', 'Open the day and optimise the route']
                ).map((step) => (
                  <li key={step} className="flex gap-3 text-gray-700">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-600" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
            <FeatureMedia
              src={marketingImages.features.jobs}
              alt={da ? 'PathPilo opgaveliste' : 'PathPilo job list'}
              label={da ? 'Screenshot kommer snart' : 'Screenshot coming soon'}
            />
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Klar til en kalender der faktisk hjælper?' : 'Ready for a calendar that actually helps?'}
        subtitle={
          da
            ? 'Start gratis og planlæg din første uge i PathPilo — ingen kreditkort.'
            : 'Start free and plan your first week in PathPilo — no credit card.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="scheduling"
      />
      <Footer />
    </>
  )
}
