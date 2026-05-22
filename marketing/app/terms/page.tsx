import type { Metadata } from 'next'
import { TermsContent } from './TermsContent'

export const metadata: Metadata = {
  title: 'Terms of Service - PathPilo',
  description:
    'PathPilo Terms of Service. The agreement between you and PathPilo when you use the PathPilo service management platform.',
}

export default function TermsPage() {
  return <TermsContent locale="en" />
}
