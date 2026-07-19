'use client'

import { useMemo, useState } from 'react'
import type { IndustryCalculator } from '../../lib/industries/types'

/**
 * Interactive "what's an extra hour worth" calculator. The visitor drags to
 * their average jobs/day; we project the extra jobs and revenue a tighter,
 * better-planned round could unlock. Solution-focused, not tech-focused.
 */
export default function RevenueCalculator({ config, locale = 'en' }: { config: IndustryCalculator; locale?: string }) {
  const da = locale === 'da'
  const [jobs, setJobs] = useState(config.defaultJobs)

  const { extraPerWeek, extraMonthlyRevenue, extraYearlyRevenue } = useMemo(() => {
    const extraJobsPerDay = jobs * config.extraJobsPerDay
    const perWeek = extraJobsPerDay * config.daysPerWeek
    const monthly = perWeek * 4.33 * config.avgJobValue
    const yearly = perWeek * 52 * config.avgJobValue
    return {
      extraPerWeek: Math.round(perWeek),
      extraMonthlyRevenue: Math.round(monthly),
      extraYearlyRevenue: Math.round(yearly),
    }
  }, [jobs, config])

  const fmt = (n: number) => `${config.currency}${n.toLocaleString('en-GB')}`
  const pct = ((jobs - config.minJobs) / (config.maxJobs - config.minJobs)) * 100

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-xl">
      <div className="p-6 sm:p-10">
        <div className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <label htmlFor="jobs-slider" className="text-sm font-semibold text-primary-800">
              {da ? 'Opgaver på en gennemsnitlig dag' : 'Jobs you clean on an average day'}
            </label>
            <span className="text-2xl font-extrabold text-primary-800">{jobs}</span>
          </div>
          <input
            id="jobs-slider"
            type="range"
            min={config.minJobs}
            max={config.maxJobs}
            value={jobs}
            onChange={(e) => setJobs(Number(e.target.value))}
            className="industry-range w-full"
            style={{
              background: `linear-gradient(to right, #3DD57A 0%, #3DD57A ${pct}%, #e5e7eb ${pct}%, #e5e7eb 100%)`,
            }}
          />
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>{config.minJobs}</span>
            <span>{config.maxJobs}+</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-primary-50 p-5 text-center">
            <div className="text-3xl font-extrabold text-primary-800">+{extraPerWeek}</div>
            <div className="mt-1 text-sm text-gray-600">{da ? 'ekstra opgaver pr. uge' : 'extra jobs a week'}</div>
          </div>
          <div className="rounded-2xl bg-accent-500/10 p-5 text-center ring-1 ring-accent-500/20">
            <div className="text-3xl font-extrabold text-accent-700">{fmt(extraMonthlyRevenue)}</div>
            <div className="mt-1 text-sm text-gray-600">{da ? 'mere om måneden' : 'more a month'}</div>
          </div>
          <div className="rounded-2xl bg-primary-50 p-5 text-center">
            <div className="text-3xl font-extrabold text-primary-800">{fmt(extraYearlyRevenue)}</div>
            <div className="mt-1 text-sm text-gray-600">{da ? 'mere om året' : 'more a year'}</div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
          {da
            ? 'Et omtrentligt overslag baseret på tættere ruter, der frigiver tid til ekstra stop. Dine tal vil variere — men pointen er enkel: mindre kørsel betyder flere opgaver.'
            : 'A rough projection based on tighter rounds freeing up time for extra stops. Your numbers will vary — but the point is simple: less driving means more cleaning.'}
        </p>
      </div>
    </div>
  )
}
