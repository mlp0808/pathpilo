'use client'

import { useState, useEffect, useMemo } from 'react'
import AppLayout from '../../components/AppLayout'
import ServicesTable from '../../components/ServicesTable'
import AddServiceModal from '../../components/AddServiceModal'
import MissionsPanel from '../../components/missions/MissionsPanel'
import { useParams } from 'next/navigation'
import CreateItemGroupModal from '../../components/CreateItemGroupModal'
import CancellationFeeSettings from '../../components/CancellationFeeSettings'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'
import { requestMissionsRefresh } from '../../config/missions'

type ItemGroup = {
  id: number
  key: string
  name: string
  is_system: boolean
  meta_fields: string[]
  item_count: number
  items?: any[]
}

function metaLabel(fields: string[]) {
  const parts: string[] = []
  if (fields.includes('price')) parts.push('Price')
  if (fields.includes('duration')) parts.push('Duration')
  if (fields.includes('quantity')) parts.push('Quantity')
  return parts.join(' · ')
}

export default function ServicesPage() {
  const { t } = useAppI18n()
  const params = useParams() as { company?: string }
  const companySlug = params?.company || ''
  const [groups, setGroups] = useState<ItemGroup[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addForGroup, setAddForGroup] = useState<ItemGroup | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const fetchGroups = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/item-groups?include_items=true'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok) {
        setGroups(data.groups || [])
        setError('')
      } else {
        setError(data.error || 'Failed to fetch item groups')
      }
    } catch {
      setError('Network error: Failed to fetch item groups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGroups()
  }, [])

  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        items: (g.items || []).filter((s) => String(s.title || '').toLowerCase().includes(q)),
      }))
      .filter((g) => (g.items || []).length > 0 || g.name.toLowerCase().includes(q))
  }, [groups, searchTerm])

  if (loading && groups.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
            <p className="mt-2 text-gray-600">{t('app.items.loading', 'Loading items…')}</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div>
        {companySlug && (
          <MissionsPanel
            companySlug={companySlug}
            className="mb-5 sm:mb-6"
            onLaunch={(kind) => {
              if (kind !== 'add_service') return false
              const group = groups.find((g) => g.key === 'services') || groups[0]
              if (!group) return false
              setAddForGroup(group)
              return true
            }}
          />
        )}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('app.nav.items', 'Items')}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {t(
                  'app.items.subtitleGroups',
                  'Organize catalog items into groups. Services is the default — add Products or other groups as you need.',
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder={t('app.items.search', 'Search items…')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowCreateGroup(true)}
                className="inline-flex items-center px-4 py-2 bg-white text-[#193434] text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {t('app.items.newGroup', 'New group')}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
            <button type="button" onClick={fetchGroups} className="ml-3 font-medium underline">
              Try again
            </button>
          </div>
        )}

        <div className="space-y-8">
          {filteredGroups.map((group) => {
            const meta = Array.isArray(group.meta_fields) ? group.meta_fields : ['price', 'duration']
            const items = group.items || []
            return (
              <section key={group.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">{group.name}</h2>
                  {group.is_system && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {t('app.items.defaultGroup', 'Default')}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {items.length} · {metaLabel(meta)}
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setAddForGroup(group)}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-500 text-white hover:bg-accent-600"
                  >
                    {t('app.items.addItem', 'Add item')}
                  </button>
                </div>
                <ServicesTable
                  services={items}
                  searchTerm=""
                  onServiceUpdated={fetchGroups}
                  metaFields={meta}
                />
              </section>
            )
          })}
        </div>

        <CancellationFeeSettings />

        <AddServiceModal
          isOpen={!!addForGroup}
          onClose={() => setAddForGroup(null)}
          onServiceAdded={() => {
            fetchGroups()
            requestMissionsRefresh()
          }}
          groupId={addForGroup?.id ?? null}
          metaFields={addForGroup?.meta_fields || ['price', 'duration']}
          groupName={addForGroup?.name}
        />

        <CreateItemGroupModal
          isOpen={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          onCreated={fetchGroups}
        />
      </div>
    </AppLayout>
  )
}
