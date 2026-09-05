import { redirect } from 'next/navigation'

/** Recurring defaults to Subscriptions. */
export default async function RecurringIndexPage({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  const { company } = await params
  redirect(`/${company}/recurring/subscriptions`)
}
