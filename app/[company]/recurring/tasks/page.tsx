import { redirect } from 'next/navigation'

/** Legacy /recurring/tasks → /recurring/subscriptions */
export default async function LegacyTasksRedirect({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  const { company } = await params
  redirect(`/${company}/recurring/subscriptions`)
}
