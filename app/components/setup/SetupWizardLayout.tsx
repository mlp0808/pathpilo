'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'
import DarkAuthShell from '@/app/components/DarkAuthShell'

export const SETUP_WIZARD_STEPS = [
  { id: 1, label: 'Create company', short: 'Company' },
  { id: 2, label: 'Setup services', short: 'Services' },
  { id: 3, label: 'Add clients',    short: 'Clients'  },
  { id: 4, label: 'Choose plan',    short: 'Plan'     },
] as const

export type SetupWizardStep = 1 | 2 | 3 | 4

/** Shared field styles for forms inside the white glass panel */
export const setupFieldInputClass =
  'w-full px-4 py-3 text-sm bg-white border border-gray-200/90 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 transition-all hover:border-gray-300'
export const setupFieldLabelClass =
  'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2'
export const setupFieldSelectClass = `${setupFieldInputClass} cursor-pointer`

/* ── Desktop compact vertical steps ──────────────────────── */
function DesktopStepper({ current }: { current: SetupWizardStep }) {
  return (
    <nav aria-label="Setup progress" className="flex flex-col">
      {SETUP_WIZARD_STEPS.map((step, idx) => {
        const isActive   = step.id === current
        const isComplete = step.id < current
        const isLast     = idx === SETUP_WIZARD_STEPS.length - 1

        return (
          <div key={step.id} className="flex gap-3 items-start">
            <div className="flex flex-col items-center flex-none w-4 mt-[3px]">
              <div
                className={[
                  'rounded-full flex-none transition-all duration-300',
                  isActive   ? 'w-2.5 h-2.5 bg-accent-500 shadow-sm shadow-accent-500/70' : '',
                  isComplete ? 'w-2 h-2 bg-accent-500/50' : '',
                  !isActive && !isComplete ? 'w-2 h-2 bg-white/[0.15]' : '',
                ].join(' ')}
              />
              {!isLast && <div className="w-px flex-1 min-h-[18px] mt-1.5 bg-white/[0.08]" />}
            </div>
            <div className="pb-4">
              <span
                className={[
                  'text-[13px] leading-snug transition-colors',
                  isActive   ? 'text-white font-semibold' : '',
                  isComplete ? 'text-accent-400/70 font-normal' : '',
                  !isActive && !isComplete ? 'text-white/25 font-normal' : '',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function MobilePillBar({ current }: { current: SetupWizardStep }) {
  return (
    <div className="flex gap-2 w-full">
      {SETUP_WIZARD_STEPS.map(step => {
        const isActive   = step.id === current
        const isComplete = step.id < current
        return (
          <div key={step.id} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={[
                'h-[3px] w-full rounded-full transition-all duration-500',
                isComplete ? 'bg-accent-500' : '',
                isActive   ? 'bg-accent-400' : '',
                !isActive && !isComplete ? 'bg-white/[0.12]' : '',
              ].join(' ')}
            />
            <span
              className={[
                'text-[9px] font-semibold uppercase tracking-wider transition-colors',
                isActive   ? 'text-white' : '',
                isComplete ? 'text-accent-400' : '',
                !isActive && !isComplete ? 'text-white/25' : '',
              ].join(' ')}
            >
              {step.short}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function SetupWizardLayout({
  step,
  title,
  description,
  onBack,
  backLabel = 'Back',
  wrapInCard = true,
  children,
}: {
  step: SetupWizardStep
  title: string
  description?: string
  onBack?: () => void
  backLabel?: string
  wrapInCard?: boolean
  children: React.ReactNode
}) {
  const heading = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent-400/70 mb-2">
        Step {step} of {SETUP_WIZARD_STEPS.length}
      </p>
      <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-white leading-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-2.5 text-sm leading-relaxed text-white/50 max-w-sm">
          {description}
        </p>
      )}
    </>
  )

  const formPanel = wrapInCard ? (
    <div className="rounded-2xl sm:rounded-3xl bg-white/[0.97] backdrop-blur-md border border-white/60 shadow-2xl shadow-black/25 ring-1 ring-white/40 p-5 sm:p-7 lg:p-8">
      {children}
    </div>
  ) : (
    children
  )

  return (
    <DarkAuthShell>
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-12 pb-20">
        <div className="mb-8 sm:mb-10 w-full max-w-3xl lg:max-w-4xl">
          <Link href="/" className="inline-block">
            <Image
              src="/images/brand/logo-header-white.png"
              alt="PathPilo"
              width={130}
              height={40}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        <div className="w-full max-w-3xl lg:max-w-4xl flex flex-col lg:flex-row lg:items-start lg:gap-10 xl:gap-14">
          {/* Left: title → description → steps */}
          <div className="lg:w-[220px] xl:w-[240px] flex-none mb-6 lg:mb-0">
            {heading}

            <div className="hidden lg:block mt-8">
              <DesktopStepper current={step} />
            </div>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="hidden lg:flex mt-8 items-center gap-2 text-sm text-white/35 hover:text-white/65 transition-colors"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                {backLabel}
              </button>
            )}

            {/* Mobile: pills below title */}
            <div className="lg:hidden mt-6">
              <MobilePillBar current={step} />
            </div>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="lg:hidden mt-5 flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                {backLabel}
              </button>
            )}
          </div>

          {/* Right: white glass form */}
          <div
            className={[
              'w-full min-w-0 lg:flex-none',
              step === 4 ? 'lg:max-w-xl xl:max-w-2xl' : 'lg:max-w-sm xl:max-w-md',
            ].join(' ')}
          >
            {formPanel}
          </div>
        </div>
      </div>
    </DarkAuthShell>
  )
}
