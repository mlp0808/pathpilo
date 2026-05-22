import type { Metadata } from 'next'
import { PrivacyContent } from './PrivacyContent'

export const metadata: Metadata = {
  title: 'Privacy Policy - PathPilo',
  description:
    'How PathPilo collects, uses and protects your data. Our Privacy Policy explains your rights and our responsibilities under GDPR.',
}

export default function PrivacyPage() {
  return <PrivacyContent locale="en" />
}
