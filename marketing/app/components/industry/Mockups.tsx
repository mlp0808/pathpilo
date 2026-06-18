import type { VisualKey } from '../../lib/industries/types'

/**
 * Lightweight, on-brand product mockups used beside the outcome rows.
 * Pure SVG/CSS so they stay crisp on every screen with no image assets.
 */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-4 hidden rounded-[2rem] bg-gradient-to-br from-accent-500/10 to-primary-500/5 blur-md md:block" />
      <div className="relative overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-xl">
        {children}
      </div>
    </div>
  )
}

function RouteMockup() {
  // Ordered stops forming a tidy loop.
  const stops = [
    [60, 210],
    [120, 120],
    [220, 80],
    [320, 140],
    [360, 240],
    [250, 300],
  ]
  const path = stops.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  return (
    <Frame>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <span className="text-sm font-semibold text-primary-800">Today’s round</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-700">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-500" /> 42 min less driving
        </span>
      </div>
      <div className="relative bg-[#f4f7f6]">
        <svg viewBox="0 0 420 360" className="h-auto w-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#193434" strokeOpacity="0.05" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="420" height="360" fill="url(#grid)" />
          <path d={path} fill="none" stroke="#3DD57A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 12" opacity="0.5" />
          <path d={path} fill="none" stroke="#3DD57A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {stops.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="16" fill="#193434" />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Frame>
  )
}

function SmsMockup() {
  return (
    <Frame>
      <div className="bg-[#f4f7f6] p-6 sm:p-8">
        <div className="mx-auto max-w-[280px] overflow-hidden rounded-[2rem] border-4 border-primary-800 bg-white shadow-lg">
          <div className="bg-primary-800 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-white/70">Messages</p>
            <p className="text-sm font-bold text-white">Your window cleaner</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-500 px-3.5 py-2.5 text-sm text-white shadow-sm">
              Hi Sarah, just a reminder we’re cleaning your windows tomorrow morning. Please leave the side gate unlocked.
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-500 px-3.5 py-2.5 text-sm text-white shadow-sm">
              On my way now — see you in about 15 minutes!
            </div>
            <div className="max-w-[70%] rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-700 shadow-sm">
              Perfect, gate’s open. Thanks!
            </div>
          </div>
        </div>
      </div>
    </Frame>
  )
}

function InvoiceMockup() {
  return (
    <Frame>
      <div className="relative p-6 sm:p-8">
        <span className="absolute right-6 top-6 rotate-6 rounded-lg border-2 border-accent-500 px-3 py-1 text-sm font-extrabold uppercase tracking-wider text-accent-600">
          Paid
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice #1042</p>
        <p className="mt-1 text-lg font-bold text-primary-800">Sarah Thompson</p>
        <p className="text-sm text-gray-500">14 Oakfield Road</p>

        <div className="mt-5 space-y-2.5 border-y border-gray-100 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Window clean — front & back</span>
            <span className="font-semibold text-primary-800">£18.00</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Conservatory roof</span>
            <span className="font-semibold text-primary-800">£12.00</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-500">Total</span>
          <span className="text-2xl font-extrabold text-primary-800">£30.00</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {['Card', 'Bank', 'Online'].map((m) => (
            <span
              key={m}
              className="rounded-xl border border-primary-100 bg-primary-50 py-2 text-center text-xs font-semibold text-primary-800"
            >
              {m}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-accent-700">Sent automatically the moment the job was done</p>
      </div>
    </Frame>
  )
}

function BookingMockup() {
  return (
    <Frame>
      <div className="p-6 sm:p-8">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500" /> New enquiry
        </div>
        <p className="text-lg font-bold text-primary-800">Book a window clean</p>
        <div className="mt-4 space-y-3">
          {[
            { label: 'Name', value: 'James Carter' },
            { label: 'Address', value: '8 Birch Lane, postcode LS6' },
            { label: 'Service', value: 'Monthly window clean' },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{f.label}</p>
              <p className="text-sm font-medium text-primary-800">{f.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-accent-500 py-2.5 text-center text-sm font-semibold text-white shadow-sm">
          Added straight to your round
        </div>
      </div>
    </Frame>
  )
}

export default function Mockup({ visual }: { visual: VisualKey }) {
  switch (visual) {
    case 'route':
      return <RouteMockup />
    case 'sms':
      return <SmsMockup />
    case 'invoice':
      return <InvoiceMockup />
    case 'booking':
      return <BookingMockup />
    default:
      return null
  }
}
