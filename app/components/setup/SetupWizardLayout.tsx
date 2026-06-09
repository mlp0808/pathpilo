'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'
import DarkAuthShell from '@/app/components/DarkAuthShell'

export const SETUP_WIZARD_STEPS = [
  { id: 1, label: 'Add clients', short: 'Clients' },
] as const

export type SetupWizardStep = 1

/** Shared field styles for forms inside the white glass panel */
export const setupFieldInputClass =
  'w-full px-4 py-3 text-sm bg-white border border-gray-200/90 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 transition-all hover:border-gray-300'
export const setupFieldLabelClass =
  'block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2'
export const setupFieldSelectClass = `${setupFieldInputClass} cursor-pointer`


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

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mt-8 flex items-center gap-2 text-sm text-white/35 hover:text-white/65 transition-colors"
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
              'lg:max-w-sm xl:max-w-md',
            ].join(' ')}
          >
            {formPanel}
          </div>
        </div>
      </div>
    </DarkAuthShell>
  )
}
