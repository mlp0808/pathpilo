import AppLayout from '../../components/AppLayout'
import DemoSettingsGate from '../../components/DemoSettingsGate'

export default function CompanySettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <DemoSettingsGate>{children}</DemoSettingsGate>
    </AppLayout>
  )
}
