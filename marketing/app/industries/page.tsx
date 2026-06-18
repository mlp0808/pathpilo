import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { INDUSTRIES } from '../lib/industries/data'
import { getMarketingSiteUrl } from '../lib/siteUrl'

export const metadata: Metadata = {
  title: 'Field Service Software by Industry — Free Route Planning & Invoicing | PathPilo',
  description:
    'Free field service software built for your trade. Window cleaning, domestic cleaning, lawn care, gutter cleaning, pressure washing, and bin cleaning — all with route planning, reminders, and invoicing.',
  alternates: { canonical: '/industries' },
  openGraph: {
    title: 'Field Service Software by Industry | PathPilo',
    description: 'Free route planning, scheduling, and invoicing software tailored to your trade.',
    url: `${getMarketingSiteUrl()}/industries`,
    type: 'website',
  },
}

const COMING_SOON = ['Pest control', 'Pool maintenance', 'Handyman services', 'Solar panel cleaning']

export default function IndustriesIndexPage() {
  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">Built for your trade</p>
          <h1 className="max-w-3xl text-4xl font-bold text-primary-800 md:text-5xl">
            Software tailored to how your business actually works
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            The same powerful platform, set up around the day-to-day of your trade. Pick yours below.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((ind) => (
            <Link
              key={ind.slug}
              href={`/industries/${ind.slug}`}
              className="group flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:border-accent-400 hover:shadow-lg"
            >
              <div>
                <h2 className="text-xl font-bold text-primary-800">{ind.menuLabel}</h2>
                <p className="mt-2 text-gray-600">{ind.menuBlurb}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700">
                See {ind.trade} software
                <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}

          {COMING_SOON.map((label) => (
            <div
              key={label}
              className="flex flex-col justify-between rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-7"
            >
              <div>
                <h2 className="text-xl font-bold text-gray-400">{label}</h2>
                <p className="mt-2 text-gray-400">A tailored page for this trade is on the way.</p>
              </div>
              <span className="mt-6 inline-flex items-center text-sm font-semibold text-gray-400">Coming soon</span>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </>
  )
}
