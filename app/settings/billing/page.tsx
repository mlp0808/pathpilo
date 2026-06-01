import { SettingsHeader, SettingsSection, SettingsRow } from '../../components/settings/SettingsUI'

export default function BillingSettingsPage() {
  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title="Plan & billing"
          description="Manage the plan you pay PathPilo for, your payment method, and the receipts PathPilo issues to you. This is separate from the invoices you send to your own clients, which live under Settings → Invoices."
        />

        <SettingsSection title="Plan">
          <SettingsRow
            title="Current plan"
            description="You're currently on the free trial. Nothing is charged until you pick a plan and add a payment method."
            control={<span className="text-sm text-gray-600">Free trial</span>}
          />
          <SettingsRow
            title="Payment method"
            description="The card PathPilo charges for your subscription."
            control={<span className="text-sm text-gray-500">No card on file</span>}
          />
          <SettingsRow
            title="Receipts"
            description="Receipts PathPilo issues to you will appear here."
            control={<span className="text-sm text-gray-500">None yet</span>}
          />
        </SettingsSection>

        <p className="text-sm text-gray-500">
          Plan selection, payment method and receipt downloads are coming soon.
        </p>
      </div>
    </div>
  )
}
