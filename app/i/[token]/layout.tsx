import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Invoice',
  description: 'View and pay your invoice securely.',
  robots: { index: false, follow: false },
}

export default function PublicInvoiceSegmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
