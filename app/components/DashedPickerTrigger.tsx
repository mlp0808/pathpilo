'use client'

import { PlusIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'

const BASE =
  'w-full flex items-center border border-dashed border-gray-300 rounded-xl font-medium text-gray-500 hover:text-accent-600 hover:border-accent-400/80 hover:bg-accent-50/40 transition-colors'

export default function DashedPickerTrigger({
  children,
  onClick,
  size = 'lg',
  className = '',
  disabled = false,
  trailing,
}: {
  children: ReactNode
  onClick: () => void
  size?: 'lg' | 'md'
  className?: string
  disabled?: boolean
  /** Optional control rendered on the right (e.g. history). */
  trailing?: ReactNode
}) {
  const padding = size === 'lg' ? 'py-3.5 px-4 text-sm' : 'py-2.5 px-3 text-sm'
  const iconClass = size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  return (
    <div
      className={`${BASE} ${padding} ${disabled ? 'opacity-45 cursor-not-allowed hover:text-gray-500 hover:border-gray-300 hover:bg-transparent' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 disabled:cursor-not-allowed"
      >
        <PlusIcon className={`${iconClass} opacity-70`} />
        {children}
      </button>
      {trailing}
    </div>
  )
}

export function DashedPickerHistoryButton({
  onClick,
  active = false,
  loading = false,
  label,
}: {
  onClick: () => void
  active?: boolean
  loading?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={label}
      aria-label={label}
      aria-expanded={active}
      className={`-mr-1 ml-2 flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-accent-100 text-accent-700'
          : 'text-gray-400 hover:bg-white/80 hover:text-accent-600'
      }`}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
      ) : (
        <DocumentDuplicateIcon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </button>
  )
}
