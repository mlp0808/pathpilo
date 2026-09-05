'use client'

import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'

const META_OPTIONS = [
  { key: 'price', label: 'Price', locked: true },
  { key: 'duration', label: 'Duration' },
  { key: 'quantity', label: 'Quantity' },
] as const

interface CreateItemGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export default function CreateItemGroupModal({ isOpen, onClose, onCreated }: CreateItemGroupModalProps) {
  const { t } = useAppI18n()
  const [name, setName] = useState('')
  const [meta, setMeta] = useState<string[]>(['price', 'quantity'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const toggleMeta = (key: string) => {
    if (key === 'price') return
    setMeta((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/item-groups'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          meta_fields: meta.includes('price') ? meta : ['price', ...meta],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create group')
      setName('')
      setMeta(['price', 'quantity'])
      onCreated()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to create group')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('app.items.newGroup', 'New item group')}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {t(
            'app.items.newGroupHint',
            'Choose which fields items in this group will have. Price is always included.',
          )}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
              {t('app.items.groupName', 'Group name')}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Products"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#193434]/15"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-2">
              {t('app.items.metaFields', 'Fields')}
            </label>
            <div className="flex flex-wrap gap-2">
              {META_OPTIONS.map((opt) => {
                const on = meta.includes(opt.key)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={opt.locked}
                    onClick={() => toggleMeta(opt.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      on
                        ? 'bg-[#193434] text-white border-[#193434]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    } ${opt.locked ? 'opacity-90 cursor-default' : ''}`}
                  >
                    {opt.label}
                    {opt.locked ? ' ✓' : ''}
                  </button>
                )
              })}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
              {t('app.common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#193434] rounded-xl hover:bg-[#244444] disabled:opacity-40"
            >
              {busy ? t('app.common.saving', 'Saving…') : t('app.items.createGroup', 'Create group')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
