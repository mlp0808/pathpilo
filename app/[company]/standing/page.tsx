import { redirect } from 'next/navigation'

/** Legacy /standing → /recurring/subscriptions */
export default async function LegacyStandingRedirect({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  const { company } = await params
  redirect(`/${company}/recurring/subscriptions`)
}
