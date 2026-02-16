'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'

type LeadStatus = 'new' | 'contacted' | 'won' | 'lost'

export default function LeadsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [leads, setLeads] = useState<any[]>([])
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})

  const fetchLeads = async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('token')
      const qs = statusFilter === 'all' ? '' : `?status=${statusFilter}`
      const res = await fetch(apiUrl(`/leads${qs}`), {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setLeads(data.leads || [])
        // Keep selection in sync
        if (selectedLead) {
          const next = (data.leads || []).find((l: any) => l.id === selectedLead.id) || null
          setSelectedLead(next)
        }
      } else {
        setError(data?.error || 'Failed to fetch leads')
      }
    } catch (e) {
      setError('Network error: Failed to fetch leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const formatDateTime = (v: any) => {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return String(v)
    return d.toLocaleString()
  }

  const updateLead = async (leadId: number, patch: {
    status?: LeadStatus;
    notes?: string;
    first_name?: string;
    last_name?: string;
    country?: string;
    address?: string;
    zip_code?: string;
    city?: string;
    email?: string;
    phone?: string;
  }) => {
    try {
      setSaving(true)
      setError('')
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/leads/${leadId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(patch)
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to update lead')
        return
      }
      // Update local state without a full reload (snappy)
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)))
      setSelectedLead(data.lead)
    } catch (e) {
      setError('Network error: Failed to update lead')
    } finally {
      setSaving(false)
    }
  }

  const selectedName = useMemo(() => {
    if (!selectedLead) return ''
    const n = `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`.trim()
    return n || selectedLead.email || 'Lead'
  }, [selectedLead])

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-600">New requests from your website form.</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <button
              onClick={fetchLeads}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900">{loading ? 'Loading…' : `${leads.length} lead(s)`}</div>
            </div>

            <div className="divide-y divide-gray-100">
              {leads.length === 0 && !loading ? (
                <div className="p-6 text-sm text-gray-500">No leads yet.</div>
              ) : (
                leads.map((lead) => {
                  const isActive = selectedLead?.id === lead.id
                  const title = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead'
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                        isActive ? 'bg-blue-50' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                          <div className="text-xs text-gray-600 truncate">
                            {lead.email ? lead.email : '—'} {lead.phone ? `• ${lead.phone}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full border ${
                              lead.status === 'new'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : lead.status === 'contacted'
                                ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                                : lead.status === 'won'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}
                          >
                            {lead.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">{formatDateTime(lead.created_at)}</div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Details</div>
                <div className="text-xs text-gray-500">{selectedLead ? selectedName : 'Select a lead'}</div>
              </div>
              {selectedLead && (
                <button
                  onClick={() => {
                    if (editing) {
                      // Save changes
                      updateLead(selectedLead.id, editData)
                      setEditing(false)
                    } else {
                      // Start editing
                      setEditData({
                        first_name: selectedLead.first_name || '',
                        last_name: selectedLead.last_name || '',
                        country: selectedLead.country || '',
                        address: selectedLead.address || '',
                        zip_code: selectedLead.zip_code || '',
                        city: selectedLead.city || '',
                        email: selectedLead.email || '',
                        phone: selectedLead.phone || '',
                        status: selectedLead.status,
                        notes: selectedLead.notes || ''
                      })
                      setEditing(true)
                    }
                  }}
                  className="text-sm px-3 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : editing ? 'Save' : 'Edit'}
                </button>
              )}
            </div>

            {!selectedLead ? (
              <div className="p-6 text-sm text-gray-500">Click a lead to see details.</div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Customer Information */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Customer Information</div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500">First Name</div>
                      {editing ? (
                        <input
                          type="text"
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          value={editData.first_name || ''}
                          onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                        />
                      ) : (
                        <div className="text-sm text-gray-900">{selectedLead.first_name || '—'}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Last Name</div>
                      {editing ? (
                        <input
                          type="text"
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          value={editData.last_name || ''}
                          onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                        />
                      ) : (
                        <div className="text-sm text-gray-900">{selectedLead.last_name || '—'}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Email</div>
                    {editing ? (
                      <input
                        type="email"
                        className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                        value={editData.email || ''}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm text-gray-900">{selectedLead.email || '—'}</div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Phone</div>
                    {editing ? (
                      <input
                        type="tel"
                        className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                        value={editData.phone || ''}
                        onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm text-gray-900">{selectedLead.phone || '—'}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Country</div>
                      {editing ? (
                        <input
                          type="text"
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          value={editData.country || ''}
                          onChange={(e) => setEditData({ ...editData, country: e.target.value })}
                        />
                      ) : (
                        <div className="text-sm text-gray-900">{selectedLead.country || '—'}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">City</div>
                      {editing ? (
                        <input
                          type="text"
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          value={editData.city || ''}
                          onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                        />
                      ) : (
                        <div className="text-sm text-gray-900">{selectedLead.city || '—'}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Address</div>
                    {editing ? (
                      <input
                        type="text"
                        className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                        value={editData.address || ''}
                        onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm text-gray-900">{selectedLead.address || '—'}</div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">Zip Code</div>
                    {editing ? (
                      <input
                        type="text"
                        className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                        value={editData.zip_code || ''}
                        onChange={(e) => setEditData({ ...editData, zip_code: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm text-gray-900">{selectedLead.zip_code || '—'}</div>
                    )}
                  </div>
                </div>

                {/* Form Data */}
                {selectedLead.meta && (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Form Responses</div>

                    {/* Service Selections */}
                    {selectedLead.meta.serviceSelections && Object.keys(selectedLead.meta.serviceSelections).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500">Selected Services</div>
                        <div className="text-sm text-gray-900">
                          {Object.entries(selectedLead.meta.serviceSelections).map(([serviceId, selections]: [string, any]) => (
                            <div key={serviceId}>
                              Service {serviceId}: {Array.isArray(selections) ? selections.join(', ') : selections}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Selections */}
                    {selectedLead.meta.customSelections && Object.keys(selectedLead.meta.customSelections).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500">Custom Options</div>
                        <div className="text-sm text-gray-900">
                          {Object.entries(selectedLead.meta.customSelections).map(([optionId, selections]: [string, any]) => (
                            <div key={optionId}>
                              Option {optionId}: {Array.isArray(selections) ? selections.join(', ') : selections}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Inputs */}
                    {selectedLead.meta.customInputs && Object.keys(selectedLead.meta.customInputs).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500">Additional Information</div>
                        <div className="text-sm text-gray-900">
                          {Object.entries(selectedLead.meta.customInputs).map(([inputId, value]: [string, any]) => (
                            <div key={inputId}>
                              Field {inputId}: {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Lead Information */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Lead Information</div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Status</div>
                      {editing ? (
                        <select
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                          value={editData.status}
                          onChange={(e) => setEditData({ ...editData, status: e.target.value as LeadStatus })}
                        >
                          <option value="new">new</option>
                          <option value="contacted">contacted</option>
                          <option value="won">won</option>
                          <option value="lost">lost</option>
                        </select>
                      ) : (
                        <select
                          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                          value={selectedLead.status}
                          onChange={(e) => updateLead(selectedLead.id, { status: e.target.value as LeadStatus })}
                          disabled={saving}
                        >
                          <option value="new">new</option>
                          <option value="contacted">contacted</option>
                          <option value="won">won</option>
                          <option value="lost">lost</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Created</div>
                      <div className="text-sm text-gray-900">{formatDateTime(selectedLead.created_at)}</div>
                    </div>
                  </div>

                  {(selectedLead.preferred_date || selectedLead.preferred_time) && (
                    <div>
                      <div className="text-xs text-gray-500">Preferred Time</div>
                      <div className="text-sm text-gray-900">
                        {selectedLead.preferred_date ? String(selectedLead.preferred_date) : '—'}{' '}
                        {selectedLead.preferred_time ? String(selectedLead.preferred_time).substring(0, 5) : ''}
                      </div>
                    </div>
                  )}

                  {selectedLead.message && (
                    <div>
                      <div className="text-xs text-gray-500">Message</div>
                      <div className="text-sm text-gray-900 whitespace-pre-wrap">{selectedLead.message}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Internal Notes</div>
                    {editing ? (
                      <textarea
                        className="w-full min-h-[90px] text-sm border border-gray-200 rounded-lg px-3 py-2"
                        value={editData.notes || ''}
                        onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                        placeholder="Notes for your team…"
                      />
                    ) : (
                      <>
                        <textarea
                          className="w-full min-h-[90px] text-sm border border-gray-200 rounded-lg px-3 py-2"
                          value={selectedLead.notes || ''}
                          onChange={(e) => setSelectedLead({ ...selectedLead, notes: e.target.value })}
                          placeholder="Notes for your team…"
                        />
                        <button
                          className="mt-2 w-full text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => updateLead(selectedLead.id, { notes: selectedLead.notes || '' })}
                          disabled={saving}
                        >
                          {saving ? 'Saving…' : 'Save notes'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editing && (
                  <div className="flex gap-2 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setEditing(false)}
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        updateLead(selectedLead.id, editData)
                        setEditing(false)
                      }}
                      className="flex-1 text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}


