'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ComparisonPage } from '@/app/lib/comparisons/types'

// ── Tiny helpers ────────────────────────────────────────────────────────────

function Check() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0 mt-0.5">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
        <path d="M2 6L4.5 8.5L9 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function Cross() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-400 flex-shrink-0 mt-0.5">
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
        <path d="M1.5 1.5L7.5 7.5M7.5 1.5L1.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function TableCell({ value }: { value: string }) {
  if (value === 'Included free' || value === 'Free plan (no expiry)' || value === 'Free' || value.startsWith('Free'))
    return <span className="text-emerald-600 font-semibold text-sm">{value}</span>
  return <span className="text-slate-600 text-sm">{value}</span>
}

// ── FAQ accordion ────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-base font-semibold text-slate-800">{q}</span>
        <span
          className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform ${open ? 'rotate-45' : ''}`}
          aria-hidden
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <p className="pb-5 text-[15px] leading-relaxed text-slate-600">{a}</p>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ComparisonPageContent({ data, locale = 'en' }: { data: ComparisonPage; locale?: string }) {
  const da = locale === 'da'
  const competitorId = data.competitors[0]?.id ?? 'jobber'
  const competitor = data.competitors[0]

  const dateLocale = da ? 'da-DK' : 'en-GB'
  const formattedDate = new Date(data.lastUpdated).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <main>
      {/* ── Breadcrumb */}
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <nav className="flex items-center gap-1.5 text-xs text-slate-400">
            <Link href={da ? '/da' : '/'} className="hover:text-slate-600">{da ? 'Hjem' : 'Home'}</Link>
            <span>/</span>
            <Link href={da ? '/da/comparisons' : '/comparisons'} className="hover:text-slate-600">
              {da ? 'Sammenligninger' : 'Comparisons'}
            </Link>
            <span>/</span>
            <span className="text-slate-600 font-medium truncate">{data.headline}</span>
          </nav>
        </div>
      </div>

      {/* ── Hero */}
      <section className="bg-white pt-14 pb-10 sm:pt-20 sm:pb-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-600">
            {da ? 'Softwaresammenligning' : 'Software comparison'}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            {data.headline}
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl">{data.sub}</p>
          <p className="mt-3 text-xs text-slate-400">
            {da ? 'Sidst opdateret' : 'Last updated'}: {formattedDate}
            {' · '}{da ? 'Priser hentet fra officielle prissider.' : 'Pricing sourced from official pricing pages.'}
          </p>
        </div>
      </section>

      {/* ── Verdict banner */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div className="flex gap-4">
            <div className="hidden flex-shrink-0 sm:block">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M10 2L12.4 7.2L18 8L14 11.8L15 17.4L10 14.8L5 17.4L6 11.8L2 8L7.6 7.2L10 2Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                {da ? 'Konklusion' : 'Bottom line'}
              </p>
              <p className="text-[15px] leading-relaxed text-slate-700">{data.verdict}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing table */}
      <section className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">{data.pricingBreakdown.title}</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full min-w-[440px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-4 pl-6 pr-4 text-left font-medium text-slate-400 text-xs uppercase tracking-wide w-1/2">
                    {da ? 'Scenarie' : 'Scenario'}
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-emerald-700 bg-emerald-50 w-1/4">
                    PathPilo
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-slate-700 w-1/4">
                    {competitor?.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.pricingBreakdown.rows.map((row, i) => (
                  <tr key={row.label} className={`border-b border-slate-50 last:border-0 ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`}>
                    <td className="py-3.5 pl-6 pr-4 text-slate-700 leading-snug">{row.label}</td>
                    <td className="px-4 py-3.5 text-center bg-emerald-50/50">
                      <TableCell value={row.pathpilo} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <TableCell value={row[competitorId] as string} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">{data.pricingBreakdown.note}</p>
        </div>
      </section>

      {/* ── Body sections */}
      <section className="bg-slate-50 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-12">
          {data.sections.map((s) => (
            <div key={s.id} id={s.id}>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-3">{s.title}</h2>
              {s.body.split('\n\n').map((para, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-slate-600 mb-3 last:mb-0">{para}</p>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Pros & cons */}
      <section className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-8">{da ? 'Fordele og ulemper' : 'Pros and cons'}</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {/* PathPilo */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
              <h3 className="mb-4 font-bold text-slate-800 text-lg">PathPilo</h3>
              <div className="space-y-1 mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">{da ? 'Fordele' : 'Pros'}</p>
                {data.prosCons.pathpilo.pros.map((p) => (
                  <div key={p} className="flex items-start gap-2.5">
                    <Check />
                    <span className="text-sm text-slate-700">{p}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{da ? 'Ulemper' : 'Cons'}</p>
                {data.prosCons.pathpilo.cons.map((c) => (
                  <div key={c} className="flex items-start gap-2.5">
                    <Cross />
                    <span className="text-sm text-slate-700">{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="mb-4 font-bold text-slate-800 text-lg">{competitor?.name}</h3>
              <div className="space-y-1 mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">{da ? 'Fordele' : 'Pros'}</p>
                {data.prosCons[competitorId]?.pros.map((p) => (
                  <div key={p} className="flex items-start gap-2.5">
                    <Check />
                    <span className="text-sm text-slate-700">{p}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{da ? 'Ulemper' : 'Cons'}</p>
                {data.prosCons[competitorId]?.cons.map((c) => (
                  <div key={c} className="flex items-start gap-2.5">
                    <Cross />
                    <span className="text-sm text-slate-700">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who should choose */}
      <section className="bg-slate-50 border-y border-slate-200 py-14 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-8">{da ? 'Hvem bør vælge hvad?' : 'Who should choose which?'}</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">{da ? 'Vælg PathPilo hvis' : 'Choose PathPilo if'}</p>
              <p className="text-[15px] leading-relaxed text-slate-700">{data.whoShouldChoose.pathpilo}</p>
              <div className="mt-5">
                <a
                  href="https://app.pathpilo.com/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
                >
                  {da ? 'Start gratis — intet kort krævet' : 'Start free — no card required'}
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path d="M3 6.5h7M7 3.5l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {da ? `Vælg ${competitor?.name} hvis` : `Choose ${competitor?.name} if`}
              </p>
              <p className="text-[15px] leading-relaxed text-slate-700">{data.whoShouldChoose[competitorId]}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ */}
      <section className="bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">{da ? 'Ofte stillede spørgsmål' : 'Frequently asked questions'}</h2>
          <p className="text-slate-500 mb-8 text-sm">
            {da
              ? `Almindelige spørgsmål om at vælge mellem PathPilo og ${competitor?.name} til vinduespolering.`
              : `Common questions about choosing between PathPilo and ${competitor?.name} for window cleaning.`}
          </p>
          <div className="rounded-2xl border border-slate-200 overflow-hidden px-6">
            {data.faq.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA */}
      <section className="bg-slate-900 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {da ? 'Prøv PathPilo gratis — intet kreditkort, ingen tidsbegrænsning' : 'Try PathPilo free — no credit card, no time limit'}
          </h2>
          <p className="mt-3 text-slate-400">
            {da
              ? 'Tilføj dine kunder, planlæg din første rute og send din første faktura i dag. Gratisplanen dækker alt en solo operatør eller et lille hold behøver.'
              : 'Add your customers, plan your first route, and send your first invoice today. The free plan covers everything a solo operator or small team needs.'}
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="https://app.pathpilo.com/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-emerald-600 transition-colors"
            >
              {da ? 'Kom i gang gratis' : 'Get started free'}
            </a>
            <Link
              href={da ? '/da/industries/window-cleaning-software' : '/industries/window-cleaning-software'}
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4 decoration-slate-600"
            >
              {da ? 'Læs mere om PathPilo til vinduespolerere' : 'Learn more about PathPilo for window cleaners'}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
