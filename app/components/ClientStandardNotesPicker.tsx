'use client'

export type ClientStandardNoteRow = { id: number; note: string }

type TranslateFn = (key: string, fallback?: string) => string

export function ClientStandardNotesPicker({
  clientId,
  loading,
  error,
  notes,
  onUse,
  t,
  addLabelKey = 'app.createJob.useClientStandardNote',
  addLabelFallback = 'Add to job note',
}: {
  clientId: number | null | undefined
  loading: boolean
  error: string | null
  notes: ClientStandardNoteRow[]
  onUse: (text: string) => void
  t: TranslateFn
  /** i18n key for the action link on each note card */
  addLabelKey?: string
  addLabelFallback?: string
}) {
  if (clientId == null || clientId < 1) return null
  return (
    <div className="pt-3 mt-3 border-t border-gray-100">
      <div className="text-xs font-semibold text-primary-700 mb-2">
        {t('app.createJob.clientStandardNotesHeading', 'From client standard notes')}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        {t(
          'app.createJob.clientStandardNotesHint',
          'Encrypted notes from the client profile. Tap one to add it to this note.',
        )}
      </p>
      {loading ? (
        <div className="text-xs text-gray-400 py-2">
          {t('app.createJob.clientStandardNotesLoading', 'Loading…')}
        </div>
      ) : error ? (
        <div className="text-xs text-red-600 py-1">{error}</div>
      ) : notes.length === 0 ? (
        <div className="text-xs text-gray-400 py-1">
          {t('app.createJob.noClientStandardNotes', 'No standard notes saved for this client yet.')}
        </div>
      ) : (
        <div className="max-h-44 overflow-y-auto space-y-2 pr-0.5">
          {notes.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onUse(row.note)}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-accent-300 hover:bg-accent-50/40 text-sm text-gray-800 transition-colors shadow-sm"
            >
              <span className="line-clamp-3 whitespace-pre-wrap block">{row.note}</span>
              <span className="mt-1.5 block text-xs font-semibold text-accent-600">
                {t(addLabelKey, addLabelFallback)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
