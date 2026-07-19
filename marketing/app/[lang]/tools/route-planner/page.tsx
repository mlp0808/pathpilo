import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRightIcon,
  MapPinIcon,
  SparklesIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'
import RoutePlannerTool from '../../../components/tools/RoutePlannerTool'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'
import { isMarketingLocale } from '../../../lib/i18n'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'da' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isMarketingLocale(lang)) return {}
  const da = lang === 'da'
  const siteUrl = getMarketingSiteUrl()

  const title = da
    ? 'Gratis ruteplanlægger — ingen login | PathPilo'
    : 'Free Route Planner — No Sign-Up Required | PathPilo'
  const description = da
    ? 'Planlæg og optimér din kørerute gratis i browseren. Tilføj stop, få den hurtigste rækkefølge på et kort, og gem den ved at oprette en gratis konto. Ingen login for at starte.'
    : 'Plan and optimise your driving route free in your browser. Add stops, get the fastest order on a map, and save it by creating a free account. No login to start.'

  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/tools/route-planner`,
      languages: {
        en: `${siteUrl}/en/tools/route-planner`,
        da: `${siteUrl}/da/tools/route-planner`,
        'x-default': `${siteUrl}/en/tools/route-planner`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/${lang}/tools/route-planner`,
      type: 'website',
    },
  }
}

interface Faq {
  q: string
  a: string
}

interface PlatformFeature {
  key: string
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  image: string
  imageAlt: string
}

export default async function RoutePlannerToolPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isMarketingLocale(lang)) notFound()
  const da = lang === 'da'

  const steps = da
    ? [
        { icon: MapPinIcon, title: 'Tilføj dine stop', body: 'Søg efter adresser og tilføj hvert stop til dagens liste. Ingen konto nødvendig.' },
        { icon: SparklesIcon, title: 'Optimér ruten', body: 'Tryk på Optimér, så finder værktøjet den hurtigste rækkefølge med rigtige kørselstider.' },
        { icon: DevicePhoneMobileIcon, title: 'Gem & tag med', body: 'Opret en gratis konto for at gemme ruten og åbne den på mobilen ude i marken.' },
      ]
    : [
        { icon: MapPinIcon, title: 'Add your stops', body: 'Search addresses and add each stop to today’s list. No account needed to start.' },
        { icon: SparklesIcon, title: 'Optimise the route', body: 'Hit Optimise and the tool finds the fastest visiting order using real driving times.' },
        { icon: DevicePhoneMobileIcon, title: 'Save & take it with you', body: 'Create a free account to save the route and open it on your phone out in the field.' },
      ]

  const platformFeatures: PlatformFeature[] = da
    ? [
        {
          key: 'routes',
          eyebrow: 'Ruteplanlægning',
          title: 'Optimér ruter for hele teamet — ikke kun dig selv',
          body: 'Det gratis værktøj her på siden planlægger én rute for én dag. Med en konto kan du planlægge og optimere ruter for alle dine medarbejdere på samme tid, se dem side om side på kortet, og omfordele stop mellem folk med et enkelt træk.',
          bullets: [
            'Se hver medarbejders rute i sin egen farve på samme kort',
            'Flyt et stop fra en medarbejder til en anden med drag & drop',
            'Automatisk optimering med rigtige kørselstider fra Mapbox',
          ],
          image: '/images/features/routes.png',
          imageAlt: 'PathPilo ruteplanlægning med flere medarbejdere på samme kort',
        },
        {
          key: 'scheduling',
          eyebrow: 'Planlægning',
          title: 'En hel uges opgaver overblikket i ét skærmbillede',
          body: 'Se dag, uge, måned eller år for hele teamet. Total køretid og arbejdstid beregnes automatisk for hver dag, så du hurtigt kan se om en medarbejder har for meget eller for lidt at gøre — og flytte opgaver med det samme.',
          bullets: [
            'Skift mellem dag-, uge-, måned- og årsvisning',
            'Se total køretid og arbejdstid pr. dag pr. medarbejder',
            'Træk og slip opgaver mellem dage direkte i kalenderen',
          ],
          image: '/images/features/scheduling.png',
          imageAlt: 'PathPilo ugeplan med opgaver og køretid pr. medarbejder',
        },
        {
          key: 'clients',
          eyebrow: 'Kunder',
          title: 'Alle kunder, adresser og historik — samlet ét sted',
          body: 'Hver kunde du tilføjer på en rute kan blive en rigtig kundeprofil med kontaktinfo, adresse, jobhistorik og noter. Ingen flere Excel-ark eller løse sedler — bare søg og find, uanset om det er en privatkunde eller en virksomhed.',
          bullets: [
            'Fuld søgbar kundeliste med adresser og kontaktinfo',
            'Se hele historikken af jobs og fakturaer per kunde',
            'Skeln mellem privatkunder og virksomheder automatisk',
          ],
          image: '/images/features/clients.png',
          imageAlt: 'PathPilo kundeliste med søgning og kontaktinformation',
        },
        {
          key: 'recurring',
          eyebrow: 'Gentagne opgaver',
          title: 'Faste kunder? Sæt det op én gang — og lad det køre selv',
          body: 'Rengøring hver 14. dag, vinduespudsning hver måned, plæneklipning hver uge om sommeren. Opsæt et abonnement én gang, og PathPilo genererer automatisk de næste jobs og lægger dem ind i ruteplanen for dig.',
          bullets: [
            'Ugentlige, 14-dages eller månedlige gentagelser',
            'Jobs oprettes automatisk og lægges ind i planen',
            'Pause eller stop et abonnement når kunden siger til',
          ],
          image: '/images/features/recurring.png',
          imageAlt: 'PathPilo abonnementer og gentagne opgaver for en kunde',
        },
        {
          key: 'invoicing',
          eyebrow: 'Fakturering',
          title: 'Fra udført opgave til betalt faktura — uden at skifte system',
          body: 'Når et job er lavet, kan du sende en faktura direkte fra PathPilo — med jeres logo, priser og moms sat op korrekt. Følg status fra kladde til sendt, forfalden og betalt, alt sammen tilknyttet den rigtige kunde.',
          bullets: [
            'Fakturaer genereret automatisk fra udførte jobs',
            'Status-flow: kladde → sendt → forfalden → betalt',
            'Fuldt overblik over saldo og betalingshistorik per kunde',
          ],
          image: '/images/features/invoicing.png',
          imageAlt: 'PathPilo faktura med status og saldo for en kunde',
        },
      ]
    : [
        {
          key: 'routes',
          eyebrow: 'Route planning',
          title: 'Optimise routes for your whole team — not just yourself',
          body: 'The free tool on this page plans one route for one day. With an account, you can plan and optimise routes for every employee at once, see them side by side on the same map, and reassign stops between people with a single drag.',
          bullets: [
            'See every employee’s route in their own colour on one map',
            'Drag a stop from one employee to another to reassign it',
            'One-click optimisation using real Mapbox driving times',
          ],
          image: '/images/features/routes.png',
          imageAlt: 'PathPilo route planning with multiple employees on the same map',
        },
        {
          key: 'scheduling',
          eyebrow: 'Scheduling',
          title: 'A whole week of jobs, visible in one screen',
          body: 'Switch between day, week, month, and year views for your whole team. Total drive time and work hours are calculated automatically for every day, so you can instantly see who’s overbooked or underbooked and move jobs around before it becomes a problem.',
          bullets: [
            'Day, week, month, and year views for the whole team',
            'Automatic total drive time and work hours per day, per person',
            'Drag and drop jobs between days right in the calendar',
          ],
          image: '/images/features/scheduling.png',
          imageAlt: 'PathPilo week planner with jobs and drive time per employee',
        },
        {
          key: 'clients',
          eyebrow: 'Clients',
          title: 'Every client, address, and job history — in one place',
          body: 'Any stop you add on a route can become a real client profile with contact details, address, job history, and notes. No more spreadsheets or sticky notes — just search and find, whether it’s a homeowner or a company.',
          bullets: [
            'A fully searchable client list with contact details',
            'Full job and invoice history for every client',
            'Automatically distinguishes people from companies',
          ],
          image: '/images/features/clients.png',
          imageAlt: 'PathPilo client list with search and contact information',
        },
        {
          key: 'recurring',
          eyebrow: 'Recurring jobs',
          title: 'Regular customers? Set it up once — let it run itself',
          body: 'Cleaning every two weeks, window washing monthly, lawn care weekly in summer. Set up a subscription once, and PathPilo automatically generates the upcoming jobs and drops them straight into the route plan for you.',
          bullets: [
            'Weekly, bi-weekly, or monthly recurrence patterns',
            'Jobs are generated automatically and slotted into the plan',
            'Pause or cancel a subscription the moment a client asks',
          ],
          image: '/images/features/recurring.png',
          imageAlt: 'PathPilo subscriptions and recurring jobs for a client',
        },
        {
          key: 'invoicing',
          eyebrow: 'Invoicing',
          title: 'From finished job to paid invoice — without switching apps',
          body: 'Once a job is complete, send an invoice straight from PathPilo — with your logo, prices, and VAT set up correctly. Track status from draft to sent, overdue, and paid, all tied back to the right client automatically.',
          bullets: [
            'Invoices generated automatically from completed jobs',
            'Status flow: draft → sent → overdue → paid',
            'Full overview of balance and payment history per client',
          ],
          image: '/images/features/invoicing.png',
          imageAlt: 'PathPilo invoice with status and client balance',
        },
      ]

  const faqs: Faq[] = da
    ? [
        {
          q: 'Er ruteplanlæggeren virkelig gratis?',
          a: 'Ja. Du kan planlægge og optimere en rute lige her i browseren uden at oprette en konto. Din rute gemmes lokalt på din enhed. Vil du gemme den permanent, se den på mobilen eller dele opgaver med et team, opretter du en gratis PathPilo-konto.',
        },
        {
          q: 'Skal jeg logge ind for at bruge den?',
          a: 'Nej. Værktøjet virker med det samme uden login. Login kræves kun, hvis du vil gemme ruten til din konto og synkronisere den på tværs af enheder.',
        },
        {
          q: 'Hvor gemmes mine data?',
          a: 'Alt du planlægger her, bliver gemt i din browsers lokale lager (localStorage) på din egen enhed. Intet sendes til vores servere, før du vælger at oprette en konto — og så kan vi flytte den rute, du allerede har lavet, direkte ind på kontoen.',
        },
        {
          q: 'Hvor mange stop kan jeg tilføje?',
          a: 'Den gratis planlægger optimerer op til 25 stop ad gangen (Mapbox-grænsen for kørsel). Det dækker de fleste servicebilers dag. Har du brug for flere ruter eller flere medarbejdere på samme dag, gør en konto det muligt.',
        },
        {
          q: 'Kan jeg flytte ind i den fulde app senere?',
          a: 'Ja. Når du opretter en gratis konto, tager vi den rute, du lige har planlagt, med over, så du kan fortsætte med kunder, kalender, fakturering og team-planlægning.',
        },
      ]
    : [
        {
          q: 'Is the route planner really free?',
          a: 'Yes. You can plan and optimise a route right here in your browser without creating an account. Your route is saved locally on your device. To save it permanently, view it on mobile, or share jobs with a team, you create a free PathPilo account.',
        },
        {
          q: 'Do I need to log in to use it?',
          a: 'No. The tool works instantly with no login. A login is only needed if you want to save the route to your account and sync it across devices.',
        },
        {
          q: 'Where is my data stored?',
          a: 'Everything you plan here is kept in your browser’s local storage on your own device. Nothing is sent to our servers until you choose to create an account — at which point we can move the route you already built straight into it.',
        },
        {
          q: 'How many stops can I add?',
          a: 'The free planner optimises up to 25 stops at a time (the Mapbox driving limit), which covers most service vehicles’ day. If you need multiple routes or several people on the same day, an account unlocks that.',
        },
        {
          q: 'Can I move into the full app later?',
          a: 'Yes. When you create a free account we carry over the route you just planned, so you can keep going with clients, calendar, invoicing, and team scheduling.',
        },
      ]

  // Articles are English-first (no locale prefix); feature pages are localised.
  const articleLinks = [
    { href: '/articles/field-service-route-planning-software', en: 'Field service route planning software', da: 'Ruteplanlægning til servicevirksomheder' },
    { href: '/articles/map-based-scheduling', en: 'Map-based scheduling explained', da: 'Kortbaseret planlægning forklaret' },
    { href: '/articles/automated-route-planning', en: 'How automated route planning works', da: 'Sådan virker automatisk ruteplanlægning' },
    { href: '/articles/recurring-jobs-predictable-revenue', en: 'Recurring jobs & predictable revenue', da: 'Gentagne opgaver & forudsigelig omsætning' },
  ]

  return (
    <>
      <Header />

      {/* Hero: SEO title + description above the tool */}
      <section className="gradient-bg pt-8 pb-6 md:pt-12">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">
            {da ? 'Gratis værktøj · Ingen login' : 'Free tool · No sign-up'}
          </p>
          <h1 className="text-3xl font-bold text-primary-800 md:text-4xl lg:text-[2.75rem]">
            {da ? 'Gratis ruteplanlægger til feltservice' : 'Free Route Planner for Field Service Teams'}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            {da
              ? 'Planlæg og optimér din kørerute direkte i browseren — helt gratis og uden at oprette en konto. Tilføj adresser, få den hurtigste rækkefølge med rigtige kørselstider, og se din rute tegnet op på et kort på få sekunder.'
              : 'Plan and optimise your driving route right in your browser — completely free, with no account required. Add addresses, get the fastest visiting order using real driving times, and see your route mapped out in seconds.'}
          </p>
          <ul className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-gray-500">
            {(da
              ? ['Ingen installation', 'Rigtige kørselstider', 'Gemmes lokalt i din browser']
              : ['No installation needed', 'Real driving times', 'Saved locally in your browser']
            ).map((li) => (
              <li key={li} className="flex items-center gap-1.5">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-accent-600" />
                {li}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto mt-8 w-full max-w-[1500px] px-3 sm:px-6">
          <div className="h-[min(78vh,760px)] min-h-[640px] sm:h-[min(80vh,800px)] sm:min-h-[680px] lg:h-[min(82vh,880px)] lg:min-h-[700px]">
            <RoutePlannerTool locale={lang} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-3xl font-bold text-primary-800">
            {da ? 'Sådan virker det' : 'How it works'}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10">
                  <s.icon className="h-6 w-6 text-accent-600" />
                </div>
                <h3 className="text-lg font-bold text-primary-800">{s.title}</h3>
                <p className="mt-2 text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── LONG-FORM: what else the platform can do ─── */}
      <section className="border-t border-gray-100 bg-white py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">
              {da ? 'Mere end en ruteplanlægger' : 'More than a route planner'}
            </p>
            <h2 className="text-3xl font-bold text-primary-800 md:text-4xl">
              {da ? 'Det er sådan her PathPilo driver hele din forretning' : 'This is how PathPilo runs your whole business'}
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              {da
                ? 'Værktøjet ovenfor er en gratis smagsprøve på en enkelt funktion. Den fulde PathPilo-platform samler ruteplanlægning, kalender, kunder, gentagne opgaver og fakturering i ét system — så du aldrig skal skifte mellem apps for at drive din servicevirksomhed.'
                : 'The tool above is a free taste of a single feature. The full PathPilo platform brings route planning, scheduling, clients, recurring jobs, and invoicing together in one system — so you never have to switch between apps to run your service business.'}
            </p>
          </div>

          <div className="mt-14 space-y-16 md:space-y-20">
            {platformFeatures.map((f, i) => {
              const imageFirst = i % 2 === 1
              return (
                <div
                  key={f.key}
                  className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
                >
                  <div className={imageFirst ? 'md:order-2' : ''}>
                    <p className="text-xs font-bold uppercase tracking-widest text-accent-600">{f.eyebrow}</p>
                    <h3 className="mt-2 text-2xl font-bold text-primary-800 md:text-[1.75rem]">{f.title}</h3>
                    <p className="mt-3 text-base leading-relaxed text-gray-600">{f.body}</p>
                    <ul className="mt-5 space-y-2.5">
                      {f.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-gray-600">
                          <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-600" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={imageFirst ? 'md:order-1' : ''}>
                    <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
                      <Image
                        src={f.image}
                        alt={f.imageAlt}
                        width={1061}
                        height={605}
                        className="h-auto w-full"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Link
              href="https://app.pathpilo.com/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-6 py-3 text-base font-bold text-white transition hover:bg-accent-600"
            >
              {da ? 'Opret gratis konto' : 'Create free account'}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <p className="text-sm text-gray-500">
              {da ? 'Gratis for ubegrænsede kunder og opgaver — ingen betalingskort krævet.' : 'Free for unlimited clients and jobs — no credit card required.'}
            </p>
          </div>
        </div>
      </section>

      {/* Free vs account */}
      <section className="bg-primary-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-primary-800">
            {da ? 'Gratis nu — mere med en konto' : 'Free now — more with an account'}
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-7">
              <h3 className="text-lg font-bold text-primary-800">
                {da ? 'Gratis her på siden' : 'Free right here'}
              </h3>
              <ul className="mt-4 space-y-2.5 text-gray-600">
                {(da
                  ? ['Søg og tilføj stop på kortet', 'Optimér rækkefølgen automatisk', 'Tegn eller flyt stop selv', 'Se rigtige kørselstider og distance', 'Gemmes lokalt i din browser']
                  : ['Search and add stops on the map', 'Optimise the visiting order automatically', 'Draw or reorder stops yourself', 'See real driving times and distance', 'Saved locally in your browser']
                ).map((li) => (
                  <li key={li} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500" />
                    {li}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-accent-400 bg-white p-7">
              <h3 className="text-lg font-bold text-primary-800">
                {da ? 'Med en gratis konto' : 'With a free account'}
              </h3>
              <ul className="mt-4 space-y-2.5 text-gray-600">
                {(da
                  ? ['Gem ruter permanent', 'Åbn på mobilen ude i marken', 'Kunder, kalender og fakturering', 'Send opgaver til dit team', 'Gentagne opgaver og påmindelser']
                  : ['Save routes permanently', 'Open on mobile out in the field', 'Clients, calendar and invoicing', 'Send jobs to your team', 'Recurring jobs and reminders']
                ).map((li) => (
                  <li key={li} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500" />
                    {li}
                  </li>
                ))}
              </ul>
              <Link
                href="https://app.pathpilo.com/register"
                className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-600"
              >
                {da ? 'Opret gratis konto' : 'Create free account'}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold text-primary-800">
            {da ? 'Ofte stillede spørgsmål' : 'Frequently asked questions'}
          </h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-xl border border-gray-200 bg-white p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-primary-800">
                  {f.q}
                  <span className="text-accent-600 transition group-open:rotate-45">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Related reading */}
      <section className="bg-primary-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold text-primary-800">
            {da ? 'Læs mere om ruteplanlægning' : 'Read more about route planning'}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {articleLinks.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5 transition hover:border-accent-400 hover:shadow-md"
              >
                <span className="font-semibold text-primary-800">{da ? a.da : a.en}</span>
                <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-accent-600 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link href={`/${lang}/features/routeplanning`} className="font-semibold text-accent-700 hover:underline">
              {da ? 'Se ruteplanlægnings-funktionen →' : 'See the route planning feature →'}
            </Link>
            <a href="https://help.pathpilo.com" className="font-semibold text-accent-700 hover:underline" target="_blank" rel="noopener noreferrer">
              {da ? 'Hjælp & vejledninger →' : 'Help & guides →'}
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
