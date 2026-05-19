/**
 * Projected calendar rows use stable string ids: subscription-{recurringJobId}-{occurrence}.
 * Occurrence indices match POST /subscriptions/:id/occurrences/:n/materialize (1-based).
 */

const SUBSCRIPTION_VIRTUAL_JOB_ID_RE = /^subscription-(\d+)-(\d+)$/;

function parseSubscriptionVirtualJobId(raw) {
  const m = String(raw || '').match(SUBSCRIPTION_VIRTUAL_JOB_ID_RE);
  if (!m) return null;
  const recurringJobId = parseInt(m[1], 10);
  const occurrence = parseInt(m[2], 10);
  if (!Number.isFinite(recurringJobId) || recurringJobId <= 0) return null;
  if (!Number.isFinite(occurrence) || occurrence <= 0) return null;
  return { recurringJobId, occurrence };
}

function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateFirstOccurrence(startingDateStr, dayOfWeek) {
  const [year, month, day] = String(startingDateStr).split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const startDay = startDate.getDay();
  const daysUntilTargetDay = (dayOfWeek - startDay + 7) % 7;
  if (daysUntilTargetDay === 0) return formatDateString(startDate);
  const first = new Date(startDate);
  first.setDate(startDate.getDate() + daysUntilTargetDay);
  return formatDateString(first);
}

function calculateFirstMonthlyOccurrence(startingDateStr, dayOfMonth) {
  const [year, month, day] = String(startingDateStr).split('-').map(Number);
  const startingDate = new Date(year, month - 1, day);
  const targetDate = new Date(startingDate.getFullYear(), startingDate.getMonth(), dayOfMonth);

  if (targetDate <= startingDate) {
    targetDate.setMonth(targetDate.getMonth() + 1);
  }

  if (targetDate.getDate() !== dayOfMonth) {
    targetDate.setDate(1);
    targetDate.setMonth(targetDate.getMonth() + 1);
  }

  return formatDateString(targetDate);
}

/**
 * Canonical calendar date for a subscription occurrence index (aligned with subscriptions materialize route).
 * @returns {string|null} YYYY-MM-DD or null if subscription cannot be scheduled
 */
function computeSubscriptionOccurrenceDate(sub, occurrence) {
  if (!sub || !Number.isFinite(occurrence) || occurrence < 1) return null;

  let starting = sub.starting_date || sub.next_occurrence_date;
  if (!starting) return null;
  if (starting instanceof Date) starting = formatDateString(starting);
  else if (typeof starting === 'string' && starting.includes('T')) starting = starting.split('T')[0];

  let computedDate;
  if (sub.recurrence_type === 'monthly') {
    if (sub.day_of_month == null) return null;
    const firstOccStr = calculateFirstMonthlyOccurrence(starting, sub.day_of_month);
    const [fy, fm, fd] = firstOccStr.split('-').map(Number);
    const base = new Date(fy, fm - 1, fd);

    const monthsToAdd = (occurrence - 1) * (sub.interval_value || 1);
    const targetYear = base.getFullYear() + Math.floor((base.getMonth() + monthsToAdd) / 12);
    const targetMonth = (base.getMonth() + monthsToAdd) % 12;

    const tempDate = new Date(targetYear, targetMonth, sub.day_of_month);

    if (tempDate.getMonth() !== targetMonth) {
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      computedDate = formatDateString(
        new Date(targetYear, targetMonth, Math.min(sub.day_of_month, lastDayOfMonth))
      );
    } else {
      computedDate = formatDateString(tempDate);
    }
  } else if (sub.recurrence_type === 'weekly') {
    if (sub.day_of_week == null) return null;
    const firstOccStr = calculateFirstOccurrence(starting, sub.day_of_week);
    const [fy, fm, fd] = firstOccStr.split('-').map(Number);
    const base = new Date(fy, fm - 1, fd);
    const daysToAdd = (occurrence - 1) * 7 * (sub.interval_value || 1);
    base.setDate(base.getDate() + daysToAdd);
    computedDate = formatDateString(base);
  } else {
    return null;
  }

  return computedDate;
}

function subscriptionDateIsOnOrAfterPause(sub, jobDateStr) {
  if (!sub.paused_at || !jobDateStr) return false;
  const pausedStr =
    sub.paused_at instanceof Date
      ? formatDateString(sub.paused_at)
      : typeof sub.paused_at === 'string'
        ? sub.paused_at.split('T')[0]
        : String(sub.paused_at);
  return !!(pausedStr && jobDateStr >= pausedStr);
}

module.exports = {
  parseSubscriptionVirtualJobId,
  computeSubscriptionOccurrenceDate,
  formatDateString,
  subscriptionDateIsOnOrAfterPause,
};
