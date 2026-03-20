'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../utils/api'

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeaveType = 'full_day' | 'half_day_morning' | 'half_day_afternoon' | 'custom_hours'
export type LeaveCategory = 'holiday' | 'sick' | 'personal' | 'public_holiday' | 'other'

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
}

export interface ExistingLeave {
  id: number
  leave_type: LeaveType
  category: LeaveCategory
  hours_off: number | null
  note: string | null
}

export interface AddLeaveModalProps {
  onClose: () => void
  /** Called after a successful save or delete — refresh leave data in the parent */
  onSaved: (userId: number, date: string) => void
  /** Pre-fill the employee picker — user can still change it */
  preselectedUserId?: number
  /** Pre-fill the date field */
  preselectedDate?: string
  /** If set, modal operates in "edit" mode */
  existingLeave?: ExistingLeave
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<LeaveCategory, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  holiday:        { label: 'Holiday',        color: '#3DD57A', bg: '#F0FDF4', border: '#BBF7D0', emoji: '🌴' },
  sick:           { label: 'Sick day',       color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', emoji: '🤒' },
  personal:       { label: 'Personal',       color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', emoji: '👤' },
  public_holiday: { label: 'Public holiday', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', emoji: '🎉' },
  other:          { label: 'Other',          color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', emoji: '📋' },
}

const DURATION_OPTIONS: { key: LeaveType; label: string; sub: string }[] = [
  { key: 'full_day',           label: 'Full day',        sub: 'All day off' },
  { key: 'half_day_morning',   label: 'Morning off',     sub: 'First half' },
  { key: 'half_day_afternoon', label: 'Afternoon off',   sub: 'Second half' },
  { key: 'custom_hours',       label: 'Custom hours',    sub: 'Specify hours' },
]

const AVATAR_COLORS = ['#3DD57A','#FF6B6B','#4ECDC4','#45B7D1','#F4A261','#E76F51','#7B2D8B','#2196F3']
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddLeaveModal({
  onClose, onSaved, preselectedUserId, preselectedDate, existingLeave,
}: AddLeaveModalProps) {
  const [users, setUsers]               = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userSearch, setUserSearch]     = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]           = useState(preselectedDate || today)
  const [leaveType, setLeaveType] = useState<LeaveType>(existingLeave?.leave_type || 'full_day')
  const [category, setCategory]   = useState<LeaveCategory>(existingLeave?.category || 'holiday')
  const [hoursOff, setHoursOff]   = useState(existingLeave?.hours_off?.toString() || '')
  const [note, setNote]           = useState(existingLeave?.note || '')

  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch(apiUrl('/users'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => {
        const list: User[] = d.users || []
        setUsers(list)
        if (preselectedUserId) setSelectedUser(list.find(u => u.id === preselectedUserId) || null)
      })
      .catch(() => {})
  }, [preselectedUserId])

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
  )

  const handleSave = async () => {
    if (!selectedUser) { setError('Please select an employee'); return }
    if (!date)         { setError('Please select a date'); return }
    setSaving(true); setError('')
    try {
      const token = localStorage.getItem('token')
      const body: Record<string, unknown> = { leave_date: date, leave_type: leaveType, category, note: note || null }
      if (leaveType === 'custom_hours') body.hours_off = parseFloat(hoursOff) || null
      const res = await fetch(apiUrl(`/employee-leave/${selectedUser.id}`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save') }
      else onSaved(selectedUser.id, date)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selectedUser || !existingLeave) return
    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      await fetch(apiUrl(`/employee-leave/${selectedUser.id}/${existingLeave.id}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      onSaved(selectedUser.id, date)
    } finally { setDeleting(false) }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-slideDown"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {existingLeave ? 'Edit time off' : 'Add time off'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">Record leave, sick days, or absences</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-4">

          {/* Employee selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Employee</label>
            {selectedUser ? (
              <button
                onClick={() => { setSelectedUser(null); setUserSearch(''); setTimeout(() => inputRef.current?.focus(), 50) }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-accent-400 bg-accent-50/60 text-left group transition-all"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: avatarColor(selectedUser.id) }}
                >
                  {selectedUser.first_name[0]}{selectedUser.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{selectedUser.first_name} {selectedUser.last_name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedUser.email}</p>
                </div>
                <span className="text-xs text-accent-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  Change ›
                </span>
              </button>
            ) : (
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Search for an employee…"
                  autoFocus={!preselectedUserId}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300 transition-colors outline-none"
                />
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-52 overflow-y-auto z-20">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No employees found</div>
                    ) : filtered.map(u => (
                      <button
                        key={u.id}
                        onMouseDown={() => { setSelectedUser(u); setUserSearch(''); setShowDropdown(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: avatarColor(u.id) }}
                        >
                          {u.first_name[0]}{u.last_name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300 transition-colors outline-none"
            />
          </div>

          {/* Type / category */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Reason</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(CATEGORY_META) as [LeaveCategory, typeof CATEGORY_META[LeaveCategory]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                    category === key ? 'ring-2 ring-offset-1' : 'hover:border-gray-300 bg-white border-gray-200'
                  }`}
                  style={category === key
                    ? { background: meta.bg, borderColor: meta.color }
                    : {}}
                >
                  <span className="text-base leading-none">{meta.emoji}</span>
                  <span className={category === key ? 'text-gray-900' : 'text-gray-700'}>{meta.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Duration</label>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map(({ key, label, sub }) => (
                <button
                  key={key}
                  onClick={() => setLeaveType(key)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                    leaveType === key
                      ? 'bg-accent-50 border-accent-400 ring-2 ring-accent-400 ring-offset-1'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-semibold leading-tight ${leaveType === key ? 'text-accent-700' : 'text-gray-800'}`}>{label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>

            {leaveType === 'custom_hours' && (
              <div className="mt-3 relative">
                <input
                  type="number" min={0.5} max={24} step={0.5}
                  value={hoursOff}
                  onChange={e => setHoursOff(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-full pl-4 pr-16 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium pointer-events-none">hours</span>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
              Note <span className="normal-case font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Dentist, vacation in Spain…"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300 transition-colors outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {existingLeave && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedUser || !date}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#3DD57A', color: '#0A1A0A', boxShadow: '0 2px 12px rgba(61,213,122,0.25)' }}
          >
            {saving ? 'Saving…' : existingLeave ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' ? createPortal(modal, document.body) : null
}
