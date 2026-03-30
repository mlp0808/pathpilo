'use client'

/**
 * Shared visual panels used by both CreateSubscription and SubscriptionSlideout.
 * Keeping the UI in one place means design changes propagate everywhere automatically.
 */

import { CheckCircleIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import {
  ordinal,
  fmtDate,
  fmtMoney,
  ScheduleState,
} from '../utils/subscriptionHelpers'
import { useAppI18n } from './I18nProvider'

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
  pricePerVisit?: number
  durationPerVisit?: number
  visitsPerYear?: number
  revenuePerYear?: number
  countryCode?: string
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
  countryCode = 'DK',
}: SchedulePanelProps) {
  const { t, locale } = useAppI18n()
  const hasStats = pricePerVisit > 0 || durationPerVisit > 0
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-GB'
  const weekDayNames = Array.from({ length: 7 }).map((_, idx) =>
    new Date(2024, 0, 7 + idx).toLocaleDateString(dateLocale, { weekday: 'long' })
  )
  const weekDayShort = Array.from({ length: 7 }).map((_, idx) =>
    new Date(2024, 0, 7 + idx).toLocaleDateString(dateLocale, { weekday: 'short' })
  )

  const weeklyPreview =
    intervalWeeks === 1
      ? t('app.subscription.schedule.previewWeeklyOnDay').replace('{{day}}', weekDayNames[dayOfWeek])
      : t('app.subscription.schedule.previewEveryNWeeksOnDay')
          .replace('{{n}}', String(intervalWeeks))
          .replace('{{day}}', weekDayNames[dayOfWeek])

  const monthlyPreview =
    intervalMonths === 1
      ? t('app.subscription.schedule.previewMonthlyOrdinal').replace('{{ordinal}}', ordinal(dayOfMonth))
      : t('app.subscription.schedule.previewEveryNMonthsOrdinal')
          .replace('{{n}}', String(intervalMonths))
          .replace('{{ordinal}}', ordinal(dayOfMonth))

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.startingDate')}</label>
        <input
          type="date"
          value={startingDate}
          onChange={e => onStartingDateChange(e.target.value)}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
        />
        <p className="text-xs text-gray-400 mt-1.5">
          {t('app.subscription.schedule.startingDateHelp')}
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.recurrenceType')}</label>
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
              {type === 'weekly' ? t('app.subscription.schedule.weekly') : t('app.subscription.schedule.monthly')}
            </button>
          ))}
        </div>
      </div>

      {recurrenceType === 'weekly' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.dayOfWeek')}</label>
            <div className="grid grid-cols-7 gap-1">
              {weekDayShort.map((name, idx) => (
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
            <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.repeatEvery')}</label>
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
                  {n === 1 ? t('app.subscription.schedule.weeklyShort') : t('app.subscription.schedule.nWeeks').replace('{{n}}', String(n))}
                </button>
              ))}
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
                  placeholder={t('app.subscription.schedule.customPlaceholder')}
                  className={`w-full py-2 text-sm font-semibold bg-transparent focus:outline-none text-center ${
                    customInterval ? 'text-accent-600' : 'text-gray-500'
                  }`}
                />
                {customInterval && (
                  <span className="text-xs text-accent-600 font-medium whitespace-nowrap">
                    {parseInt(customInterval) > 1 ? t('app.subscription.schedule.wks') : t('app.subscription.schedule.wk')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {recurrenceType === 'monthly' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.dayOfMonth')}</label>
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
              {t('app.subscription.schedule.dayOfMonthHelp')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.schedule.repeatEvery')}</label>
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
                  {n === 1 ? t('app.subscription.schedule.monthly') : n === 2 ? t('app.subscription.schedule.every2mo') : t('app.subscription.schedule.quarterly')}
                </button>
              ))}
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
                  placeholder={t('app.subscription.schedule.customMonthsPlaceholder')}
                  className={`w-full py-2.5 text-sm font-semibold bg-transparent focus:outline-none ${
                    customInterval ? 'text-accent-600' : 'text-gray-400'
                  }`}
                />
                {customInterval && (
                  <span className="text-xs text-accent-600 font-medium whitespace-nowrap">
                    {parseInt(customInterval) > 1 ? t('app.subscription.schedule.months') : t('app.subscription.schedule.month')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-gradient-to-br from-accent-50/60 to-white rounded-2xl p-5 border-2 border-accent-200/40 shadow-sm">
        <div className="text-xs font-bold text-accent-600 uppercase tracking-wider mb-3">{t('app.subscription.schedule.schedulePreview')}</div>
        <div className="space-y-2">
          <div className="text-base font-bold text-primary-800">
            {recurrenceType === 'weekly' ? weeklyPreview : monthlyPreview}
          </div>
          {startingDate ? (
            <div className="text-sm text-primary-600 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 inline-block" />
              {t('app.subscription.schedule.starting')}{' '}
              {new Date(startingDate).toLocaleDateString(dateLocale, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">{t('app.subscription.schedule.chooseStartingDate')}</div>
          )}
          {hasStats && (
            <div className="mt-3 pt-3 border-t border-accent-200/40 flex flex-wrap gap-4 text-xs text-gray-500">
              <span><span className="font-semibold text-primary-700">{fmtMoney(pricePerVisit, countryCode)}</span> {t('app.subscription.schedule.perVisitStat')}</span>
              <span><span className="font-semibold text-primary-700">{durationPerVisit} {t('app.subscription.schedule.minPerVisit')}</span> {t('app.subscription.schedule.perVisitStat')}</span>
              <span><span className="font-semibold text-primary-700">~{visitsPerYear}×</span> {t('app.subscription.schedule.perYearStat')}</span>
              <span><span className="font-semibold text-primary-700">{fmtMoney(revenuePerYear, countryCode)}</span> {t('app.subscription.schedule.annualRevenue')}</span>
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
  countryCode?: string
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
  countryCode = 'DK',
}: ForecastPanelProps) {
  const { t, locale } = useAppI18n()
  const priceChanged = Math.abs(pricePerVisit - originalPricePerVisit) > 0.01
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-GB'
  const weekDayNames = Array.from({ length: 7 }).map((_, idx) =>
    new Date(2024, 0, 7 + idx).toLocaleDateString(dateLocale, { weekday: 'long' })
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('app.subscription.forecast.perVisit'), value: fmtMoney(pricePerVisit, countryCode) },
          { label: t('app.subscription.forecast.duration'), value: `${durationPerVisit} ${t('app.subscription.schedule.minPerVisit')}` },
          { label: t('app.subscription.forecast.visitsPerYear'), value: `~${visitsPerYear}` },
          { label: t('app.subscription.forecast.annualValue'), value: fmtMoney(revenuePerYear, countryCode) },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 text-center shadow-sm">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className="text-base font-bold text-primary-800">{stat.value}</div>
          </div>
        ))}
      </div>

      {priceChanged && originalPricePerVisit > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚡</span>
          <div>
            <div className="font-semibold text-amber-800">{t('app.subscription.forecast.priceChangeTitle')}</div>
            <div className="text-amber-700 text-xs mt-0.5">
              {t('app.subscription.forecast.priceChangeBody')
                .replace('{{from}}', fmtMoney(originalPricePerVisit, countryCode))
                .replace('{{to}}', fmtMoney(pricePerVisit, countryCode))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {pastJobs.length > 0 && (
          <>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-1 pb-2">
              {t('app.subscription.forecast.pastJobs').replace('{{n}}', String(pastJobs.length))}
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
                    {job.total_price ? fmtMoney(job.total_price, countryCode) : '—'}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full flex-shrink-0">
                    {t('app.subscription.forecast.done')}
                  </span>
                </div>
              )
            })}
          </>
        )}

        {forecastDates.length > 0 && (
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-primary-200" />
            <span className="text-xs font-bold text-primary-500 px-2 py-0.5 bg-primary-50 border border-primary-200 rounded-full whitespace-nowrap">
              {pastJobs.length > 0 ? t('app.subscription.forecast.dividerToday') : t('app.subscription.forecast.dividerUpcoming')}
            </span>
            <div className="flex-1 h-px bg-primary-200" />
          </div>
        )}

        {forecastDates.length > 0 ? (
          <>
            <div className="text-xs font-bold text-primary-700 uppercase tracking-wider px-1 pt-1 pb-2">
              {t('app.subscription.forecast.nextProjected').replace('{{n}}', String(forecastDates.length))}
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
                  <div className={`w-10 text-center flex-shrink-0 ${isNext ? 'text-accent-600' : 'text-gray-400'}`}>
                    <div className="text-[10px] font-bold uppercase">
                      {date.toLocaleDateString(dateLocale, { month: 'short' })}
                    </div>
                    <div className="text-lg font-extrabold leading-none">{date.getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold truncate ${isNext ? 'text-primary-700' : 'text-primary-600'}`}>
                      {subscriptionTitle || t('app.subscription.forecast.subscriptionJob')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {weekDayNames[date.getDay()]}
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
                      {fmtMoney(pricePerVisit, countryCode)}
                    </div>
                    {isNext && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-accent-500 text-white rounded-full">
                        {t('app.subscription.forecast.next')}
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
              {t('app.subscription.forecast.emptyHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
