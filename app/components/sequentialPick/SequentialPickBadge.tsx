'use client'

import { LocationPinIcon } from './LocationPinIcon'
import { SEQUENTIAL_PICK_THEME } from '@/app/lib/sequentialPick/theme'

/**
 * Timeline badge for sequential pick: dark + pin icon when idle,
 * accent + number when picked, preview number on hover.
 */
export function SequentialPickBadge({
  pickNumber,
  previewNumber,
  accentColor,
  size = 28,
}: {
  pickNumber: number | null
  previewNumber: number | null
  accentColor: string
  size?: number
}) {
  const isPicked = pickNumber != null
  const showPreview = !isPicked && previewNumber != null

  if (isPicked) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 select-none"
        style={{
          width: size,
          height: size,
          background: accentColor,
          color: SEQUENTIAL_PICK_THEME.pinPickedText,
          boxShadow: `0 0 0 2px ${accentColor}35, 0 2px 8px ${accentColor}30`,
        }}
      >
        {pickNumber}
      </div>
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 select-none transition-transform duration-150"
      style={{
        width: size,
        height: size,
        background: SEQUENTIAL_PICK_THEME.pinIdleSidebar,
        boxShadow: '0 2px 8px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.1)',
        transform: showPreview ? 'scale(1.06)' : 'scale(1)',
      }}
    >
      {showPreview ? (
        <span className="text-[11px] font-bold text-white">{previewNumber}</span>
      ) : (
        <LocationPinIcon className="w-3.5 h-3.5" style={{ color: SEQUENTIAL_PICK_THEME.pinIdleIcon }} />
      )}
    </div>
  )
}
