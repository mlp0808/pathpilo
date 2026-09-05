'use client'

/**
 * Recurring section shell — subpages live in the sidebar (Tasks, Rounds).
 * Each page owns its own title and chrome.
 */

import AppLayout from '@/app/components/AppLayout'

export default function RecurringLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}
