'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import FeaturePageAnalytics from '../../components/FeaturePageAnalytics'
import { marketingImages } from '../../config/marketingImages'
import { resolveMarketingLocale, withAppLanguageParam } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  ArrowPathIcon,
  BanknotesIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

export default function SubscriptionsFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <FeaturePageAnalytics featureKey="subscriptions" />
      <Header />

      <section className="relative overflow-hidden bg-[#0a1414]">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-1/4 bottom-0 h-[380px] w-[380px] rounded-full bg-teal-600/5 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 md:pt-20 md:pb-24 lg:pt-24 lg:pb-28 xl:pt-28 xl:pb-32">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
            <div className="order-1 mx-auto max-w-xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
                {da ? 'Abonnementsopgaver' : 'Subscription tasks'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg md:mx-auto md:max-w-lg lg:mx-0">
                {da
                  ? 'Opret lige så mange abonnementer til lige så mange kunder, som du har brug for. Ugentlig rytme eller fast dato hver måned — med tidsstyring, noter og fakturering efter jeres præferencer.'
                  : 'Add as many subscriptions to as many clients as you need. Run jobs weekly or on a day of the month — time them right, capture special notes, and invoice the way you prefer.'}
              </p>

              <ul className="mt-8 space-y-3 text-left md:mx-auto md:max-w-lg lg:mx-0">
                {(da
                  ? [
                      'Ubegrænset antal abonnementer og kunder',
                      'Ugebaserede planer eller fast månedsdato',
                      'Automatiske påmindelser og online bekræftelser',
                    ]
                  : [
                      'Unlimited subscriptions across your client base',
                      'Weekly schedules or a fixed day of the month',
                      'Automatic reminders and online confirmations',
                    ]
                ).map((line) => (
                  <li key={line} className="flex gap-3 text-sm text-gray-300 sm:text-base">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-400" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col items-stretch gap-3 sm:mx-auto sm:max-w-md sm:flex-row sm:items-center sm:justify-center lg:mx-0 lg:max-w-none lg:justify-start">
                <Link
                  href={registerHref}
                  className="btn-primary inline-flex justify-center !px-6 !py-3 !text-base hover:!scale-100"
                  onClick={() =>
                    pushCtaClick({
                      ctaType: 'register',
                      ctaLabel: da ? 'Kom i gang gratis' : 'Get Started Free',
                      linkUrl: registerHref,
                      location: 'feature_hero',
                      featureKey: 'subscriptions',
                    })
                  }
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
                <a
                  href="#walkthrough"
                  className="inline-flex justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 transition hover:text-white"
                >
                  {da ? 'Se hvordan det hænger sammen' : 'See how it fits together'}
                </a>
              </div>
            </div>

            <div className="order-2 flex w-full justify-center lg:justify-end">
              <Image
                src={marketingImages.features.recurring}
                alt={da ? 'PathPilo abonnementsopgaver' : 'PathPilo subscription tasks'}
                width={1600}
                height={1000}
                className="h-auto w-full max-h-[min(42vh,380px)] max-w-xl object-contain lg:max-h-none lg:max-w-none"
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {(
              [
                {
                  title: da ? 'Ingen grænse for abonnementer' : 'No limit on subscriptions',
                  text: da
                    ? 'Opret så mange planer pr. kunde som du vil — uden at det bliver uoverskueligt.'
                    : 'Create as many plans per client as you want — without losing overview.',
                },
                {
                  title: da ? 'Påmindelser til kunder' : 'Client reminders',
                  text: da
                    ? 'Automatiske beskeder og online bekræftelser reducerer misforståelser og no-shows.'
                    : 'Automatic messages and online confirmations reduce misunderstandings and no-shows.',
                },
                {
                  title: da ? 'Detaljeret logning' : 'Extensive logging',
                  text: da
                    ? 'Hold styr på ændringer, noter og aftaler, så teamet altid ved hvad der gælder.'
                    : 'Track changes, notes, and agreements so the team always knows what’s true.',
                },
                {
                  title: da ? 'Betalingsstatus' : 'Payment status',
                  text: da
                    ? 'Se hvad der er betalt, hvad der mangler, og hvad der skal faktureres — i samme flow.'
                    : 'See what’s paid, what’s outstanding, and what should be invoiced — in the same flow.',
                },
              ] as const
            ).map((item) => (
              <div key={item.title} className="rounded-2xl border border-primary-100 bg-primary-50/40 p-5 md:p-6">
                <p className="text-sm font-semibold text-primary-800">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-28">
        <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-accent-500/5 blur-3xl max-md:opacity-40" />
        <div className="pointer-events-none absolute bottom-20 left-0 h-64 w-64 rounded-full bg-primary-500/5 blur-3xl max-md:opacity-40" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Alt til tilbagevendende opgaver og faste kunder' : 'Everything for recurring work and long-term clients'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Ét sted at definere rytme, kommunikation og økonomi — så felt og kontor arbejder i samme spor.'
                : 'One place to define rhythm, communication, and billing — so field and office stay aligned.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: UserGroupIcon,
                  title: da ? 'Mange abonnementer, mange kunder' : 'Many subscriptions, many clients',
                  text: da
                    ? 'Tilføj hurtigt nye abonnementer og knyt dem til de kunder, der skal have faste besøg eller service.'
                    : 'Add subscriptions fast and attach them to every client who needs recurring visits or service.',
                },
                {
                  icon: CalendarDaysIcon,
                  title: da ? 'Uge eller fast månedsdato' : 'Weekly or a day of the month',
                  text: da
                    ? 'Vælg om opgaver skal følge ugen — eller lande på en bestemt dato hver måned.'
                    : 'Choose whether jobs follow the week or land on a specific date each month.',
                },
                {
                  icon: ClockIcon,
                  title: da ? 'Tidsstyring der passer til drift' : 'Timing that fits your operation',
                  text: da
                    ? 'Placer jobs, så de rammer det rigtige tidsrum for både team og kunde.'
                    : 'Time jobs so they land when your team and customers expect them.',
                },
                {
                  icon: ClipboardDocumentListIcon,
                  title: da ? 'Noter til særlige behov' : 'Notes for special needs',
                  text: da
                    ? 'Gem instruktioner og detaljer pr. kunde, så feltet altid ved, hvad der gælder.'
                    : 'Keep instructions and details per client so the field always knows what matters.',
                },
                {
                  icon: BanknotesIcon,
                  title: da ? 'Fakturering efter jeres præferencer' : 'Invoicing to match how you work',
                  text: da
                    ? 'Fakturér abonnementsarbejde på den måde, der passer til jeres aftaler og prissætning.'
                    : 'Invoice subscription work the way that fits your agreements and pricing.',
                },
                {
                  icon: BellAlertIcon,
                  title: da ? 'Påmindelser og online svar' : 'Reminders and online responses',
                  text: da
                    ? 'Kunder får påmindelser, kan ændre opgaver og bekræfte — med jeres kontrol.'
                    : 'Clients get reminders, can adjust tasks, and confirm online — with your oversight.',
                },
              ] as const
            ).map((card) => (
              <article
                key={card.title}
                className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-6 shadow-none transition-all duration-300 hover:border-primary-200 sm:shadow-sm md:p-8 md:shadow-lg md:hover:-translate-y-1 md:hover:shadow-xl"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-800 opacity-[0.03] transition-opacity group-hover:opacity-[0.05]" />
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

      <section id="walkthrough" className="bg-[#f4f7f6] py-14 md:bg-white md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-3xl text-center md:mb-20">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'To sider af samme løsning' : 'Two sides of one solution'}
            </p>
            <h2 className="section-title">
              {da ? 'Planlæg abonnementer — og hold kunderne med' : 'Plan subscriptions — and keep clients in the loop'}
            </h2>
          </div>

          <div className="mb-8 md:mb-0">
            <div className="mb-0 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mb-24 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:mb-36 xl:gap-18">
              <div className="relative order-2 lg:order-1">
                <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-accent-500/5 to-emerald-500/5 blur-sm md:block" />
                <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
                  <video
                    className="h-auto w-full"
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster="/images/features/routeplanning-weekplanner-placeholder.svg"
                    aria-label={da ? 'Abonnementer og tilbagevendende opgaver i PathPilo' : 'Subscriptions and recurring tasks in PathPilo'}
                  >
                    <source src="/images/features/routeplanning-subscriptions.mp4" type="video/mp4" />
                  </video>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                  <span className="text-sm font-semibold text-accent-700">
                    {da ? 'Opsætning & rytme' : 'Setup & rhythm'}
                  </span>
                </div>
                <h3 className="mb-4 text-2xl font-bold text-primary-800 md:text-3xl">
                  {da ? 'Byg abonnementer der matcher jeres aftaler' : 'Build subscriptions that match your agreements'}
                </h3>
                <p className="mb-4 text-base leading-relaxed text-gray-600">
                  {da
                    ? 'Opret så mange abonnementer, du har brug for, og knyt dem til de rigtige kunder. Vælg om opgaver skal gentages ugen igennem eller styres af en fast dato i måneden.'
                    : 'Create as many subscriptions as you need and tie them to the right clients. Decide whether work repeats through the week or follows a fixed day of the month.'}
                </p>
                <p className="mb-6 text-base leading-relaxed text-gray-600">
                  {da
                    ? 'Tilføj noter til særlige forhold, og styr tidspunkter så jobs lander, når det giver mening for både team og kunde.'
                    : 'Add notes for special situations and set timing so jobs land when they make sense for your team and the customer.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(da
                    ? ['Ugentlig / månedlig', 'Flere pr. kunde', 'Klientnoter', 'Tidsstyring']
                    : ['Weekly / monthly', 'Multiple per client', 'Client notes', 'Smart timing']
                  ).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18">
            <div className="order-2 lg:order-1">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">
                  {da ? 'Kunder & økonomi' : 'Clients & billing'}
                </span>
              </div>
              <h3 className="mb-4 text-2xl font-bold text-primary-800 md:text-3xl">
                {da ? 'Påmindelser, ændringer og fakturering samlet' : 'Reminders, changes, and billing in one place'}
              </h3>
              <p className="mb-4 text-base leading-relaxed text-gray-600">
                {da
                  ? 'Kunder kan få automatiske påmindelser, foreslå ændringer og bekræfte online — I beholder overblikket.'
                    : 'Clients receive automatic reminders, can request changes, and confirm online — you stay in control.'}
              </p>
              <p className="mb-6 text-base leading-relaxed text-gray-600">
                {da
                  ? 'Fakturér abonnementsrelateret arbejde efter de præferencer, der passer til jeres forretning.'
                    : 'Invoice subscription-related work using preferences that fit how you run the business.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da
                  ? ['Auto-påmindelser', 'Løbende ændringer', 'Online bekræftelse', 'Fakturering']
                  : ['Auto reminders', 'Change tasks on the fly', 'Online confirmation', 'Invoicing']
                ).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative order-1 lg:order-2">
              <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-sky-500/5 to-cyan-500/5 blur-sm md:block" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
                <video
                  className="h-auto w-full"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/images/features/routeplanning-map-placeholder.svg"
                  aria-label={da ? 'Automatiseringer og kunde-flow i PathPilo' : 'Automations and client flow in PathPilo'}
                >
                  <source src="/images/features/routeplanning-automations.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0a1414] py-20 md:py-28">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[120px]"
          aria-hidden
        />

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              {da ? 'Hvorfor teams bruger PathPilo til abonnementer' : 'Why teams use PathPilo for subscriptions'}
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              {da
                ? 'Mindre manuelt koordineringsarbejde — mere forudsigelig drift og gladere kunder.'
                : 'Less manual coordination — more predictable operations and happier clients.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
            {(
              [
                {
                  icon: ArrowPathIcon,
                  title: da ? 'Gentagelse uden regneark' : 'Recurring without spreadsheets',
                  text: da
                    ? 'Ét system til faste opgaver i stedet for løse lister og tråde i mailen.'
                    : 'One system for recurring work instead of scattered lists and email threads.',
                },
                {
                  icon: SparklesIcon,
                  title: da ? 'Klar kommunikation' : 'Clear communication',
                  text: da
                    ? 'Påmindelser og bekræftelser holder alle på samme side — uden ekstra opkald.'
                    : 'Reminders and confirmations keep everyone aligned without extra calls.',
                },
                {
                  icon: ChatBubbleLeftRightIcon,
                  title: da ? 'Ændringer i realtid' : 'Changes in real time',
                  text: da
                    ? 'Når kunden eller kontoret justerer noget, ser feltet det med det samme.'
                    : 'When the client or office adjusts something, the field sees it immediately.',
                },
                {
                  icon: BanknotesIcon,
                  title: da ? 'Fakturering der følger aftalen' : 'Billing that follows the agreement',
                  text: da
                    ? 'Kobl abonnementsarbejde til fakturering, så I får betaling efter jeres model.'
                    : 'Connect subscription work to invoicing so you get paid the way your model expects.',
                },
              ] as const
            ).map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition hover:bg-white/10"
              >
                <card.icon className="mb-4 h-8 w-8 text-accent-400" />
                <h3 className="mb-2 text-lg font-bold text-white">{card.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary-50 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Komplet flow' : 'Complete flow'}
            </p>
            <h2 className="section-title">
              {da ? 'Fra aftale til udført og faktureret' : 'From agreement to done and invoiced'}
            </h2>
          </div>

          <div className="relative space-y-6">
            {(
              [
                {
                  title: da ? 'Definér abonnementer pr. kunde' : 'Define subscriptions per client',
                  text: da
                    ? 'Opret planer med ugentlig rytme eller fast månedsdato — så mange som I har brug for.'
                    : 'Create plans with a weekly rhythm or a fixed monthly date — as many as you need.',
                },
                {
                  title: da ? 'Tidsæt, notér og koordinér' : 'Time, note, and coordinate',
                  text: da
                    ? 'Placer jobs rigtigt i kalenderen og gem noter til særlige behov hos kunden.'
                    : 'Place jobs correctly on the calendar and save notes for special customer needs.',
                },
                {
                  title: da ? 'Kunder mindes og bekræfter' : 'Clients get reminded and confirm',
                  text: da
                    ? 'Automatiske påmindelser og online bekræftelse reducerer misforståelser og no-shows.'
                    : 'Automatic reminders and online confirmation reduce misunderstandings and no-shows.',
                },
                {
                  title: da ? 'Fakturér efter jeres præferencer' : 'Invoice to match your preferences',
                  text: da
                    ? 'Træk abonnementsarbejde ind i faktureringen, så det matcher jeres prissætning og aftaler.'
                    : 'Bring subscription work into invoicing so it matches your pricing and agreements.',
                },
              ] as const
            ).map((item) => (
              <div key={item.title} className="rounded-2xl border border-primary-100 bg-white p-6 shadow-md md:p-8">
                <h3 className="mb-2 text-lg font-bold text-primary-800 md:text-xl">{item.title}</h3>
                <p className="leading-relaxed text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Klar til smartere abonnementsopgaver?' : 'Ready for smarter subscription tasks?'}
        subtitle={
          da
            ? 'Start gratis og se hvordan PathPilo samler tilbagevendende arbejde, kunder og fakturering.'
            : 'Start free and see how PathPilo brings recurring work, clients, and billing together.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="subscriptions"
      />

      <Footer />
    </>
  )
}
