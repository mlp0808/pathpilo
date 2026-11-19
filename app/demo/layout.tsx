import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Try the PathPilo demo',
  description: 'Explore PathPilo with a year of realistic data from a solo window cleaning round.',
  robots: { index: false, follow: false },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
