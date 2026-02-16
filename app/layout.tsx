import type { Metadata } from 'next'
import './globals.css'
import { ClientI18nProvider } from './components/I18nProvider'

export const metadata: Metadata = {
  title: 'PathPilo - Client Management for Service Companies',
  description: 'Streamline your service business with PathPilo. Manage clients, jobs, and recurring tasks all in one place.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientI18nProvider>
          {children}
        </ClientI18nProvider>
      </body>
    </html>
  )
}





