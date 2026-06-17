/** Shared formatting helpers — safe for client and server. */

export function formatArticleDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function readingTimeLabel(minutes: number): string {
  return `${minutes} min read`
}
