import { redirect } from 'next/navigation'

export default async function InsightsIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params
  redirect(`/${company}/dashboard`)
}
