import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vevago - Client Management for Service Companies',
  description: 'Streamline your service business with Vevago. Manage clients, jobs, and recurring tasks all in one place.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}





