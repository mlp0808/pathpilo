'use client'

/**
 * Compact start/end locations for a focused employee.
 * Inline edit — updates real work-hours settings without leaving the planner.
 */

import { useCallback, useEffect, useState } from 'react'
import { MapPinIcon, PlusIcon } from '@heroicons/react/24/outline'
import AddressSearchInput from '@/app/components/AddressSearchInput'
import { apiUrl } from '@/app/utils/api'
import { invalidateWorkHoursCache } from '@/app/components/map/useMapData'

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

type DepotState = {
  start: string
  end: string
  useDefault: boolean
  companyStart: string
  companyEnd: string
}

export default function EmployeeRouteLocations({
  userId,
  onChanged,
  listStyle = false,
}: {
  userId: number
  /** Fired after a successful save so the map can rebuild home pins. */
  onChanged?: () => void
  /** Match the dashed “Add job” control (full width, no side margins). */
  listStyle?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [depot, setDepot] = useState<DepotState | null>(null)
  const [editing, setEditing] = useState<'start' | 'end' | 'both' | null>(null)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [whRes, coRes] = await Promise.all([
        fetch(apiUrl(`/work-hours/${userId}`), { headers: authHeaders() }),
        fetch(apiUrl('/companies/profile'), { headers: authHeaders() }),
      ])
      const wh = await whRes.json().catch(() => ({}))
      const co = await coRes.json().catch(() => ({}))
      const company = co.company || co
      const companyStart = String(company.defaultStartAddress || '').trim()
      const companyEnd = String(company.defaultEndAddress || companyStart).trim()
      const row = wh.workHours || wh
      const useDefault = row.use_company_default_location !== false
      const start = useDefault
        ? companyStart
        : String(row.start_address || '').trim()
      const end = useDefault
        ? companyEnd
        : String(row.end_address || row.start_address || '').trim()
      setDepot({ start, end, useDefault, companyStart, companyEnd })
    } catch {
      setDepot(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  const openEdit = (which: 'start' | 'end' | 'both') => {
    if (!depot) return
    setDraftStart(depot.start)
    setDraftEnd(depot.end || depot.start)
    setEditing(which)
  }

  const save = async () => {
    if (!depot) return
    setSaving(true)
    try {
      const start = draftStart.trim()
      const end = (draftEnd.trim() || start)
      const res = await fetch(apiUrl(`/work-hours/${userId}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          use_company_default_location: false,
          start_address: start,
          end_address: end,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      invalidateWorkHoursCache(userId)
      setDepot({
        ...depot,
        start,
        end,
        useDefault: false,
      })
      setEditing(null)
      onChanged?.()
    } catch {
      /* keep editor open */
    } finally {
      setSaving(false)
    }
  }

  const shell = listStyle ? '' : 'mx-3 mb-2'
  const width = listStyle ? 'w-full' : 'w-[calc(100%-1.5rem)]'

  if (loading) {
    return <div className={`${shell} h-9 rounded-2xl bg-gray-100/80 animate-pulse ${listStyle ? 'w-full' : 'mx-3 mb-2'}`} />
  }
  if (!depot) return null

  const hasStart = !!depot.start
  const hasEnd = !!depot.end
  const missing = !hasStart

  if (editing) {
    return (
      <div className={`${listStyle ? 'w-full mb-0' : 'mx-3 mb-2'} rounded-2xl border border-gray-200 bg-white p-2.5 shadow-sm`}>
        <div className="space-y-2">
          {(editing === 'start' || editing === 'both' || !hasStart) && (
            <AddressSearchInput
              value={draftStart}
              onChange={setDraftStart}
              placeholder="Start address"
              className="w-full rounded-xl border border-gray-200 px-2.5 py-2 text-[12px]"
              label="Start"
              dotColor="#3DD57A"
            />
          )}
          {(editing === 'end' || editing === 'both' || !hasEnd) && (
            <AddressSearchInput
              value={draftEnd}
              onChange={setDraftEnd}
              placeholder="End address (optional)"
              className="w-full rounded-xl border border-gray-200 px-2.5 py-2 text-[12px]"
              label="End"
              dotColor="#F59E0B"
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !draftStart.trim()}
            onClick={() => void save()}
            className="h-7 px-3 rounded-lg bg-[#193434] text-white text-[11px] font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  if (missing) {
    return (
      <button
        type="button"
        onClick={() => openEdit('both')}
        className={`${shell} ${width} flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-2xl py-3 text-[13px] font-semibold text-gray-500 hover:text-accent-600 hover:border-accent-400 hover:bg-accent-50/40 transition-colors`}
      >
        <PlusIcon className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
        Add start & end
      </button>
    )
  }

  return (
    <div className={`${listStyle ? 'w-full' : 'mx-3 mb-2'} flex items-stretch gap-1.5`}>
      <button
        type="button"
        onClick={() => openEdit('start')}
        className="min-w-0 flex-1 flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-gray-300 transition-colors"
        title={depot.start}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500 flex-shrink-0" />
        <span className="min-w-0 truncate text-[12px] font-semibold text-gray-700">{depot.start}</span>
      </button>
      <button
        type="button"
        onClick={() => openEdit(hasEnd ? 'end' : 'both')}
        className="min-w-0 flex-1 flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-gray-300 transition-colors"
        title={depot.end || 'Add end'}
      >
        {hasEnd ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="min-w-0 truncate text-[12px] font-semibold text-gray-700">{depot.end}</span>
          </>
        ) : (
          <>
            <MapPinIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-[12px] font-semibold text-gray-400">Add end</span>
          </>
        )}
      </button>
    </div>
  )
}
