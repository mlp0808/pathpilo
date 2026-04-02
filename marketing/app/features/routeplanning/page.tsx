'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import {
  getLocaleFromPathname,
  withAppLanguageParam,
} from '../../lib/i18n'
import {
  ArrowsRightLeftIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  CursorArrowRaysIcon,
  DevicePhoneMobileIcon,
  MapIcon,
  SparklesIcon,
  TruckIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

/** Set true when AI + mobile walkthrough sections are ready to show again */
const SHOW_AI_AND_MOBILE_WALKTHROUGH = false

export default function RoutePlanningFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = pathname ? getLocaleFromPathname(pathname) : localeProp
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  return (
    <>
      <Header />

      {/* ─── HERO (dark brand) ─── */}
      <section className="relative overflow-hidden bg-[#0a1414]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute -left-1/4 bottom-0 h-[380px] w-[380px] rounded-full bg-teal-600/5 blur-[100px]" aria-hidden />
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
                {da ? 'Ruteplanlægning' : 'Route Planning'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg md:max-w-lg md:mx-auto lg:mx-0">
                {da
                  ? 'Ugeplan, live rutetid, AI og mobil — ét samlet flow fra plan til udført opgave.'
                  : 'Week planning, live route time, AI, and mobile — one flow from plan to done.'}
              </p>

              <ul className="mt-8 space-y-3 text-left md:max-w-lg md:mx-auto lg:mx-0">
                {(da
                  ? [
                      'Live rutetid og tydelig effekt, når du flytter opgaver',
                      'AI til hurtig optimering af rækkefølge og kørsel',
                      'Mobilapp med synk til kontoret og ETA til kunder',
                    ]
                  : [
                      'See live route impact every time you move a job',
                      'AI-powered stop order and drive-time optimization',
                      'Field app synced to the office with customer ETA updates',
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
                >
                  {da ? 'Kom i gang gratis' : 'Get Started Free'}
                </Link>
                <a
                  href="#walkthrough"
                  className="inline-flex justify-center py-2 text-base font-semibold text-white/90 underline decoration-white/30 underline-offset-4 transition hover:text-white"
                >
                  {da ? 'Se hvordan det virker' : 'See how it works'}
                </a>
              </div>
            </div>

            <div className="order-2 flex w-full justify-center lg:justify-end">
              <Image
                src="/images/features/routes_hero.png"
                alt={da ? 'PathPilo ruteplanlægning' : 'PathPilo route planning'}
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

      {/* Stats — white strip directly under hero */}
      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-14">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-10">
            {[
              { value: '40%', label: da ? 'Mindre kørselstid' : 'Less drive time' },
              { value: '< 2 min', label: da ? 'Planlæg en fuld dag' : 'Plan a full day' },
              { value: '100%', label: da ? 'Synkroniseret mobil' : 'Synced to mobile' },
              { value: 'AI', label: da ? 'Autooptimering af ruter' : 'Auto route optimization' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold text-primary-800 md:text-4xl">{s.value}</div>
                <div className="mt-1.5 text-sm text-gray-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURE OVERVIEW CARDS ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-primary-50/40 to-primary-50/80 py-16 md:py-28">
        <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-accent-500/5 blur-3xl max-md:opacity-40" />
        <div className="pointer-events-none absolute bottom-20 left-0 h-64 w-64 rounded-full bg-primary-500/5 blur-3xl max-md:opacity-40" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Funktioner' : 'Capabilities'}
            </p>
            <h2 className="section-title">
              {da ? 'Alt til intelligent rute- og ugeplan' : 'Everything for intelligent route & week planning'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Seks kraftfulde værktøjer der tilsammen giver dig den hurtigste vej fra plan til udført opgave.'
                : 'Six powerful tools that together give you the fastest path from plan to completed job.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {([
              {
                icon: MapIcon,
                title: da ? 'Live rutekort' : 'Live route map',
                text: da
                  ? 'Se alle stop på kortet med kørselstid, afstand og tydelig rækkefølge. Valider planen med et blik.'
                  : 'See every stop on a live map with travel time, distance, and clear order. Validate the plan at a glance.',
              },
              {
                icon: ClockIcon,
                title: da ? 'Ugeplan med drag-and-drop' : 'Week planner with drag-and-drop',
                text: da
                  ? 'Byg ruter dag for dag. Flyt opgaver med et klik og se varighedsændring live.'
                  : 'Build routes day by day. Move jobs with a click and see duration changes live.',
              },
              {
                icon: SparklesIcon,
                title: da ? 'AI Auto Route Planner' : 'AI Auto Route Planner',
                text: da
                  ? 'Lad AI beregne den bedste rækkefølge ud fra geografi, tid og kapacitet på sekunder.'
                  : 'Let AI calculate the best stop order based on geography, timing, and capacity in seconds.',
              },
              {
                icon: ArrowsRightLeftIcon,
                title: da ? 'Omfordel mellem medarbejdere' : 'Reassign between employees',
                text: da
                  ? 'Se to ruter side om side på kortet og flyt opgaver derhen, hvor de passer bedst.'
                  : 'View two routes side by side on the map and move jobs where they fit best.',
              },
              {
                icon: ChatBubbleLeftRightIcon,
                title: da ? 'Automatisk ETA til kunder' : 'Automatic ETA to customers',
                text: da
                  ? 'Når medarbejderen starter næste job, sendes SMS med forventet ankomsttid automatisk.'
                  : 'When employees start the next job, an SMS with estimated arrival is sent automatically.',
              },
              {
                icon: DevicePhoneMobileIcon,
                title: da ? 'Komplet mobilworkflow' : 'Complete mobile workflow',
                text: da
                  ? 'Medarbejdere kan kommentere, annullere og færdigmelde opgaver direkte fra mobilen.'
                  : 'Employees can comment, cancel, and complete jobs directly from their phone.',
              },
            ] as const).map((card) => (
              <article
                key={card.title}
                className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-6 shadow-none transition-all duration-300 hover:border-primary-200 sm:shadow-sm md:p-8 md:shadow-lg md:hover:shadow-xl md:hover:-translate-y-1"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-800 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity" />
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary-200 bg-white text-primary-800">
                  <card.icon className="h-6 w-6 stroke-[1.8]" />
                </div>
                <h3 className="text-lg font-bold text-primary-800 mb-2">{card.title}</h3>
                <p className="text-gray-600 leading-relaxed">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DETAILED WALKTHROUGH ─── */}
      <section id="walkthrough" className="bg-[#f4f7f6] py-14 md:bg-white md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-3xl text-center md:mb-20">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Trin for trin' : 'Step by step'}
            </p>
            <h2 className="section-title">
              {da ? 'Sådan bruger teams PathPilo Route Planning' : 'How teams use PathPilo Route Planning'}
            </h2>
          </div>

          {/* Step 1: Week planner */}
          <div className="mb-8 md:mb-0">
            <div className="grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18 mb-0 lg:mb-24 xl:mb-36">
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
                >
                  <source src="/images/features/routeplanning-weekplanner-placeholder.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'Ugeplan' : 'Week planner'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Planlæg hele ugen med drag-and-drop' : 'Plan the entire week with drag-and-drop'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Ugeplanen viser alle medarbejdere og dage i ét overblik. Flyt en opgave og se straks, om planen bliver hurtigere eller langsommere.'
                  : 'The week planner shows all employees and days in one view. Move a job and instantly see if the plan gets faster or slower.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-6">
                {da
                  ? 'Ingen regneark. Ingen gætværk. Bare flyt, bekræft, færdig.'
                  : 'No spreadsheets. No guesswork. Just move, confirm, done.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da
                  ? ['Drag-and-drop', 'Live varighedsændring', 'Multi-medarbejder', 'Dag og uge']
                  : ['Drag-and-drop', 'Live duration delta', 'Multi-employee', 'Day & week views']
                ).map((tag) => (
                  <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            </div>
          </div>

          {/* Step 2: Map balancing */}
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18 mb-0 lg:mb-24 xl:mb-36">
            <div className="order-2 lg:order-1">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'Kortbalancering' : 'Map balancing'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Flyt jobs mellem medarbejdere på kortet' : 'Move jobs between employees on the map'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Åbn to ruter side om side på kortet. Flyt en opgave med et klik og se med det samme effekten på begge dage.'
                  : 'Open two routes side by side on the map. Move a job with one click and instantly see the impact on both days.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-6">
                {da
                  ? 'Så reducerer du tomkørsel og balancerer belastning på få sekunder.'
                  : 'This is how you reduce dead mileage and balance workload in seconds.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da
                  ? ['Side-om-side ruter', 'Klik-flyt', 'Varighedsindikator', 'Reducér tomkørsel']
                  : ['Side-by-side routes', 'Click to reassign', 'Duration indicator', 'Cut dead mileage']
                ).map((tag) => (
                  <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2 relative">
              <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-sky-500/5 to-cyan-500/5 blur-sm md:block" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
                <video
                  className="w-full h-auto"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/images/features/routeplanning-map-placeholder.svg"
                >
                  <source src="/images/features/routeplanning-map-placeholder.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>

          {SHOW_AI_AND_MOBILE_WALKTHROUGH && (
            <>
              {/* Step 3: AI optimization */}
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-18 mb-24 md:mb-36">
                <div className="relative">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-violet-500/5 to-purple-500/5 blur-sm" />
                  <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-xl p-8 md:p-12">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/25">
                        <SparklesIcon className="h-10 w-10 text-white" />
                      </div>
                      <h4 className="text-2xl font-bold text-primary-800 mb-3">{da ? 'AI Auto Route Planner' : 'AI Auto Route Planner'}</h4>
                      <p className="text-gray-500 mb-6 max-w-sm">
                        {da ? 'Ét klik. Bedste rækkefølge beregnet.' : 'One click. Best stop order calculated.'}
                      </p>
                      <div className="w-full space-y-3">
                        {(da
                          ? ['Analyserer alle stop og adresser', 'Beregner optimal rækkefølge', 'Tager højde for tidsvindue og kapacitet', 'Præsenterer ny plan med tidsbesparelse']
                          : ['Analyzes all stops and addresses', 'Calculates optimal stop order', 'Considers time windows and capacity', 'Presents new plan with time saved']
                        ).map((step) => (
                          <div key={step} className="rounded-xl bg-primary-50 p-3 text-left">
                            <span className="text-sm font-medium text-primary-800">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                    <span className="text-sm font-semibold text-accent-700">{da ? 'AI-optimering' : 'AI optimization'}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                    {da ? 'Lad AI optimere hele dagens plan' : 'Let AI optimize the full day in seconds'}
                  </h3>
                  <p className="text-base text-gray-600 leading-relaxed mb-4">
                    {da
                      ? 'Tryk på AI Auto Route og få den korteste rækkefølge beregnet automatisk. Du ser den forventede tidsbesparelse før du godkender.'
                      : 'Tap AI Auto Route and get the shortest stop order automatically. You see expected time savings before you confirm.'}
                  </p>
                  <p className="text-base text-gray-600 leading-relaxed">
                    {da
                      ? 'Perfekt til travle morgener. Brug resultatet som startpunkt og finjuster derfra.'
                      : 'Perfect for busy mornings. Use the result as a starting point and fine-tune from there.'}
                  </p>
                </div>
              </div>

              {/* Step 4: Mobile execution */}
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-18">
                <div className="order-2 lg:order-1">
                  <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                    <span className="text-sm font-semibold text-accent-700">{da ? 'Mobiludførelse' : 'Mobile execution'}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                    {da ? 'Fra plan til udført — direkte fra mobilen' : 'From plan to done — straight from the phone'}
                  </h3>
                  <p className="text-base text-gray-600 leading-relaxed mb-4">
                    {da
                      ? 'Medarbejderen ser dagens jobs i korrekt rækkefølge, kan starte, kommentere og afslutte direkte i appen.'
                      : 'Employees see jobs in order and can start, comment, and complete directly in the app.'}
                  </p>
                  <p className="text-base text-gray-600 leading-relaxed mb-4">
                    {da
                      ? 'Når næste job startes, kan systemet sende SMS med forventet ankomsttid automatisk.'
                      : 'When the next job starts, the system can automatically send an ETA SMS to the customer.'}
                  </p>
                  <p className="text-base text-gray-600 leading-relaxed mb-6">
                    {da
                      ? 'Alle statusændringer synkroniseres direkte til kontoret i realtid.'
                      : 'All status changes sync directly back to the office in real time.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(da
                      ? ['Start/afslut jobs', 'SMS ETA til kunder', 'Kommentarer og noter', 'Realtids-synk']
                      : ['Start/complete jobs', 'SMS ETA to customers', 'Comments & notes', 'Real-time sync']
                    ).map((tag) => (
                      <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="order-1 lg:order-2 relative">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-teal-500/5 to-cyan-500/5 blur-sm" />
                  <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-xl">
                    <video
                      className="w-full h-auto"
                      autoPlay
                      muted
                      loop
                      playsInline
                      poster="/images/features/routeplanning-mobile-placeholder.svg"
                    >
                      <source src="/videos/features/routeplanning-mobile-loop.mp4" type="video/mp4" />
                    </video>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ─── WHY TEAMS CHOOSE ─── */}
      <section className="relative overflow-hidden bg-[#0a1414] py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              {da ? 'Hvorfor teams vælger PathPilo til ruter' : 'Why teams choose PathPilo for routing'}
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              {da
                ? 'Real resultater fra serviceteams der har skiftet til PathPilo.'
                : 'Real results from service teams that switched to PathPilo.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {([
              {
                icon: TruckIcon,
                title: da ? 'Mindre kørselstid' : 'Less drive time',
                text: da ? 'Smartere rækkefølge og færre omveje i daglig drift.' : 'Smarter stop order and fewer detours every day.',
              },
              {
                icon: BoltIcon,
                title: da ? 'Hurtigere planlægning' : 'Faster planning',
                text: da ? 'Drag-and-drop + AI betyder hurtige ændringer uden at miste overblik.' : 'Drag-and-drop + AI means fast replanning without losing control.',
              },
              {
                icon: UserGroupIcon,
                title: da ? 'Stærkere teamkoordinering' : 'Stronger team coordination',
                text: da ? 'Alle arbejder i ét forbundet system fra kontor til felt.' : 'Everyone works in one connected system from office to field.',
              },
              {
                icon: CursorArrowRaysIcon,
                title: da ? 'Bedre kundeoplevelse' : 'Better customer experience',
                text: da ? 'Klar ETA-kommunikation og mere præcise ankomsttider.' : 'Clear ETA communication and more accurate arrival windows.',
              },
            ] as const).map((card) => (
              <div key={card.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition hover:bg-white/10">
                <card.icon className="mb-4 h-8 w-8 text-accent-400" />
                <h3 className="text-lg font-bold text-white mb-2">{card.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT FITS TOGETHER ─── */}
      <section className="py-20 md:py-28 bg-primary-50">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Komplet flow' : 'Complete flow'}
            </p>
            <h2 className="section-title">
              {da ? 'Fra kontor til kundens dør' : 'From office to the customer\'s door'}
            </h2>
          </div>

          <div className="relative space-y-6">
            {([
              {
                title: da ? 'Planlæg ugen i ugeplanen' : 'Plan the week in the week planner',
                text: da
                  ? 'Træk opgaver til medarbejdere og dage. Se live rutetid for hver ændring.'
                  : 'Drag jobs to employees and days. See live route time for every change.',
              },
              {
                title: da ? 'Optimer med AI eller manuelt' : 'Optimize with AI or manually',
                text: da
                  ? 'Brug AI Auto Route for automatisk optimering eller flyt jobs manuelt mellem medarbejdere på kortet.'
                  : 'Use AI Auto Route for automatic optimization or manually move jobs between employees on the map.',
              },
              {
                title: da ? 'Teams udfører fra mobilappen' : 'Teams execute from the mobile app',
                text: da
                  ? 'Medarbejdere ser jobs i rækkefølge, starter, kommenterer og afslutter — alt synkroniseres live.'
                  : 'Employees see jobs in order, start, comment, and complete — everything syncs live.',
              },
              {
                title: da ? 'Kunden får automatisk besked' : 'Customers get notified automatically',
                text: da
                  ? 'Når medarbejderen starter næste job, sender systemet SMS med forventet ankomsttid til kunden.'
                  : 'When employees start the next job, the system sends an SMS with ETA to the customer.',
              },
            ] as const).map((item) => (
              <div key={item.title} className="rounded-2xl border border-primary-100 bg-white p-6 shadow-md md:p-8">
                <h3 className="text-lg font-bold text-primary-800 md:text-xl mb-2">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <CTASection
        title={da ? 'Klar til bedre ruter og bedre dage?' : 'Ready for better routes and better days?'}
        subtitle={
          da
            ? 'Start gratis og oplev hvordan PathPilo forvandler din ruteplanlægning, ugeplan og mobiludførelse.'
            : 'Start free and experience how PathPilo transforms your route planning, week scheduling, and mobile execution.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
      />

      <Footer />
    </>
  )
}
