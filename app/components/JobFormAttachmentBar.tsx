'use client'

import { RefObject } from 'react'
import {
  UserIcon,
  ClockIcon,
  DocumentTextIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'

type UserRow = { id: number; first_name?: string; last_name?: string }

const PILL_EMPTY =
  'inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all whitespace-nowrap'
const PILL_FILLED =
  'inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all group max-w-[200px] sm:max-w-xs'

export default function JobFormAttachmentBar({
  users,
  selectedUserId,
  onEmployeeClick,
  onClearEmployee,
  userTriggerRef,
  jobTimeFrom,
  jobTimeTo,
  onTimeClick,
  onClearTime,
  jobNote,
  onNoteClick,
  onClearNote,
  assignEmployeeLabel,
  addTimeLabel,
  addNoteLabel,
}: {
  users: UserRow[]
  selectedUserId: number | null
  onEmployeeClick: () => void
  onClearEmployee: () => void
  userTriggerRef: RefObject<HTMLDivElement | null>
  jobTimeFrom: string
  jobTimeTo: string
  onTimeClick: () => void
  onClearTime: () => void
  jobNote: string
  onNoteClick: () => void
  onClearNote: () => void
  assignEmployeeLabel: string
  addTimeLabel: string
  addNoteLabel: string
}) {
  const selectedUser = users.find((u) => u.id === selectedUserId)
  const hasTime = !!(jobTimeFrom || jobTimeTo)
  const timeDisplay =
    jobTimeFrom && jobTimeTo
      ? `${jobTimeFrom} - ${jobTimeTo}`
      : jobTimeFrom || jobTimeTo || ''
  const hasNote = !!jobNote.trim()

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0" role="toolbar" aria-label="Job attachments">
      {/* Employee */}
      <div ref={userTriggerRef} className="relative dropdown-container flex-shrink-0">
        {selectedUserId && selectedUser ? (
          <div className={PILL_FILLED}>
            <button type="button" onClick={onEmployeeClick} className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm ring-2 ring-white/50 flex-shrink-0">
                {selectedUser.first_name?.[0]}{selectedUser.last_name?.[0]}
              </div>
              <span className="text-sm font-semibold text-primary-800 truncate">
                {selectedUser.first_name} {selectedUser.last_name}
              </span>
            </button>
            {users.length > 1 && (
              <button
                type="button"
                onClick={onClearEmployee}
                className="ml-0.5 p-0.5 rounded-full hover:bg-white/80 transition-colors flex-shrink-0"
                aria-label="Clear employee"
              >
                <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={onEmployeeClick} className={PILL_EMPTY}>
            <UserIcon className="w-4 h-4 text-gray-400" />
            <span>{assignEmployeeLabel}</span>
            <PlusIcon className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* Time */}
      <div className="relative flex-shrink-0">
        {hasTime ? (
          <div className={PILL_FILLED}>
            <button type="button" onClick={onTimeClick} className="flex items-center gap-2 min-w-0">
              <ClockIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-primary-800 truncate">{timeDisplay}</span>
            </button>
            <button
              type="button"
              onClick={onClearTime}
              className="ml-0.5 p-0.5 rounded-full hover:bg-white/80 transition-colors flex-shrink-0"
              aria-label="Clear time"
            >
              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onTimeClick} className={PILL_EMPTY}>
            <ClockIcon className="w-4 h-4 text-gray-400" />
            <span>{addTimeLabel}</span>
            <PlusIcon className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* Note */}
      <div className="relative flex-shrink-0">
        {hasNote ? (
          <div className={PILL_FILLED}>
            <button type="button" onClick={onNoteClick} className="flex items-center gap-2 min-w-0">
              <DocumentTextIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-primary-800 truncate">
                {jobNote.length > 20 ? `${jobNote.substring(0, 20)}...` : jobNote}
              </span>
            </button>
            <button
              type="button"
              onClick={onClearNote}
              className="ml-0.5 p-0.5 rounded-full hover:bg-white/80 transition-colors flex-shrink-0"
              aria-label="Clear note"
            >
              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onNoteClick} className={PILL_EMPTY}>
            <DocumentTextIcon className="w-4 h-4 text-gray-400" />
            <span>{addNoteLabel}</span>
            <PlusIcon className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>
    </div>
  )
}
