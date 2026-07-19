import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import { INDUSTRIES } from '../../lib/industries/data'
import { DA_INDUSTRY_TRANSLATIONS } from '../../lib/industries/da-translations'
import { getMarketingSiteUrl } from '../../lib/siteUrl'
import { isMarketingLocale } from '../../lib/i18n'

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
    ? 'Software til servicevirksomheder — gratis ruteplanlægning og fakturering | PathPilo'
    : 'Field Service Software by Industry — Free Route Planning & Invoicing | PathPilo'
  const description = da
    ? 'Gratis software til servicevirksomheder tilpasset dit fag. Vinduespolering, privat rengøring, haveservice, tagrenserensning, højtryksrensning og skraldesspandsrensning — alt med ruteplanlægning og fakturering.'
    : 'Free field service software built for your trade. Window cleaning, domestic cleaning, lawn care, gutter cleaning, pressure washing, and bin cleaning — all with route planning, reminders, and invoicing.'

  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/industries`,
      languages: {
        en: `${siteUrl}/en/industries`,
        da: `${siteUrl}/da/industries`,
        'x-default': `${siteUrl}/en/industries`,
      },
    },
  }
}

export default async function LocalizedIndustriesIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isMarketingLocale(lang)) notFound()
  const da = lang === 'da'

  const COMING_SOON_DA = ['Skadedyrsbekæmpelse', 'Poolrengøring', 'Håndværkertjenester', 'Solcellepanelrensning']
  const COMING_SOON_EN = ['Pest control', 'Pool maintenance', 'Handyman services', 'Solar panel cleaning']
  const COMING_SOON = da ? COMING_SOON_DA : COMING_SOON_EN

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">
            {da ? 'Bygget til dit fag' : 'Built for your trade'}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold text-primary-800 md:text-5xl">
            {da
              ? 'Software tilpasset til din virksomheds hverdag'
              : 'Software tailored to how your business actually works'}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            {da
              ? 'Den samme kraftfulde platform, sat op til din branches dagligdag. Vælg din nedenfor.'
              : 'The same powerful platform, set up around the day-to-day of your trade. Pick yours below.'}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((ind) => {
            const translation = da ? DA_INDUSTRY_TRANSLATIONS[ind.slug] : null
            const label = translation?.menuLabel ?? ind.menuLabel
            const blurb = translation?.menuBlurb ?? ind.menuBlurb
            const trade = translation?.trade ?? ind.trade

            return (
              <Link
                key={ind.slug}
                href={`/${lang}/industries/${ind.slug}`}
                className="group flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:border-accent-400 hover:shadow-lg"
              >
                <div>
                  <h2 className="text-xl font-bold text-primary-800">{label}</h2>
                  <p className="mt-2 text-gray-600">{blurb}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700">
                  {da ? `Se ${trade}-software` : `See ${trade} software`}
                  <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            )
          })}

          {COMING_SOON.map((label) => (
            <div
              key={label}
              className="flex flex-col justify-between rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-7"
            >
              <div>
                <h2 className="text-xl font-bold text-gray-400">{label}</h2>
                <p className="mt-2 text-gray-400">
                  {da ? 'En tilpasset side til dette fag er på vej.' : 'A tailored page for this trade is on the way.'}
                </p>
              </div>
              <span className="mt-6 inline-flex items-center text-sm font-semibold text-gray-400">
                {da ? 'Kommer snart' : 'Coming soon'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </>
  )
}
