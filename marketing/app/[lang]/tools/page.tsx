import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRightIcon, MapIcon } from '@heroicons/react/24/outline'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Breadcrumbs from '../../components/Breadcrumbs'
import JsonLd from '../../components/JsonLd'
import { isMarketingLocale } from '../../lib/i18n'
import { bilingualPageMetadata } from '../../lib/seo'
import { breadcrumbSchema } from '../../lib/schema'
import { breadcrumbsForRoute } from '../../lib/breadcrumbs'

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
  return bilingualPageMetadata({
    lang,
    path: '/tools',
    title: da ? 'Gratis værktøjer til servicevirksomheder | PathPilo' : 'Free tools for service businesses | PathPilo',
    description: da
      ? 'Brug PathPilos gratis værktøjer uden login — start med den gratis ruteplanlægger.'
      : 'Use PathPilo’s free tools without signing up — start with the free route planner.',
  })
}

export default async function ToolsIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isMarketingLocale(lang)) notFound()
  const da = lang === 'da'

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: da ? 'Hjem' : 'Home', path: `/${lang}` },
          { name: da ? 'Værktøjer' : 'Tools', path: `/${lang}/tools` },
        ])}
      />
      <Header />
      <section className="gradient-bg pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Breadcrumbs items={breadcrumbsForRoute(lang, 'tools')} className="mb-6 justify-center" />
          <h1 className="text-4xl font-bold text-primary-800 md:text-5xl">
            {da ? 'Gratis værktøjer' : 'Free tools'}
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            {da
              ? 'Praktiske værktøjer du kan bruge med det samme — uden konto. Flere kommer snart.'
              : 'Practical tools you can use right away — no account needed. More coming soon.'}
          </p>
        </div>
      </section>
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href={`/${lang}/tools/route-planner`}
            className="group flex items-start gap-5 rounded-2xl border border-primary-100 bg-white p-6 shadow-sm transition hover:border-accent-400 hover:shadow-md"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700">
              <MapIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-primary-800">
                  {da ? 'Gratis ruteplanlægger' : 'Free route planner'}
                </h2>
                <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
                  {da ? 'Live' : 'Live'}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {da
                  ? 'Tilføj stop, optimér rækkefølgen med rigtige kørselstider, og se ruten på et kort — helt gratis i browseren.'
                  : 'Add stops, optimise the order with real driving times, and see the route on a map — free in your browser.'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-700 group-hover:gap-2 transition-all">
                {da ? 'Åbn værktøjet' : 'Open the tool'}
                <ArrowRightIcon className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>
      </section>
      <Footer />
    </>
  )
}
