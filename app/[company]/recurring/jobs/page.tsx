import { redirect } from 'next/navigation'

/** Legacy /recurring/jobs → /recurring/subscriptions */
export default async function LegacyRecurringJobsRedirect({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  const { company } = await params
  redirect(`/${company}/recurring/subscriptions`)
}
