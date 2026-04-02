'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import { marketingImages } from '../../config/marketingImages'
import { getLocaleFromPathname, withAppLanguageParam } from '../../lib/i18n'
import {
  ArrowsRightLeftIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  MapIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

const TEAM_VIDEOS = {
  employeeCreation: '/images/features/client_creation.mp4',
  taskManagement: '/images/features/client_task_management.mp4',
  timeOff: '/images/features/client_sickleave.mp4',
  mobileApp: '/images/features/team-mobile-app.mp4',
} as const
const SHOW_MOBILE_WALKTHROUGH = false

export default function TeamManagementFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
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
                {da ? 'Teamstyring' : 'Team management'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg md:mx-auto md:max-w-lg lg:mx-0">
                {da
                  ? 'Med PathPilo kan du tilføje så mange medarbejdere du vil til dit team. Styr opgaver, fri-anmodninger, arbejdstider og live fremdrift ét sted.'
                  : 'With PathPilo, you can add as many employees as you want to your team. Manage tasks, time-off requests, working hours, and live progress in one place.'}
              </p>

              <ul className="mt-8 space-y-3 text-left md:mx-auto md:max-w-lg lg:mx-0">
                {(da
                  ? [
                      'Skaler uden ekstra medarbejderlicenser',
                      'Hold fuldt overblik over teamets kalender og kapacitet',
                      'Giv kunder en bedre oplevelse med live status og påmindelser',
                    ]
                  : [
                      'Scale your team without extra employee license costs',
                      'Keep full visibility of calendars and capacity',
                      'Deliver better customer experience with live status and reminders',
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
                src={marketingImages.features.team}
                alt={da ? 'PathPilo teamstyring' : 'PathPilo team management'}
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

      {/* Text-first value strip (no fake numbers) */}
      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {(
              [
                {
                  title: da ? 'Ubegrænset antal medarbejdere' : 'Unlimited employees',
                  text: da
                    ? 'Tilføj, inviter og organiser teamet uden ekstra omkostninger.'
                    : 'Add, invite, and organize your team without extra cost.',
                },
                {
                  title: da ? 'Maksimér kapacitet' : 'Maximize capacity',
                  text: da
                    ? 'Flyt opgaver og ruter for at spare tid og få plads til flere kunder.'
                    : 'Move jobs and routes to save time and fit more clients in.',
                },
                {
                  title: da ? 'Klar rollefordeling' : 'Clear ownership',
                  text: da
                    ? 'Hver medarbejder har eget login, kalender og overblik over dagens arbejde.'
                    : 'Each employee has their own login, calendar, and daily overview.',
                },
                {
                  title: da ? 'Realtidsstatus' : 'Live progress',
                  text: da
                    ? 'Følg når jobs startes og afsluttes — med live opdateringer hele dagen.'
                    : 'Follow jobs as they start and complete — with live updates all day.',
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
              {da ? 'Alt til at styre mennesker, tid og udførelse' : 'Everything to manage people, time, and execution'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Planlæg smartere, giv medarbejdere et tydeligt overblik, og hold kunder opdateret.'
                : 'Plan smarter, give employees clarity, and keep customers updated.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(
              [
                {
                  icon: UserPlusIcon,
                  title: da ? 'Opret medarbejdere på få sekunder' : 'Create employees in seconds',
                  text: da
                    ? 'Invitér medarbejdere og giv dem adgang til jobs, ruter og logning.'
                    : 'Invite employees and give access to jobs, routes, and logging.',
                },
                {
                  icon: MapIcon,
                  title: da ? 'Planlæg jobs og ruter' : 'Assign jobs and plan routes',
                  text: da
                    ? 'Fordel arbejde, justér rækkefølge og spar kørselstid med simple flyt.'
                    : 'Distribute work, adjust order, and cut drive time with quick moves.',
                },
                {
                  icon: ClockIcon,
                  title: da ? 'Arbejdstider og startlokation' : 'Work hours and start location',
                  text: da
                    ? 'Sæt arbejdstider og udgangspunkt pr. medarbejder for mere præcis planlægning.'
                    : 'Set work hours and starting point per employee for more accurate planning.',
                },
                {
                  icon: CalendarDaysIcon,
                  title: da ? 'Kalender og fri-anmodninger' : 'Calendar & time-off requests',
                  text: da
                    ? 'Medarbejdere kan foreslå fri, og du kan godkende og planlægge derefter.'
                    : 'Employees can request time off; you approve and plan accordingly.',
                },
                {
                  icon: ShieldCheckIcon,
                  title: da ? 'Logning og dokumentation' : 'Logging & documentation',
                  text: da
                    ? 'Medarbejdere opretter logs direkte på jobs, så historik og kvalitet bevares.'
                    : 'Employees create logs directly on jobs so history and quality stay intact.',
                },
                {
                  icon: BellAlertIcon,
                  title: da ? 'Automatiske påmindelser' : 'Automated reminders',
                  text: da
                    ? 'Send beskeder til kunder, når noget ændrer sig — helt uden manuelt arbejde.'
                    : 'Message customers when something changes — without manual follow-up.',
                },
              ] as const
            ).map((card) => (
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

      {/* ─── WALKTHROUGH (4 videos) ─── */}
      <section id="walkthrough" className="bg-[#f4f7f6] py-14 md:bg-white md:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-3xl text-center md:mb-20">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Trin for trin' : 'Step by step'}
            </p>
            <h2 className="section-title">
              {da ? 'Sådan arbejder teams med medarbejdere i PathPilo' : 'How teams manage employees in PathPilo'}
            </h2>
          </div>

          {/* 1: Employee creation */}
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
                    aria-label={da ? 'Opret medarbejder i PathPilo' : 'Create employee in PathPilo'}
                  >
                    <source src={TEAM_VIDEOS.employeeCreation} type="video/mp4" />
                  </video>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                  <span className="text-sm font-semibold text-accent-700">{da ? 'Medarbejderoprettelse' : 'Employee creation'}</span>
                </div>
                <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                  {da ? 'Tilføj og inviter medarbejdere uden ekstra omkostning' : 'Add and invite employees with no extra cost'}
                </h3>
                <p className="text-base text-gray-600 leading-relaxed mb-4">
                  {da
                    ? 'Opret medarbejdere på få sekunder og giv dem eget login. De får et klart overblik over jobs, rute og logs.'
                    : 'Create employees in seconds and give each person their own login. They get a clear view of jobs, route, and logs.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(da ? ['Ubegrænset antal', 'Eget login', 'Roller/overblik', 'Hurtig invitation'] : ['Unlimited', 'Own login', 'Roles & overview', 'Fast invite']).map((tag) => (
                    <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2: Task management */}
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18 mb-0 lg:mb-24 xl:mb-36">
            <div className="order-2 lg:order-1">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'Opgaver & ruter' : 'Tasks & routes'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Flyt arbejde rundt og spar tid' : 'Move work around to save time'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Fordel jobs på medarbejdere og justér ruter. Små flyt kan frigive tid til flere kunder.'
                  : 'Assign jobs to employees and adjust routes. Small moves can free up time for more clients.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da ? ['Tildel jobs', 'Flyt ruter', 'Bedre udnyttelse', 'Mere kapacitet'] : ['Assign jobs', 'Move routes', 'Better utilization', 'More capacity']).map((tag) => (
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
                  className="h-auto w-full"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/images/features/routeplanning-map-placeholder.svg"
                  aria-label={da ? 'Administrer opgaver og ruter i PathPilo' : 'Manage tasks and routes in PathPilo'}
                >
                  <source src={TEAM_VIDEOS.taskManagement} type="video/mp4" />
                </video>
              </div>
            </div>
          </div>

          {/* 3: Time off */}
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18 mb-0 lg:mb-24 xl:mb-36">
            <div className="relative order-2 lg:order-1">
              <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-rose-500/5 to-orange-500/5 blur-sm md:block" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
                <video
                  className="h-auto w-full"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/images/features/routeplanning-weekplanner-placeholder.svg"
                  aria-label={da ? 'Anmod om fri i medarbejderkalender' : 'Request time off in employee calendar'}
                >
                  <source src={TEAM_VIDEOS.timeOff} type="video/mp4" />
                </video>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'Kalender' : 'Calendar'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Fri-anmodninger og arbejdstider pr. medarbejder' : 'Time-off requests and work hours per employee'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Medarbejdere kan foreslå fri. Du sætter arbejdstider og startlokationer — og planlægningen bliver mere præcis.'
                  : 'Employees can request time off. You set hours and start locations — planning becomes more precise.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da ? ['Fri-anmodninger', 'Godkendelse', 'Arbejdstider', 'Startlokation'] : ['Time-off', 'Approval', 'Work hours', 'Start location']).map((tag) => (
                  <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {SHOW_MOBILE_WALKTHROUGH && (
            <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18">
              <div className="order-2 lg:order-1">
                <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                  <span className="text-sm font-semibold text-accent-700">{da ? 'Mobilapp' : 'Mobile app'}</span>
                </div>
                <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                  {da ? 'Følg dagen i realtid fra kontoret' : 'Follow the day in real time from the office'}
                </h3>
                <p className="text-base text-gray-600 leading-relaxed mb-4">
                  {da
                    ? 'Medarbejdere kan bruge appen til at følge ruten, opdatere status og afslutte jobs. Du ser fremskridt live.'
                    : 'Employees use the app to follow the route, update status, and complete jobs. You see progress live.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(da ? ['Live opdatering', 'Jobstatus', 'Logs', 'Påmindelser'] : ['Live updates', 'Job status', 'Logs', 'Reminders']).map((tag) => (
                    <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 border border-primary-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="order-1 lg:order-2 relative">
                <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-teal-500/5 to-cyan-500/5 blur-sm md:block" />
                <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
                  <video
                    className="h-auto w-full"
                    autoPlay
                    muted
                    loop
                    playsInline
                    poster="/images/features/routeplanning-mobile-placeholder.svg"
                    aria-label={da ? 'Mobilapp til medarbejdere' : 'Mobile app for employees'}
                  >
                    <source src={TEAM_VIDEOS.mobileApp} type="video/mp4" />
                  </video>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── COMPLETE FLOW ─── */}
      <section className="py-20 md:py-28 bg-primary-50">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Komplet flow' : 'Complete flow'}
            </p>
            <h2 className="section-title">
              {da ? 'Fra team til udført arbejde' : 'From team setup to work completed'}
            </h2>
          </div>

          <div className="relative space-y-6">
            {(
              [
                {
                  title: da ? 'Opret medarbejdere og rettigheder' : 'Create employees and access',
                  text: da
                    ? 'Tilføj medarbejdere, giv dem login og definer hvordan de arbejder i systemet.'
                    : 'Add employees, give logins, and define how they work in the system.',
                },
                {
                  title: da ? 'Planlæg jobs og ruter' : 'Plan jobs and routes',
                  text: da
                    ? 'Tildel jobs og flyt dem rundt for at reducere kørselstid og øge kapaciteten.'
                    : 'Assign jobs and move them around to cut drive time and increase capacity.',
                },
                {
                  title: da ? 'Koordinér tid og fravær' : 'Coordinate time and time off',
                  text: da
                    ? 'Arbejdstider, startlokationer og fri-anmodninger gør planlægningen stabil.'
                    : 'Hours, start locations, and time-off requests keep planning stable.',
                },
                {
                  title: da ? 'Følg udførelse i realtid' : 'Follow execution in real time',
                  text: da
                    ? 'Medarbejdere opdaterer status i appen. Du følger fremskridt live hele dagen.'
                    : 'Employees update status in the app. You follow progress live all day.',
                },
              ] as const
            ).map((item) => (
              <div key={item.title} className="rounded-2xl border border-primary-100 bg-white p-6 shadow-md md:p-8">
                <h3 className="text-lg font-bold text-primary-800 md:text-xl mb-2">{item.title}</h3>
                <p className="text-gray-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={da ? 'Klar til at samle teamet i ét system?' : 'Ready to run your team in one system?'}
        subtitle={
          da
            ? 'Start gratis og se hvordan PathPilo gør teamplanlægning, mobiludførelse og kundeopdateringer nemt.'
            : 'Start free and see how PathPilo makes team planning, mobile execution, and customer updates easy.'
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

