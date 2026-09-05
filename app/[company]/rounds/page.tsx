import { redirect } from 'next/navigation'

/** Legacy /rounds → /recurring/rounds */
export default async function LegacyRoundsRedirect({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  const { company } = await params
  redirect(`/${company}/recurring/rounds`)
}
