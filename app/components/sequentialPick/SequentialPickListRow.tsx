'use client'

import { SequentialPickBadge } from './SequentialPickBadge'
import { getSequentialPickMeta } from '@/app/lib/sequentialPick'
import type { SequentialPickId } from '@/app/lib/sequentialPick'

export interface SequentialPickListRowProps {
  id: SequentialPickId
  label: string
  address?: string
  accentColor: string
  pickActive: boolean
  pickOrder: SequentialPickId[]
  highlightedId?: SequentialPickId | null
  isLast?: boolean
  onAssign?: (id: SequentialPickId) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/** Sidebar row for sequential pick mode (prominent card + pick badge). */
export function SequentialPickListRow({
  id,
  label,
  address,
  accentColor,
  pickActive,
  pickOrder,
  highlightedId,
  isLast,
  onAssign,
  onMouseEnter,
  onMouseLeave,
}: SequentialPickListRowProps) {
  const meta = getSequentialPickMeta(id, pickActive, pickOrder, highlightedId)

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => onAssign?.(id)}
      role={onAssign ? 'button' : undefined}
      tabIndex={onAssign ? 0 : undefined}
      onKeyDown={e => {
        if (!onAssign) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAssign(id)
        }
      }}
      className={`flex gap-3 ${onAssign ? 'cursor-pointer' : ''}`}
    >
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
        <SequentialPickBadge
          pickNumber={meta.pickNumber}
          previewNumber={meta.previewNumber}
          accentColor={accentColor}
        />
        {!isLast && <div className="w-px flex-1 mt-1 bg-gray-200" style={{ minHeight: 12 }} />}
      </div>
      <div className="flex-1 min-w-0 pb-2.5">
        <div
          className="rounded-2xl px-4 py-3.5 bg-white border border-gray-100"
          style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{label}</p>
          {address && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5 leading-tight">{address}</p>
          )}
        </div>
      </div>
    </div>
  )
}
