'use client'

import AppLayout from '../components/AppLayout'
import DemoSettingsGate from '../components/DemoSettingsGate'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppLayout>
      <DemoSettingsGate>{children}</DemoSettingsGate>
    </AppLayout>
  )
}
