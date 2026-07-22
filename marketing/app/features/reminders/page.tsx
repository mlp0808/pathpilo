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
import { resolveMarketingLocale, withAppLanguageParam } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  TruckIcon,
} from '@heroicons/react/24/outline'

export default function ClientRemindersFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="reminders" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24">
          <Breadcrumbs
            items={breadcrumbsForRoute(locale, 'features/reminders')}
            className={BREADCRUMB_ON_DARK}
          />
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent-400">
                {da ? 'Kundepåmindelser' : 'Client reminders'}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
                {da
                  ? 'Automatiske emails og SMS der stopper no-shows'
                  : 'Automated emails and SMS that cut no-shows'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
                {da
                  ? 'Send bookingbekræftelser, påmindelser før besøget og “jeg er på vej”-beskeder automatisk — så kunderne er hjemme, og du spilder færre ture.'
                  : 'Send booking confirmations, before-job reminders, and “on my way” messages automatically — so customers are home and you waste fewer trips.'}
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {(da
                  ? [
                      'Bekræftelse når jobbet oprettes',
                      'Påmindelse dagen før besøget',
                      'SMS når du er på vej',
                    ]
                  : [
                      'Confirmation when the job is created',
                      'Reminder the day before the visit',
                      'SMS when you’re on the way',
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
                      featureKey: 'reminders',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
              </div>
            </div>
            <div className="flex w-full justify-center lg:justify-end">
              <FeatureMedia
                src="/images/features/reminders-hero.webp"
                alt={da ? 'PathPilo kundepåmindelser' : 'PathPilo client reminders'}
                className="max-h-[min(42vh,380px)] max-w-xl lg:max-h-none lg:max-w-none"
                priority
                width={1600}
                height={1000}
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
              {da ? 'Beskeder der kører af sig selv' : 'Messages that run themselves'}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: EnvelopeIcon,
                  title: da ? 'Bookingbekræftelse' : 'Booking confirmation',
                  text: da
                    ? 'Kunden får en professionel email, når jobbet er planlagt.'
                    : 'Customers get a professional email when the job is scheduled.',
                },
                {
                  icon: BellAlertIcon,
                  title: da ? 'Påmindelse før job' : 'Before-job reminder',
                  text: da
                    ? 'Automatisk reminder, så de husker aftalen og er hjemme.'
                    : 'Automatic reminder so they remember the visit and are home.',
                },
                {
                  icon: TruckIcon,
                  title: da ? '“På vej”-SMS' : '“On my way” SMS',
                  text: da
                    ? 'Send besked når næste stop starter — færre låste porte.'
                    : 'Message when the next stop starts — fewer locked gates.',
                },
                {
                  icon: ChatBubbleLeftRightIcon,
                  title: da ? 'Redigér skabeloner' : 'Editable templates',
                  text: da
                    ? 'Tilpas tekst og tone, så det lyder som dig — ikke som et robotsystem.'
                    : 'Edit copy and tone so it sounds like you — not a robot.',
                },
                {
                  icon: DevicePhoneMobileIcon,
                  title: da ? 'Email og SMS' : 'Email and SMS',
                  text: da
                    ? 'Vælg den kanal der virker for dine kunder.'
                    : 'Choose the channel that works for your customers.',
                },
                {
                  icon: CheckCircleIcon,
                  title: da ? 'Fakturapåmindelser' : 'Invoice reminders',
                  text: da
                    ? 'Automatiske påmindelser når en faktura forfalder.'
                    : 'Automatic nudges when an invoice is due.',
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

      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="section-title text-left">
                {da ? 'Færre spildte ture. Flere afsluttede jobs.' : 'Fewer wasted trips. More finished jobs.'}
              </h2>
              <p className="mt-4 text-gray-600 leading-relaxed">
                {da
                  ? 'De fleste no-shows skyldes ikke dårlige kunder — de skyldes manglende påmindelser. PathPilo sender dem for dig, så du kan fokusere på arbejdet.'
                  : 'Most no-shows aren’t bad customers — they’re missing reminders. PathPilo sends them for you, so you can focus on the work.'}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-primary-100 bg-white shadow-lg md:rounded-2xl">
              <video
                className="h-auto w-full"
                autoPlay
                muted
                loop
                playsInline
                poster="/images/features/routes.png"
              >
                <source src="/images/features/routeplanning-automations.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Lad PathPilo tale med kunderne for dig' : 'Let PathPilo talk to customers for you'}
        subtitle={
          da
            ? 'Start gratis og slå bekræftelser og påmindelser til på få minutter.'
            : 'Start free and turn on confirmations and reminders in minutes.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="reminders"
      />
      <Footer />
    </>
  )
}
