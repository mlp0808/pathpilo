import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { COMPARISON_PAGES } from '../lib/comparisons/data'

export const metadata: Metadata = {
  title: 'PathPilo vs other field service software — Comparisons',
  description:
    'Honest, up-to-date comparisons between PathPilo and the most popular field service and window cleaning software alternatives.',
  alternates: { canonical: 'https://pathpilo.com/comparisons' },
}

export default function ComparisonsIndex() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">
            Software comparisons
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            PathPilo vs. the alternatives
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl">
            Straightforward, up-to-date comparisons based on published pricing and real feature availability. No puff — just the information you need to choose the right tool.
          </p>

          <ul className="mt-12 space-y-4">
            {COMPARISON_PAGES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/comparisons/${c.slug}`}
                  className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                >
                  <div>
                    <p className="font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">
                      {c.headline}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{c.seoDescription}</p>
                  </div>
                  <svg
                    className="ml-4 h-5 w-5 flex-shrink-0 text-slate-300 group-hover:text-emerald-500 transition-colors"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M7 5l5 5-5 5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-16 rounded-2xl bg-slate-50 border border-slate-200 px-8 py-8">
            <p className="text-sm text-slate-500">
              All pricing figures are sourced from each product&#39;s public pricing page. Pricing changes frequently — verify with each provider before making a purchase decision. Comparisons are updated periodically; each page shows the date it was last reviewed.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
