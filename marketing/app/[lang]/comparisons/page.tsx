import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import { COMPARISON_PAGES } from '../../lib/comparisons/data'
import { DA_COMPARISON_TRANSLATIONS } from '../../lib/comparisons/da-translations'
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
    ? 'PathPilo vs konkurrenter — ærlige sammenligninger | PathPilo'
    : 'PathPilo vs Competitors — Honest Software Comparisons | PathPilo'
  const description = da
    ? 'Se hvordan PathPilo sammenlignes med Jobber, Squeegee, Housecall Pro og ServiceM8. Ærlige side-om-side sammenligninger af priser og funktioner til vinduespolerere.'
    : 'See how PathPilo compares to Jobber, Squeegee, Housecall Pro, and ServiceM8. Honest side-by-side comparisons of pricing and features for window cleaners.'

  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/comparisons`,
      languages: {
        en: `${siteUrl}/en/comparisons`,
        da: `${siteUrl}/da/comparisons`,
        'x-default': `${siteUrl}/en/comparisons`,
      },
    },
  }
}

export default async function LocalizedComparisonsIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isMarketingLocale(lang)) notFound()
  const da = lang === 'da'

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">
            {da ? 'Sammenligninger' : 'Comparisons'}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold text-primary-800 md:text-5xl">
            {da ? 'PathPilo vs konkurrenter' : 'PathPilo vs Competitors'}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            {da
              ? 'Ærlige, opdaterede sammenligninger af de mest populære field service-platforme for vinduespolerere og andre servicevirksomheder.'
              : 'Honest, up-to-date comparisons of the most popular field service platforms for window cleaners and other service businesses.'}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-2">
          {COMPARISON_PAGES.map((comp) => {
            const translation = da ? DA_COMPARISON_TRANSLATIONS[comp.slug] : null
            const headline = translation?.headline ?? comp.headline
            const sub = translation?.sub ?? comp.sub

            return (
              <Link
                key={comp.slug}
                href={`/${lang}/comparisons/${comp.slug}`}
                className="group flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:border-accent-400 hover:shadow-lg"
              >
                <div>
                  <h2 className="text-xl font-bold text-primary-800">{headline}</h2>
                  <p className="mt-2 text-gray-600 line-clamp-2">{sub}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700">
                  {da ? 'Læs sammenligningen' : 'Read the comparison'}
                  <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      <Footer />
    </>
  )
}
