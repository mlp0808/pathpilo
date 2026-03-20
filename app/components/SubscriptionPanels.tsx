'use client'

/**
 * Shared visual panels used by both CreateSubscription and SubscriptionSlideout.
 * Keeping the UI in one place means design changes propagate everywhere automatically.
 */

import { CheckCircleIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import {
  DAY_NAMES,
  ordinal,
  fmtDate,
  fmtMoney,
  SelectedService,
  ScheduleState,
} from '../utils/subscriptionHelpers'

// ─────────────────────────────────────────────────────────────
//  SchedulePanel
// ─────────────────────────────────────────────────────────────

interface SchedulePanelProps extends ScheduleState {
  onStartingDateChange: (v: string) => void
  onRecurrenceTypeChange: (v: 'weekly' | 'monthly') => void
  onDayOfWeekChange: (v: number) => void
  onIntervalWeeksChange: (v: number) => void
  onCustomIntervalChange: (v: string) => void
  onDayOfMonthChange: (v: number) => void
  onIntervalMonthsChange: (v: number) => void
  // summary stats (optional — only shown when services are selected)
  pricePerVisit?: number
  durationPerVisit?: number
  visitsPerYear?: number
  revenuePerYear?: number
}

export function SchedulePanel({
  startingDate, onStartingDateChange,
  recurrenceType, onRecurrenceTypeChange,
  dayOfWeek, onDayOfWeekChange,
  intervalWeeks, onIntervalWeeksChange,
  customInterval, onCustomIntervalChange,
  dayOfMonth, onDayOfMonthChange,
  intervalMonths, onIntervalMonthsChange,
  pricePerVisit = 0, durationPerVisit = 0, visitsPerYear = 0, revenuePerYear = 0,
}: SchedulePanelProps) {
  const hasStats = pricePerVisit > 0 || durationPerVisit > 0

  return (
    <div className="space-y-5">
      {/* Starting date */}
      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-2">Starting date *</label>
        <input
          type="date"
          value={startingDate}
          onChange={e => onStartingDateChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
        />
        <p className="text-xs text-gray-400 mt-1.5">
          Jobs are generated from this date onward based on the schedule below.
        </p>
      </div>

      {/* Recurrence type toggle */}
      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-2">Recurrence type</label>
        <div className="flex gap-2">
          {(['weekly', 'monthly'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => onRecurrenceTypeChange(type)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all capitalize ${
                recurrenceType === type
                  ? 'bg-primary-500 text-white border-primary-500 shadow-md shadow-primary-500/20'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              {type === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* ── WEEKLY controls ── */}
      {recurrenceType === 'weekly' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">Day of week</label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onDayOfWeekChange(idx)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    dayOfWeek === idx
                      ? 'bg-accent-500 text-white shadow-md shadow-accent-500/20'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-accent-300 hover:text-accent-600'
                  }`}
                >
                  {name.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">Repeat every</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 6].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onIntervalWeeksChange(n); onCustomIntervalChange('') }}
                  className={`py-2.5 text-sm font-semibold rounded-xl border transition-all ${
                    intervalWeeks === n && !customInterval
                      ? 'bg-accent-500 text-white border-accent-500 shadow-md shadow-accent-500/20'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-accent-300 hover:text-accent-600'
                  }`}
                >
                  {n === 1 ? 'Weekly' : `${n} weeks`}
                </button>
              ))}
              {/* Custom input in the 6th slot */}
              <div className={`flex items-center gap-1.5 rounded-xl border px-3 transition-all ${
                customInterval
                  ? 'border-accent-500 bg-accent-50 shadow-md shadow-accent-500/20'
                  : 'border-gray-200 bg-white hover:border-accent-300'
              }`}>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={customInterval}
                  onChange={e => {
                    const v = e.target.value
                    onCustomIntervalChange(v)
                    const num = parseInt(v)
                    if (!isNaN(num) && num > 0) onIntervalWeeksChange(num)
                  }}
                  placeholder="Custom"
                  className={`w-full py-2 text-sm font-semibold bg-transparent focus:outline-none text-center ${
                    customInterval ? 'text-accent-600' : 'text-gray-500'
                  }`}
                />
                {customInterval && (
                  <span className="text-xs text-accent-600 font-medium whitespace-nowrap">
                    wk{parseInt(customInterval) > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MONTHLY controls ── */}
      {recurrenceType === 'monthly' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">Day of month</label>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => onDayOfMonthChange(day)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    dayOfMonth === day
                      ? 'bg-accent-500 text-white shadow-md shadow-accent-500/20'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-accent-300 hover:text-accent-600'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Days 29–31 are clamped to the last day of shorter months.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">Repeat every</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onIntervalMonthsChange(n); onCustomIntervalChange('') }}
                  className={`py-2.5 text-sm font-semibold rounded-xl border transition-all ${
                    intervalMonths === n && !customInterval
                      ? 'bg-accent-500 text-white border-accent-500 shadow-md shadow-accent-500/20'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-accent-300 hover:text-accent-600'
                  }`}
                >
                  {n === 1 ? 'Monthly' : n === 2 ? 'Every 2 mo.' : 'Quarterly'}
                </button>
              ))}
              {/* Custom — full width */}
              <div className={`col-span-3 flex items-center gap-1 rounded-xl border px-3 transition-all ${
                customInterval
                  ? 'border-accent-500 bg-accent-50'
                  : 'border-gray-200 bg-white hover:border-accent-300'
              }`}>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={customInterval}
                  onChange={e => {
                    const v = e.target.value
                    onCustomIntervalChange(v)
                    const num = parseInt(v)
                    if (!isNaN(num) && num > 0) onIntervalMonthsChange(num)
                  }}
                  placeholder="Custom — type any number of months"
                  className={`w-full py-2.5 text-sm font-semibold bg-transparent focus:outline-none ${
                    customInterval ? 'text-accent-600' : 'text-gray-400'
                  }`}
                />
                {customInterval && (
                  <span className="text-xs text-accent-600 font-medium whitespace-nowrap">
                    month{parseInt(customInterval) > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Preview card */}
      <div className="bg-gradient-to-br from-accent-50/60 to-white rounded-2xl p-5 border-2 border-accent-200/40 shadow-sm">
        <div className="text-xs font-bold text-accent-600 uppercase tracking-wider mb-3">Schedule preview</div>
        <div className="space-y-2">
          <div className="text-base font-bold text-primary-800">
            {recurrenceType === 'weekly'
              ? `Every ${intervalWeeks > 1 ? `${intervalWeeks} weeks` : 'week'} on ${DAY_NAMES[dayOfWeek]}`
              : `Every ${intervalMonths > 1 ? `${intervalMonths} months` : 'month'} on the ${ordinal(dayOfMonth)}`
            }
          </div>
          {startingDate ? (
            <div className="text-sm text-primary-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 inline-block" />
              Starting{' '}
              {new Date(startingDate).toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">Choose a starting date above</div>
          )}
          {hasStats && (
            <div className="mt-3 pt-3 border-t border-accent-200/40 flex flex-wrap gap-4 text-xs text-gray-500">
              <span><span className="font-semibold text-primary-700">{fmtMoney(pricePerVisit)}</span> per visit</span>
              <span><span className="font-semibold text-primary-700">{durationPerVisit} min</span> per visit</span>
              <span><span className="font-semibold text-primary-700">~{visitsPerYear}×</span> per year</span>
              <span><span className="font-semibold text-primary-700">{fmtMoney(revenuePerYear)}</span> annual revenue</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  ForecastPanel
// ─────────────────────────────────────────────────────────────

interface ForecastPanelProps {
  forecastDates: Date[]
  pastJobs: any[]
  pricePerVisit: number
  durationPerVisit: number
  visitsPerYear: number
  revenuePerYear: number
  originalPricePerVisit: number
  subscriptionTitle: string
  selectedUser: { first_name: string; last_name: string } | null
  timeFrom: string
  timeTo: string
}

export function ForecastPanel({
  forecastDates,
  pastJobs,
  pricePerVisit,
  durationPerVisit,
  visitsPerYear,
  revenuePerYear,
  originalPricePerVisit,
  subscriptionTitle,
  selectedUser,
  timeFrom,
  timeTo,
}: ForecastPanelProps) {
  const priceChanged = Math.abs(pricePerVisit - originalPricePerVisit) > 0.01

  return (
    <div className="space-y-5">
      {/* Stats banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Per visit', value: fmtMoney(pricePerVisit) },
          { label: 'Duration', value: `${durationPerVisit} min` },
          { label: 'Visits / year', value: `~${visitsPerYear}` },
          { label: 'Annual value', value: fmtMoney(revenuePerYear) },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 text-center shadow-sm">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className="text-base font-bold text-primary-800">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Price change notice */}
      {priceChanged && originalPricePerVisit > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚡</span>
          <div>
            <div className="font-semibold text-amber-800">Price change detected</div>
            <div className="text-amber-700 text-xs mt-0.5">
              From <strong>{fmtMoney(originalPricePerVisit)}</strong> →{' '}
              <strong>{fmtMoney(pricePerVisit)}</strong> per visit.
              All future jobs will reflect the new price. Past completed jobs are unchanged.
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-1">
        {/* Past jobs */}
        {pastJobs.length > 0 && (
          <>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-1 pb-2">
              Past jobs (last {pastJobs.length})
            </div>
            {pastJobs.map((job: any, i: number) => {
              const d = new Date(job.scheduled_date)
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl opacity-60">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <CheckCircleIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-500 truncate">{job.title || subscriptionTitle}</div>
                    <div className="text-xs text-gray-400">{fmtDate(d)}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-400 flex-shrink-0">
                    {job.total_price ? fmtMoney(job.total_price) : '—'}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full flex-shrink-0">
                    Done
                  </span>
                </div>
              )
            })}
          </>
        )}

        {/* Today divider */}
        {forecastDates.length > 0 && (
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-primary-200" />
            <span className="text-xs font-bold text-primary-500 px-2 py-0.5 bg-primary-50 border border-primary-200 rounded-full whitespace-nowrap">
              {pastJobs.length > 0 ? 'Today – changes take effect from here' : 'Upcoming jobs'}
            </span>
            <div className="flex-1 h-px bg-primary-200" />
          </div>
        )}

        {/* Future projected */}
        {forecastDates.length > 0 ? (
          <>
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider px-1 pt-1 pb-2">
              Next {forecastDates.length} projected jobs
            </div>
            {forecastDates.map((date, i) => {
              const isNext = i === 0
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    isNext
                      ? 'bg-gradient-to-r from-accent-50 to-white border-accent-300 shadow-sm'
                      : 'bg-white border-gray-100 hover:border-accent-200 hover:bg-accent-50/30'
                  }`}
                >
                  {/* Date block */}
                  <div className={`w-10 text-center flex-shrink-0 ${isNext ? 'text-accent-600' : 'text-gray-400'}`}>
                    <div className="text-[10px] font-bold uppercase">
                      {date.toLocaleDateString('en-GB', { month: 'short' })}
                    </div>
                    <div className="text-lg font-extrabold leading-none">{date.getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isNext ? 'text-primary-700' : 'text-primary-600'}`}>
                      {subscriptionTitle || 'Subscription job'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {DAY_NAMES[date.getDay()]}
                      {timeFrom ? ` · ${timeFrom}${timeTo ? ` – ${timeTo}` : ''}` : ''}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {selectedUser && (
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {(selectedUser.first_name[0] || '') + (selectedUser.last_name[0] || '')}
                      </span>
                    )}
                    <div className={`text-sm font-bold ${isNext ? 'text-accent-600' : 'text-primary-700'}`}>
                      {fmtMoney(pricePerVisit)}
                    </div>
                    {isNext && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-accent-500 text-white rounded-full">
                        Next
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <CalendarDaysIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              Set a starting date in the Schedule tab to see the forecast
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
