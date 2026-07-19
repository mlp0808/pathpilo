'use client'

import Link from 'next/link'
import type { ComparisonSection } from '@/app/lib/comparisons/types'

interface Props {
  data: ComparisonSection
  /** Optional link to a dedicated vs-page (e.g. "/comparisons/pathpilo-vs-jobber-window-cleaning") */
  detailHref?: string
  locale?: string
}

function Cell({ value, isPathPilo = false }: { value: string | boolean; isPathPilo?: boolean }) {
  if (value === true)
    return (
      <span className="inline-flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path
              d="M2 7L5 10L11 3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    )

  if (value === false)
    return (
      <span className="inline-flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-red-400">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path
              d="M2 2L9 9M9 2L2 9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </span>
    )

  // PathPilo string values (prices, highlights) shown in green
  if (isPathPilo)
    return <span className="text-sm font-semibold text-emerald-700 leading-tight">{value}</span>

  return <span className="text-sm text-slate-500 leading-tight">{value}</span>
}

export default function ComparisonSection({ data, detailHref, locale = 'en' }: Props) {
  const da = locale === 'da'
  const cols = ['pathpilo', ...data.competitors.map((c) => c.id)]
  const compMap = Object.fromEntries(data.competitors.map((c) => [c.id, c]))
  // Prefix the detail link with the locale if it points to /comparisons/...
  const localizedDetailHref = detailHref
    ? detailHref.startsWith('/comparisons/')
      ? `/${locale}${detailHref}`
      : detailHref
    : undefined

  return (
    <section className="py-20 bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {data.title}
          </h2>
          <p className="mt-3 text-base text-slate-500 max-w-2xl mx-auto">{data.sub}</p>
        </div>

        {/* Table wrapper — horizontal scroll on very small screens */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b border-slate-100">
                <th className="w-48 py-4 pl-6 pr-4 text-left font-medium text-slate-400 text-xs uppercase tracking-wide">
                  {da ? 'Funktion' : 'Feature'}
                </th>
                {cols.map((id) => {
                  const isUs = id === 'pathpilo'
                  const comp = compMap[id]
                  return (
                    <th
                      key={id}
                      className={`w-36 px-4 py-4 text-center font-semibold text-sm ${
                        isUs
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {isUs ? (
                        <span className="flex flex-col items-center gap-0.5">
                          <span>PathPilo</span>
                          <span className="text-[10px] font-normal text-emerald-500 uppercase tracking-wide">
                            {da ? 'Gratis · fra £25/md†' : 'Free · from £25/mo†'}
                          </span>
                        </span>
                      ) : (
                        <span className="flex flex-col items-center gap-0.5">
                          <span>{comp.name}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {comp.startingPrice}
                          </span>
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {data.rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={`border-b border-slate-50 last:border-0 ${
                    i % 2 === 1 ? 'bg-slate-50/40' : ''
                  }`}
                >
                  <td className="py-3.5 pl-6 pr-4 text-slate-700 font-medium leading-snug">
                    {row.feature}
                  </td>
                  {cols.map((id) => {
                    const isUs = id === 'pathpilo'
                    return (
                      <td
                        key={id}
                        className={`px-4 py-3.5 text-center ${isUs ? 'bg-emerald-50/60' : ''}`}
                      >
                        <Cell value={row[id]} isPathPilo={isUs} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>

          {/* Footer: starting prices */}
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="py-3.5 pl-6 pr-4 text-xs text-slate-400 uppercase tracking-wide font-semibold">
                {da ? 'Startpris' : 'Starting price'}
              </td>
              {cols.map((id) => {
                const isUs = id === 'pathpilo'
                const comp = compMap[id]
                return (
                  <td
                    key={id}
                    className={`px-4 py-3.5 text-center font-semibold text-sm ${
                      isUs ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700'
                    }`}
                  >
                    {isUs ? (
                      <span className="flex flex-col items-center gap-0.5">
                        <span>{da ? 'Gratis' : 'Free'}</span>
                        <span className="text-[11px] font-normal text-emerald-600">
                          {da ? 'Team: £25/md†' : 'Team: £25/mo†'}
                        </span>
                      </span>
                    ) : comp.startingPrice}
                  </td>
                )
              })}
            </tr>
          </tfoot>
          </table>
        </div>

        {/* Disclaimer */}
        <p className="mt-4 text-center text-xs text-slate-400">{data.disclaimer}</p>

        {/* Detail link */}
        {localizedDetailHref && (
          <div className="mt-8 flex justify-center">
            <Link
              href={localizedDetailHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              {da ? 'Læs den fulde sammenligning' : 'Read the full comparison'}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 7h8M8 4l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
