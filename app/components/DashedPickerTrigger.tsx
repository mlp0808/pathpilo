'use client'

import { PlusIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'

const BASE =
  'w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl font-medium text-gray-500 hover:text-accent-600 hover:border-accent-400/80 hover:bg-accent-50/40 transition-colors'

export default function DashedPickerTrigger({
  children,
  onClick,
  size = 'lg',
  className = '',
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  size?: 'lg' | 'md'
  className?: string
  disabled?: boolean
}) {
  const padding = size === 'lg' ? 'py-3.5 px-4 text-sm' : 'py-2.5 px-3 text-sm'
  const iconClass = size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BASE} ${padding} ${disabled ? 'opacity-45 cursor-not-allowed hover:text-gray-500 hover:border-gray-300 hover:bg-transparent' : ''} ${className}`}
    >
      <PlusIcon className={`${iconClass} opacity-70`} />
      {children}
    </button>
  )
}
