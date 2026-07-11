'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CTASection from '../../components/CTASection'
import FeaturePageAnalytics from '../../components/FeaturePageAnalytics'
import { resolveMarketingLocale, withAppLanguageParam } from '../../lib/i18n'
import { pushCtaClick } from '../../lib/dataLayer'
import {
  ArrowRightIcon,
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
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'

export default function RoutePlanningFeaturePage({ locale: localeProp = 'en' }: { locale?: string }) {
  const pathname = usePathname()
  const locale = resolveMarketingLocale(pathname, localeProp)
  const da = locale === 'da'
  const registerHref = withAppLanguageParam(locale, 'https://app.pathpilo.com/register')

  const faqs = da
    ? [
        {
          q: 'Hvad er ruteplanlægningssoftware til feltservice?',
          a: 'Ruteplanlægningssoftware til feltservice er et cloudbaseret værktøj, der hjælper serviceteams med at planlægge, optimere og udføre daglige ruter. Det kombinerer jobstyring, kortbaseret planlægning og automatisk optimering, så du kan planlægge en hel dags rute på under to minutter og reducere kørselstid med op til 40 procent.',
        },
        {
          q: 'Kan PathPilo tildele jobs til teknikere baseret på placering?',
          a: 'Ja. I PathPilos kortvisning kan du se alle teknikere og jobs på samme kort og tildele opgaver til den nærmeste medarbejder med ét klik. AI Auto Route optimerer derefter rækkefølgen for den tildelte dag automatisk, baseret på geografi, tid og kapacitet.',
        },
        {
          q: 'Hvordan fungerer AI-ruteoptimering?',
          a: 'PathPilos AI Auto Route analyserer alle stop, adresser og jobvarigheder og beregner den optimale rækkefølge på sekunder. Du ser den forventede tidsbesparelse, inden du godkender planen, og kan altid justere manuelt bagefter.',
        },
        {
          q: 'Fungerer det for solo-operatører?',
          a: 'Ja. Selv enkeltpersoner sparer i gennemsnit 30–45 minutter om dagen ved at erstatte manuel planlægning med automatisk ruteoptimering. Opsætningen tager under en time, og du ser resultater fra dag ét.',
        },
        {
          q: 'Kan jeg planlægge ruter for flere teknikere på én gang?',
          a: 'Ja. PathPilo viser alle medarbejdere og dage i ugeplanen. Du kan se to ruter side om side på kortet, flytte jobs mellem medarbejdere og se den direkte effekt på begge dages kørselstid — alt i realtid.',
        },
        {
          q: 'Understøtter det tilbagevendende jobs og ruter?',
          a: 'Ja. PathPilo har fuld understøttelse af tilbagevendende jobs (abonnementer). Gentagne besøg oprettes automatisk i kalenderen og medtages i ruteoptimeringen uden yderligere handling. Over tid bliver tilbagevendende ruter stadigt mere effektive, da systemet kender adresser og varigheder.',
        },
        {
          q: 'Er PathPilo cloudbaseret ruteplanlægningssoftware?',
          a: 'Ja. PathPilo er 100 % cloudbaseret, hvilket betyder at kontor og felt altid er synkroniseret. Ændringer i planen vises øjeblikkeligt på teknikerens mobilapp, og afsluttede jobs synkroniseres tilbage til kontoret i realtid.',
        },
        {
          q: 'Kan teknikerne bruge det fra deres telefon?',
          a: 'Ja. PathPilos mobilapp viser dagens jobs i den rigtige rækkefølge. Teknikere kan starte, kommentere og afslutte jobs direkte fra appen. Systemet sender automatisk SMS med forventet ankomsttid til kunden, når næste job påbegyndes.',
        },
        {
          q: 'Hvad er forskellen på ruteplanlægning og ruteoptimering?',
          a: 'Ruteplanlægning er processen med at beslutte hvilke jobs der skal udføres i hvilken rækkefølge. Ruteoptimering er det at finde den bedst mulige rækkefølge algoritmisk. PathPilo gør begge ting: du planlægger visuelt på kortet, og AI-optimering beregner den korteste rækkefølge baseret på faktisk kørselstid med trafikdata.',
        },
        {
          q: 'Hvor hurtigt kan jeg planlægge en fuld dags rute?',
          a: 'De fleste teams planlægger en fuld dag med flere teknikere på under to minutter. Tilbagevendende jobs er allerede i systemet, AI-optimering kører på sekunder, og du bekræfter planen med ét klik.',
        },
      ]
    : [
        {
          q: 'What is field service route planning software?',
          a: 'Field service route planning software is a cloud-based tool that helps service teams plan, optimise, and execute their daily routes. It combines job management, map-based scheduling, and automatic route optimisation so you can plan a full day\'s route in under two minutes and cut drive time by up to 40 percent.',
        },
        {
          q: 'Can PathPilo assign jobs to technicians based on their location?',
          a: 'Yes. In PathPilo\'s map view you can see all technicians and jobs on one map and assign work to the nearest available person with a single click. The AI Auto Route then optimises the stop order for that technician\'s day automatically, based on geography, timing, and capacity.',
        },
        {
          q: 'How does AI route optimisation work?',
          a: 'PathPilo\'s AI Auto Route analyses every stop, address, and job duration and calculates the best possible stop order in seconds. You see the expected time saving before you confirm the plan, and you can always adjust manually afterwards.',
        },
        {
          q: 'Does it work for a single person or solo operator?',
          a: 'Yes. Even solo operators typically save 30 to 45 minutes per day by replacing manual planning with automatic route optimisation. Setup takes under an hour and most people see results from day one.',
        },
        {
          q: 'Can I plan routes for multiple field technicians at the same time?',
          a: 'Yes. PathPilo shows all employees and days in a single week planner. You can view two routes side by side on the map, move jobs between technicians, and instantly see the impact on both days\'s drive time — all in real time.',
        },
        {
          q: 'Does it support recurring jobs and route templates?',
          a: 'Yes. PathPilo has full support for recurring jobs. Repeat visits are created automatically in the calendar and are included in route optimisation without any extra work. Over time, recurring routes become increasingly efficient as the system already knows every address and job duration.',
        },
        {
          q: 'Is PathPilo cloud-based route planning software?',
          a: 'Yes. PathPilo is 100% cloud-based, which means the office and field are always in sync. Changes to the plan appear instantly on the technician\'s mobile app, and completed jobs sync back to the office in real time.',
        },
        {
          q: 'Can my field team use it from their phones?',
          a: 'Yes. PathPilo\'s mobile app shows each technician\'s jobs for the day in the correct order. Technicians can start, comment on, and complete jobs directly from the app. The system automatically sends an SMS with an estimated arrival time to the customer when the next job is started.',
        },
        {
          q: 'What is the difference between route planning and route optimisation?',
          a: 'Route planning is the process of deciding which jobs to do and in what order. Route optimisation is finding the mathematically best possible order. PathPilo does both: you plan visually on the map, and AI optimisation calculates the shortest sequence based on real drive times with traffic data — not just straight-line distances.',
        },
        {
          q: 'How quickly can I plan a full day\'s routes?',
          a: 'Most teams plan a full day for multiple technicians in under two minutes. Recurring jobs are already in the system, AI optimisation runs in seconds, and you confirm the plan with one click.',
        },
      ]

  return (
    <>
      <FeaturePageAnalytics featureKey="routeplanning" />
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
                {da ? 'Ruteplanlægning' : 'Route Planning Software'}
              </h1>
              <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg md:max-w-lg md:mx-auto lg:mx-0">
                {da
                  ? 'AI-drevet ruteplanlægning og jobstyring — tildel jobs efter placering, optimer rækkefølge, og planlæg dit feltteam på under 2 minutter.'
                  : 'AI-powered field service route planning — assign jobs by location, optimise stop order, and dispatch your field team in under 2 minutes.'}
              </p>

              <ul className="mt-8 space-y-3 text-left md:max-w-lg md:mx-auto lg:mx-0">
                {(da
                  ? [
                      'Se live rutetid og tydelig effekt, når du flytter opgaver',
                      'AI automatiserer jobfordeling og optimering af kørselstid',
                      'Mobilapp synkroniserer med kontoret og sender ETA til kunder',
                    ]
                  : [
                      'See live route impact every time you move or reassign a job',
                      'AI automates stop ordering and drive-time optimisation',
                      'Field app synced live with customer ETA notifications',
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
                      featureKey: 'routeplanning',
                    })
                  }
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
                alt={da ? 'PathPilo ruteplanlægning for feltservice' : 'PathPilo field service route planning software'}
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
              { value: 'AI', label: da ? 'Autooptimering af ruter' : 'Auto route optimisation' },
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
              {da ? 'Alt til intelligent rute- og jobstyring' : 'Everything for intelligent route planning and job management'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Seks kraftfulde værktøjer der tilsammen giver dig den hurtigste vej fra plan til udført opgave.'
                : 'Six powerful tools that together take you from job list to optimised field team dispatch in minutes.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {([
              {
                icon: MapIcon,
                title: da ? 'Live rutekort' : 'Live route map',
                text: da
                  ? 'Se alle stop på kortet med kørselstid, afstand og tydelig rækkefølge. Valider planen med et blik.'
                  : 'See every stop on a live map with travel time, distance, and clear order. Spot territory overlaps and inefficiencies at a glance.',
              },
              {
                icon: ClockIcon,
                title: da ? 'Ugeplan med drag-and-drop' : 'Week planner with drag-and-drop',
                text: da
                  ? 'Byg ruter dag for dag. Flyt opgaver med et klik og se varighedsændring live.'
                  : 'Build routes day by day across your whole team. Move a job and instantly see the updated drive time — no spreadsheets, no guesswork.',
              },
              {
                icon: SparklesIcon,
                title: da ? 'AI Auto Route Planner' : 'AI Auto Route Planner',
                text: da
                  ? 'Lad AI beregne den bedste rækkefølge ud fra geografi, tid og kapacitet på sekunder.'
                  : 'One click and AI calculates the optimal stop order based on geography, real drive times, and job duration — saving you 30 to 45 minutes every morning.',
              },
              {
                icon: ArrowsRightLeftIcon,
                title: da ? 'Tildel jobs efter placering' : 'Assign jobs by technician location',
                text: da
                  ? 'Se to ruter side om side på kortet og flyt opgaver derhen, hvor de passer bedst geografisk.'
                  : 'View all technicians on one map and assign jobs to the nearest available person with a single click. Both routes update instantly to show the new drive times.',
              },
              {
                icon: ChatBubbleLeftRightIcon,
                title: da ? 'Automatisk ETA til kunder' : 'Automatic ETA to customers',
                text: da
                  ? 'Når medarbejderen starter næste job, sendes SMS med forventet ankomsttid automatisk.'
                  : 'When a technician starts the next job, an SMS with the estimated arrival time is sent to the customer automatically — no manual calls needed.',
              },
              {
                icon: DevicePhoneMobileIcon,
                title: da ? 'Komplet mobilworkflow' : 'Complete mobile workflow',
                text: da
                  ? 'Medarbejdere kan kommentere, annullere og færdigmelde opgaver direkte fra mobilen.'
                  : 'Field technicians see their jobs in order, start and complete each one, add notes, and sync everything back to the office — all from their phone.',
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

      {/* ─── SEO PROSE SECTION ─── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 items-start">

            {/* Left: prose content */}
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
                {da ? 'Hvordan det virker' : 'How it works'}
              </p>
              <h2 className="text-3xl font-bold text-primary-800 mb-6 md:text-4xl leading-tight">
                {da
                  ? 'Fra jobkø til optimeret feltteam på minutter'
                  : 'From job list to dispatched field team in minutes'}
              </h2>

              <div className="space-y-5 text-gray-600 leading-relaxed">
                <p>
                  {da
                    ? 'Manuel ruteplanlægning fungerer fint med to til tre stop. Med fem medarbejdere, tyve daglige jobs og løbende aflysninger begynder den daglige planlægning at æde din morgen. De fleste virksomheder bruger 30 til 45 minutter hver morgen på at gætte sig frem til en rækkefølge, der i gennemsnit koster 20 til 30 procent mere kørselstid end en optimeret rute.'
                    : 'Manual route planning works fine for two or three stops. With five field technicians, twenty daily jobs, and ongoing cancellations, the daily planning task starts eating your morning. Most service businesses spend 30 to 45 minutes guessing at a stop order that costs 20 to 30 percent more drive time than an optimised route.'}
                </p>
                <p>
                  {da
                    ? 'PathPilo løser det med kortbaseret jobstyring og AI-ruteoptimering i ét system. Du ser alle teknikere og jobs på kortet, tildeler arbejde til den nærmeste tilgængelige person med ét klik, og AI beregner den optimale rækkefølge på sekunder. Det er ikke bare ruteplanlægning — det er automatisk jobfordeling baseret på placering, kombineret med optimering af kørselstid.'
                    : 'PathPilo solves this with map-based job management and AI route optimisation in one system. You see all technicians and jobs on the map, assign work to the nearest available person with a single click, and AI calculates the optimal stop order in seconds. This is not just route planning — it is automated job routing by location, combined with drive-time optimisation.'}
                </p>
                <p>
                  {da
                    ? 'Fordi PathPilo er en integreret platform — ikke et selvstændigt kortværktøj — er ruteplanlæggeren forbundet med dine klientrekorder, tilbagevendende jobs og fakturering. Afsluttede jobs genererer fakturaer automatisk. Tilbagevendende besøg vises i kalenderen uden manuel oprettelse. Teknikerne ser den komplette jobinformation på deres telefon, inklusive adgangsnotater og kontaktoplysninger.'
                    : 'Because PathPilo is an integrated field service platform — not a standalone mapping tool — the route planner connects to your client records, recurring jobs, and invoicing. Completed jobs generate invoices automatically. Recurring visits appear in the calendar without manual entry. Technicians see the full job details on their phones, including access notes and contact information.'}
                </p>
              </div>
            </div>

            {/* Right: comparison table */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
              <div className="bg-primary-800 px-6 py-4">
                <h3 className="text-base font-bold text-white">
                  {da ? 'Manuel planlægning vs. PathPilo' : 'Manual planning vs PathPilo'}
                </h3>
              </div>
              <div className="divide-y divide-gray-200">
                {(da
                  ? [
                      { label: 'Planlægningstid per dag', manual: '30–45 min', pathpilo: 'Under 2 min' },
                      { label: 'Ekstra kørselstid', manual: '20–30%', pathpilo: 'Optimeret' },
                      { label: 'Jobfordeling', manual: 'Manuel gætten', pathpilo: 'Kortbaseret med ét klik' },
                      { label: 'Realtidssynk med felt', manual: 'Ingen', pathpilo: '100% live' },
                      { label: 'Tilbagevendende jobs', manual: 'Manuel oprettelse', pathpilo: 'Automatisk' },
                      { label: 'ETA til kunder', manual: 'Manuel opkald', pathpilo: 'Automatisk SMS' },
                      { label: 'Fakturering efter job', manual: 'Separat trin', pathpilo: 'Genereres automatisk' },
                    ]
                  : [
                      { label: 'Planning time per day', manual: '30–45 min', pathpilo: 'Under 2 min' },
                      { label: 'Extra drive time', manual: '20–30%', pathpilo: 'Optimised' },
                      { label: 'Job assignment', manual: 'Manual guesswork', pathpilo: 'Map-based, one click' },
                      { label: 'Real-time field sync', manual: 'None', pathpilo: '100% live' },
                      { label: 'Recurring jobs', manual: 'Manual entry each time', pathpilo: 'Automatic' },
                      { label: 'ETA to customers', manual: 'Manual call', pathpilo: 'Automatic SMS' },
                      { label: 'Invoicing after jobs', manual: 'Separate step', pathpilo: 'Generated automatically' },
                    ]
                ).map((row) => (
                  <div key={row.label} className="grid grid-cols-3 gap-3 px-4 py-3 text-sm">
                    <span className="font-medium text-gray-700">{row.label}</span>
                    <span className="text-center text-gray-400 line-through">{row.manual}</span>
                    <span className="text-center font-semibold text-accent-700">{row.pathpilo}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-gray-100 grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>{da ? 'Funktion' : 'Feature'}</span>
                <span className="text-center">{da ? 'Manuelt' : 'Manual'}</span>
                <span className="text-center text-accent-700">PathPilo</span>
              </div>
            </div>
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
              {da ? 'Sådan bruger teams PathPilo Route Planning' : 'How field service teams use PathPilo'}
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
                  : 'The week planner shows all employees and days in one view. Move a job and instantly see if the plan gets faster or slower — no spreadsheets, no phone calls between office and field.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-6">
                {da
                  ? 'Ingen regneark. Ingen gætværk. Bare flyt, bekræft, færdig.'
                  : 'For job management and route mapping, this is where your planning day starts and ends. Move, confirm, done.'}
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
                <span className="text-sm font-semibold text-accent-700">{da ? 'Kortbaseret jobfordeling' : 'Location-based job assignment'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Tildel jobs til teknikere baseret på placering' : 'Assign jobs to technicians by location on the map'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Åbn to ruter side om side på kortet. Flyt en opgave med et klik og se med det samme effekten på begge dage.'
                  : 'Open two routes side by side on the map. See every technician and every job plotted geographically. Move a job to the nearest available technician with one click and instantly see the impact on both routes.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-6">
                {da
                  ? 'Sådan reducerer du tomkørsel og balancerer belastning på få sekunder.'
                  : 'This is how you eliminate dead mileage, balance workload geographically, and auto-route your technicians without guessing.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(da
                  ? ['Side-om-side ruter', 'Klik-tildel', 'Varighedsindikator', 'Reducér tomkørsel']
                  : ['Side-by-side routes', 'Click to assign', 'Duration indicator', 'Cut dead mileage']
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

          {/* Step 3: AI optimization */}
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18 mb-0 lg:mb-24 xl:mb-36">
            <div className="relative order-2 lg:order-1">
              <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-violet-500/5 to-purple-500/5 blur-sm md:block" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg p-8 md:p-12">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/25">
                    <SparklesIcon className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-primary-800 mb-2">{da ? 'AI Auto Route Planner' : 'AI Auto Route Planner'}</h4>
                  <p className="text-gray-500 mb-6 text-sm">
                    {da ? 'Ét klik. Bedste rækkefølge beregnet automatisk.' : 'One click. Optimal stop order calculated automatically.'}
                  </p>
                  <div className="w-full space-y-2">
                    {(da
                      ? ['Analyserer alle stop og adresser', 'Beregner optimal rækkefølge med AI', 'Tager højde for tidsvindue og kapacitet', 'Præsenterer ny plan med forventet tidsbesparelse']
                      : ['Analyses all stops, addresses, and job durations', 'Calculates the optimal stop order with AI', 'Considers time windows, traffic, and capacity', 'Shows time saved before you confirm']
                    ).map((step, i) => (
                      <div key={step} className="flex items-start gap-3 rounded-xl bg-primary-50 p-3 text-left">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-800 text-[10px] font-bold text-white mt-0.5">{i + 1}</span>
                        <span className="text-sm font-medium text-primary-800">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'AI-optimering' : 'AI route optimisation'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Lad AI optimere hele dagens plan på sekunder' : 'Let AI optimise the full day\'s route in seconds'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Tryk på AI Auto Route og få den korteste rækkefølge beregnet automatisk ud fra faktisk kørselstid — ikke bare afstand på kortet. Du ser den forventede tidsbesparelse før du godkender.'
                  : 'Tap AI Auto Route and get the shortest stop order calculated automatically from real drive times — not just map distance. You see the expected time saving before you confirm the plan.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Perfekt til travle morgener. Brug resultatet som startpunkt og finjuster med din lokale viden bagefter.'
                  : 'Perfect for busy mornings. Use the AI result as the starting point and apply local knowledge — customer who prefers mornings, road with weight restrictions — on top.'}
              </p>
            </div>
          </div>

          {/* Step 4: Mobile execution */}
          <div className="mt-6 grid items-center gap-8 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-none sm:p-6 lg:mt-0 lg:grid-cols-2 lg:gap-16 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:gap-18">
            <div className="order-2 lg:order-1">
              <div className="mb-4 inline-flex items-center rounded-full border border-accent-500/20 bg-accent-500/10 px-4 py-2">
                <span className="text-sm font-semibold text-accent-700">{da ? 'Mobiludførelse' : 'Mobile execution'}</span>
              </div>
              <h3 className="text-2xl font-bold text-primary-800 mb-4 md:text-3xl">
                {da ? 'Fra plan til udført — direkte fra mobilen' : 'From plan to done — straight from the phone'}
              </h3>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Medarbejderen ser dagens jobs i korrekt rækkefølge, kan starte, kommentere og afslutte direkte i appen. Intet behov for at tjekke ind på kontoret.'
                  : 'Technicians see their jobs in optimised order and can start, add notes, and complete each one directly from the app. No need to check in with the office.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-4">
                {da
                  ? 'Når næste job startes, sender systemet automatisk SMS med forventet ankomsttid til kunden.'
                  : 'When a technician starts the next job, the system automatically sends an SMS with the estimated arrival time to the customer — no manual communication needed.'}
              </p>
              <p className="text-base text-gray-600 leading-relaxed mb-6">
                {da
                  ? 'Alle statusændringer synkroniseres direkte til kontoret i realtid.'
                  : 'All status changes sync back to the office in real time. The plan in the office always reflects what is actually happening in the field.'}
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
              <div className="pointer-events-none absolute -inset-4 hidden rounded-3xl bg-gradient-to-br from-teal-500/5 to-cyan-500/5 blur-sm md:block" />
              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/50 shadow-none md:rounded-2xl md:border-primary-100 md:bg-white md:shadow-lg">
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
        </div>
      </section>

      {/* ─── WHO IT'S FOR ─── */}
      <section className="bg-primary-50 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Brancher' : 'Industries'}
            </p>
            <h2 className="section-title">
              {da ? 'Bygget til alle typer feltservicevirksomheder' : 'Built for every field service business'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Uanset om du kører én rute eller koordinerer fem teams, fungerer PathPilo fra dag ét.'
                : 'Whether you run one route or coordinate five teams across a city, PathPilo works from day one.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {(da
              ? [
                  {
                    icon: '🧹',
                    title: 'Rengøringsvirksomheder',
                    text: 'Automatiser tilbagevendende rengøringsruter, reducer kørselstid mellem kunder og send ETA-notifikationer inden ankomst. De fleste rengøringsteams sparer over 40 minutter om dagen.',
                  },
                  {
                    icon: '🔧',
                    title: 'VVS og HVAC',
                    text: 'Planlæg akutopkald og planlagte servicetjek i én visning. Tildel jobs til den nærmeste tilgængelige tekniker på kortet og gensend ruten øjeblikkeligt ved aflysninger.',
                  },
                  {
                    icon: '🌿',
                    title: 'Anlægsgartnere og plæneklipning',
                    text: 'Byg geografisk patchede ruter for sæsonbaseret arbejde. Tilbagevendende abonnementsjobs oprettes automatisk, og ruterne bliver stædig mere effektive over tid.',
                  },
                  {
                    icon: '🪲',
                    title: 'Skadedyrsbekæmpelse',
                    text: 'Kvartalsvise og halvårlige serviceruter planlægger sig selv med tilbagevendende jobs. Kortbaseret jobstyring viser præcist, hvilke teknikere der er tættest på nye akutopkald.',
                  },
                  {
                    icon: '🪟',
                    title: 'Vinduespudsning',
                    text: 'Tætte geografiske ruter og automatisk omsætning af tilbagevendende kunder i kalender og fakturering. Planlæg ugens runder på under 10 minutter.',
                  },
                  {
                    icon: '⚡',
                    title: 'El og håndværk',
                    text: 'Kombiner planlagte installationer med akutreparationer i én plan. Se alle teknikerpositioner og job på kortet og tildel det rigtige job til den rigtige person øjeblikkeligt.',
                  },
                ]
              : [
                  {
                    icon: '🧹',
                    title: 'Cleaning companies',
                    text: 'Automate recurring cleaning routes, cut drive time between customers, and send ETA notifications before arrival. Most cleaning teams save over 40 minutes per day from day one.',
                  },
                  {
                    icon: '🔧',
                    title: 'Plumbing and HVAC',
                    text: 'Plan emergency call-outs alongside scheduled maintenance in one view. Assign jobs to the nearest available technician on the map and instantly re-route when a job cancels.',
                  },
                  {
                    icon: '🌿',
                    title: 'Landscaping and lawn care',
                    text: 'Build geographically-patched routes for seasonal work. Recurring subscription jobs are created automatically, and routes become progressively more efficient over the season.',
                  },
                  {
                    icon: '🪲',
                    title: 'Pest control',
                    text: 'Quarterly and bi-annual service routes plan themselves with recurring jobs. Map-based job management shows exactly which technician is closest to a new urgent call.',
                  },
                  {
                    icon: '🪟',
                    title: 'Window cleaning',
                    text: 'Tight geographic routes and automatic recurring customer scheduling in calendar and invoicing. Plan a full week\'s rounds in under 10 minutes.',
                  },
                  {
                    icon: '⚡',
                    title: 'Electrical and trades',
                    text: 'Combine planned installations with emergency repairs in one plan. See all technician locations and jobs on the map and assign the right job to the right person instantly.',
                  },
                ]
            ).map((industry) => (
              <div
                key={industry.title}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-7"
              >
                <div className="mb-4 text-3xl">{industry.icon}</div>
                <h3 className="text-lg font-bold text-primary-800 mb-2">{industry.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{industry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY TEAMS CHOOSE ─── */}
      <section className="relative overflow-hidden bg-[#0a1414] py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]" aria-hidden />
        <div className="pointer-events-none absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-accent-500/10 blur-[120px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              {da ? 'Hvorfor teams vælger PathPilo til ruter' : 'Why field service teams choose PathPilo for routing'}
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              {da
                ? 'Real resultater fra serviceteams der har skiftet til PathPilo.'
                : 'Real results from field service teams that switched from spreadsheets and standalone mapping apps.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {([
              {
                icon: TruckIcon,
                title: da ? 'Mindre kørselstid' : 'Less drive time',
                text: da ? 'Smartere rækkefølge og færre omveje i daglig drift.' : 'Smarter stop order and fewer detours. Most teams cut daily drive time by 30 to 40 percent within the first week.',
              },
              {
                icon: BoltIcon,
                title: da ? 'Hurtigere planlægning' : 'Faster planning',
                text: da ? 'Drag-and-drop + AI betyder hurtige ændringer uden at miste overblik.' : 'What used to take 45 minutes takes under 2. Drag-and-drop plus AI means fast replanning without losing control.',
              },
              {
                icon: UserGroupIcon,
                title: da ? 'Stærkere teamkoordinering' : 'Stronger team coordination',
                text: da ? 'Alle arbejder i ét forbundet system fra kontor til felt.' : 'Office and field work from the same system. Route changes appear instantly on technicians\' phones.',
              },
              {
                icon: CursorArrowRaysIcon,
                title: da ? 'Bedre kundeoplevelse' : 'Better customer experience',
                text: da ? 'Klar ETA-kommunikation og mere præcise ankomsttider.' : 'Automatic ETA SMS keeps customers informed. Accurate arrival windows and fewer frustrated calls.',
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
                  : 'Drag jobs to employees and days. See live route time for every change. Recurring jobs are already there automatically.',
              },
              {
                title: da ? 'Optimer med AI eller manuelt' : 'Optimise with AI or assign jobs by location',
                text: da
                  ? 'Brug AI Auto Route for automatisk optimering eller flyt jobs manuelt mellem medarbejdere på kortet.'
                  : 'Use AI Auto Route for automatic optimisation or view all technicians on the map and assign jobs to the nearest person manually.',
              },
              {
                title: da ? 'Teams udfører fra mobilappen' : 'Teams execute from the mobile app',
                text: da
                  ? 'Medarbejdere ser jobs i rækkefølge, starter, kommenterer og afslutter — alt synkroniseres live.'
                  : 'Technicians see jobs in optimised order, start and complete each one, add notes — everything syncs live to the office.',
              },
              {
                title: da ? 'Kunden får automatisk besked' : 'Customers get notified automatically',
                text: da
                  ? 'Når medarbejderen starter næste job, sender systemet SMS med forventet ankomsttid til kunden.'
                  : 'When the technician starts the next job, the system sends an SMS with the ETA to the customer. No manual calls needed.',
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

      {/* ─── FAQ ─── */}
      <section className="bg-white py-16 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'FAQ' : 'FAQ'}
            </p>
            <h2 className="section-title">
              {da ? 'Ofte stillede spørgsmål' : 'Frequently asked questions'}
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-7">
                <h3 className="text-lg font-semibold text-primary-800 mb-3">{faq.q}</h3>
                <p className="text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── LEARN MORE: ARTICLES ─── */}
      <section className="bg-primary-50 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-accent-600">
              {da ? 'Lær mere' : 'Go deeper'}
            </p>
            <h2 className="section-title">
              {da ? 'Guides til ruteplanlægning' : 'Route planning guides'}
            </h2>
            <p className="section-subtitle mx-auto">
              {da
                ? 'Praktiske artikler om automatisk ruteplanlægning, AI-optimering og kortbaseret planlægning.'
                : 'Practical articles on automated route planning, AI-powered scheduling, and field service software.'}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            {(da
              ? [
                  {
                    category: 'Ruteplanlægning',
                    title: 'Automatisk ruteplanlægning: sådan virker det og hvorfor det sparer tid',
                    href: '/articles/automated-route-planning',
                  },
                  {
                    category: 'Ruteplanlægning',
                    title: 'AI-ruteoptimering: hvad det er, og hvordan du vælger det rigtige',
                    href: '/articles/ai-route-scheduling-software',
                  },
                  {
                    category: 'Planlægning',
                    title: 'Kortbaseret planlægning: planlæg dit teams dag på et kort',
                    href: '/articles/map-based-scheduling',
                  },
                  {
                    category: 'Ruteplanlægning',
                    title: 'Ruteplanlægningssoftware til feltservice: en køberguide',
                    href: '/articles/field-service-route-planning-software',
                  },
                ]
              : [
                  {
                    category: 'Route Planning',
                    title: 'Automated route planning: how it works and why it saves hours every week',
                    href: '/articles/automated-route-planning',
                  },
                  {
                    category: 'Route Planning',
                    title: 'AI route scheduling software: what it is and how to choose one',
                    href: '/articles/ai-route-scheduling-software',
                  },
                  {
                    category: 'Scheduling',
                    title: 'Map-based scheduling: plan your team\'s day on a map',
                    href: '/articles/map-based-scheduling',
                  },
                  {
                    category: 'Route Planning',
                    title: 'Field service route planning software: a buyer\'s guide',
                    href: '/articles/field-service-route-planning-software',
                  },
                ]
            ).map((article) => (
              <Link
                key={article.href}
                href={article.href}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-primary-200 hover:shadow-md"
              >
                <span className="mb-3 inline-block rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 border border-accent-100">
                  {article.category}
                </span>
                <p className="flex-1 text-sm font-semibold text-primary-800 leading-snug mb-4 group-hover:text-accent-700 transition-colors">
                  {article.title}
                </p>
                <span className="flex items-center gap-1 text-xs font-semibold text-accent-600">
                  {da ? 'Læs artiklen' : 'Read article'}
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>

          {/* Help center link */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-500 mb-3">
              {da ? 'Brug for hjælp til at komme i gang?' : 'Need help getting started?'}
            </p>
            <a
              href="https://help.pathpilo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-700 hover:text-accent-800 underline underline-offset-4 transition"
            >
              {da ? 'Besøg PathPilo Hjælpecenter' : 'Visit the PathPilo Help Center'}
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <CTASection
        title={da ? 'Klar til bedre ruter og bedre dage?' : 'Ready for better routes and better days?'}
        subtitle={
          da
            ? 'Start gratis og oplev hvordan PathPilo forvandler din ruteplanlægning, jobstyring og mobiludførelse.'
            : 'Start free and experience how PathPilo transforms your route planning, job management, and field team dispatch.'
        }
        primaryCTA={da ? 'Kom i gang gratis' : 'Get Started Free'}
        primaryLink="https://app.pathpilo.com/register"
        secondaryCTA={da ? 'Kontakt os' : 'Contact Us'}
        secondaryLink="/contact"
        analyticsLocation="cta_section_feature"
        featureKey="routeplanning"
      />

      <Footer />
    </>
  )
}
