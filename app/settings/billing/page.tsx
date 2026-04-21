import { CreditCardIcon, ReceiptPercentIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

export default function BillingSettingsPage() {
  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            PathPilo subscription
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Plan &amp; billing</h1>
          <p className="text-gray-600 mt-2 text-sm">
            Manage the plan you pay PathPilo for, your payment method, and the receipts PathPilo
            issues to you. This is separate from the invoices <em>you</em> send to your own clients
            (those live under <strong>Settings → Invoice options</strong>).
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-4 mb-6 text-sm text-blue-900">
          <p className="font-semibold">You&apos;re currently on the free trial.</p>
          <p className="mt-1 text-blue-800/90">
            We&apos;ll let you know in good time before the trial ends, and nothing will be charged
            until you pick a plan and add a payment method.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <PlaceholderCard
            icon={<CreditCardIcon className="w-5 h-5" />}
            title="Current plan"
            body="No paid plan yet."
          />
          <PlaceholderCard
            icon={<ReceiptPercentIcon className="w-5 h-5" />}
            title="Payment method"
            body="No card on file."
          />
          <PlaceholderCard
            icon={<ArrowDownTrayIcon className="w-5 h-5" />}
            title="Receipts"
            body="Receipts from PathPilo will appear here."
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-6 text-center text-gray-500 text-sm">
          Plan selection, payment method and receipt downloads are coming soon.
        </div>
      </div>
    </div>
  )
}

function PlaceholderCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-gray-700">
        <span className="text-gray-500">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500 leading-relaxed">{body}</p>
    </div>
  )
}
