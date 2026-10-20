'use client'

import { Chip, formatDate } from './ui'

export default function PlanChip({ plan, hasStripeSubscription, expiresAt, suspendedAt }: {
  plan: string
  hasStripeSubscription: boolean
  expiresAt: string | null
  suspendedAt: string | null
}) {
  if (suspendedAt) return <Chip className="bg-red-50 text-red-700 ring-red-200">On hold</Chip>
  if (plan !== 'pro') return <Chip className="bg-gray-50 text-gray-600 ring-gray-200">Solo</Chip>
  if (hasStripeSubscription) return <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200">Company · paid</Chip>
  if (expiresAt) return <Chip className="bg-sky-50 text-sky-700 ring-sky-200" title={`Ends ${formatDate(expiresAt)}`}>Company · trial</Chip>
  return <Chip className="bg-indigo-50 text-indigo-700 ring-indigo-200">Company · free</Chip>
}
