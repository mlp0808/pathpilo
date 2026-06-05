/** Human-readable countdown until an automated message sends. */
export function formatAutomationEta(ms: number, soonLabel: string): string {
  if (ms <= 0) return soonLabel
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return sec === 0 && ms > 0 ? '1s' : `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) {
    const remSec = sec % 60
    return remSec === 0 ? `${min} min` : `${min}m ${remSec}s`
  }
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h ${min % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function automationChannelFromKey(key: string): 'email' | 'sms' {
  return key.startsWith('sms_') ? 'sms' : 'email'
}

export type AutomationLabelKey =
  | 'app.automation.bookingConfirmation'
  | 'app.automation.jobReminder'
  | 'app.automation.invoiceDueReminder'
  | 'app.automation.smsOnTheWay'
  | 'app.automation.smsDayBefore'
  | 'app.automation.generic'

export function automationLabelKey(key: string): AutomationLabelKey {
  switch (key) {
    case 'email_job_created':
      return 'app.automation.bookingConfirmation'
    case 'email_job_reminder':
      return 'app.automation.jobReminder'
    case 'email_invoice_due_reminder':
      return 'app.automation.invoiceDueReminder'
    case 'sms_on_the_way':
      return 'app.automation.smsOnTheWay'
    case 'sms_day_before':
      return 'app.automation.smsDayBefore'
    default:
      return 'app.automation.generic'
  }
}
