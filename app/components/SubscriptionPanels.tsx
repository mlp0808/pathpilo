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

interface SchedulePanelProps extends Omit<ScheduleState, 'startingDate'> {
  /** Anchor for forecasts: today when ASAP, else custom picked date. */
  effectiveStartingDate: string
  /** First visit YYYY-MM-DD (shown in preview; sent to API when ASAP). */
  firstVisitYmd: string
  startAsap: boolean
  onStartAsapChange: (v: boolean) => void
  customStartingDate: string
  onCustomStartingDateChange: (v: string) => void
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
  effectiveStartingDate,
  firstVisitYmd,
  startAsap, onStartAsapChange,
  customStartingDate, onCustomStartingDateChange,
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

  const btnSeg = (active: boolean) =>
    `flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
      active
        ? 'bg-primary-800 text-white shadow-sm'
        : 'text-gray-600 hover:bg-gray-100'
    }`

  const btnChoice = (active: boolean) =>
    `min-h-[2.25rem] py-2 px-1 rounded-md text-xs font-medium transition-colors ${
      active
        ? 'bg-primary-800 text-white shadow-sm'
        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
    }`

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('app.subscription.schedule.recurrenceType')}</label>
        <div className="flex p-0.5 gap-0.5 rounded-lg border border-gray-200 bg-white">
          {(['weekly', 'monthly'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onCustomIntervalChange('')
                onRecurrenceTypeChange(type)
              }}
              className={btnSeg(recurrenceType === type)}
            >
              {type === 'weekly' ? t('app.subscription.schedule.weekly') : t('app.subscription.schedule.monthly')}
            </button>
          ))}
        </div>
      </div>

      {recurrenceType === 'weekly' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('app.subscription.schedule.dayOfWeek')}</label>
            <div className="grid grid-cols-7 gap-1">
              {weekDayShort.map((name, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onDayOfWeekChange(idx)}
                  className={btnChoice(dayOfWeek === idx)}
                >
                  {name.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('app.subscription.schedule.repeatEvery')}</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onIntervalWeeksChange(n); onCustomIntervalChange('') }}
                  className={btnChoice(intervalWeeks === n && !customInterval)}
                >
                  {n === 1 ? t('app.subscription.schedule.weeklyShort') : t('app.subscription.schedule.nWeeks').replace('{{n}}', String(n))}
                </button>
              ))}
              {[4, 6].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onIntervalWeeksChange(n); onCustomIntervalChange('') }}
                  className={btnChoice(intervalWeeks === n && !customInterval)}
                >
                  {t('app.subscription.schedule.nWeeks').replace('{{n}}', String(n))}
                </button>
              ))}
              <div
                className={`min-w-0 flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors ${
                  customInterval ? 'border-primary-800 bg-primary-800' : 'border-gray-200 bg-white'
                }`}
              >
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
                  className={`min-w-0 w-full py-1.5 text-xs font-medium bg-transparent focus:outline-none text-center ${
                    customInterval ? 'text-white placeholder:text-white/60' : 'text-gray-500'
                  }`}
                />
                {customInterval ? (
                  <span className="text-[10px] text-white/80 shrink-0 pr-0.5">
                    {parseInt(customInterval, 10) > 1 ? t('app.subscription.schedule.wks') : t('app.subscription.schedule.wk')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

      {recurrenceType === 'monthly' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('app.subscription.schedule.dayOfMonth')}</label>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => onDayOfMonthChange(day)}
                  className={btnChoice(dayOfMonth === day)}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {t('app.subscription.schedule.dayOfMonthHelp')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('app.subscription.schedule.repeatEveryNMonthsLabel', 'Repeat every')}
            </label>
            <div className="flex items-center gap-2 max-w-[220px]">
              <input
                type="number"
                min={1}
                max={24}
                value={intervalMonths}
                onChange={e => {
                  const raw = e.target.value
                  if (raw === '') {
                    onIntervalMonthsChange(1)
                    return
                  }
                  const n = parseInt(raw, 10)
                  if (!Number.isFinite(n)) return
                  onIntervalMonthsChange(Math.min(24, Math.max(1, n)))
                }}
                className="w-20 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-800/25"
              />
              <span className="text-xs text-gray-500">
                {intervalMonths === 1
                  ? t('app.subscription.schedule.month', 'month')
                  : t('app.subscription.schedule.months', 'months')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {t(
                'app.subscription.schedule.repeatEveryNMonthsHelp',
                'Enter how many months between visits. 1 = every month, 2 = every other month, 3 = quarterly, etc.'
              )}
            </p>
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('app.subscription.schedule.startingDate')}</label>
        <div className="flex p-0.5 gap-0.5 rounded-lg border border-gray-200 bg-white mb-2">
          <button
            type="button"
            onClick={() => onStartAsapChange(true)}
            className={btnSeg(startAsap)}
          >
            {t('app.subscription.schedule.startAsap', 'As soon as possible')}
          </button>
          <button
            type="button"
            onClick={() => onStartAsapChange(false)}
            className={btnSeg(!startAsap)}
          >
            {t('app.subscription.schedule.startPickDate', 'Pick a date')}
          </button>
        </div>
        {!startAsap && (
          <input
            type="date"
            value={customStartingDate}
            onChange={e => onCustomStartingDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-primary-400/30 focus:border-primary-400"
          />
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          {startAsap
            ? t('app.subscription.schedule.startAsapHelp', 'The first visit is the next matching day on or after today.')
            : t('app.subscription.schedule.startingDateHelp')}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">{t('app.subscription.schedule.schedulePreview')}</div>
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-gray-900">
            {recurrenceType === 'weekly' ? weeklyPreview : monthlyPreview}
          </div>
          {firstVisitYmd ? (
            <div className="text-xs text-gray-600 space-y-0.5">
              <div className="text-[11px] font-medium text-gray-700">
                {t('app.subscription.schedule.firstVisitLabel', 'First visit')}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-primary-600 inline-block flex-shrink-0" />
                <span>
                  {new Date(firstVisitYmd + 'T12:00:00').toLocaleDateString(dateLocale, {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">{t('app.subscription.schedule.chooseStartingDate')}</div>
          )}
          {hasStats && (
            <div className="mt-2 pt-2 border-t border-gray-200/80 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span><span className="font-medium text-gray-800">{fmtMoney(pricePerVisit, countryCode)}</span> {t('app.subscription.schedule.perVisitStat')}</span>
              <span><span className="font-medium text-gray-800">{durationPerVisit} {t('app.subscription.schedule.minPerVisit')}</span></span>
              <span><span className="font-medium text-gray-800">~{visitsPerYear}×</span> {t('app.subscription.schedule.perYearStat')}</span>
              <span><span className="font-medium text-gray-800">{fmtMoney(revenuePerYear, countryCode)}</span> {t('app.subscription.schedule.annualRevenue')}</span>
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
