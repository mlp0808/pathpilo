'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAdminData } from '../_lib/api'
import { Card, Empty, ErrorBox, HeatLegend, Segmented, Spinner, formatDate, heatClass } from './ui'

interface HeatRow {
  id: number
  name: string
  sub: string | null
  totalActions: number
  totalEvents: number
  activeDays: number
  cells: Array<{ a: number; e: number }>
}

interface HeatData {
  by: 'company' | 'user'
  days: string[]
  maxActions: number
  rows: HeatRow[]
}

export default function HeatGrid() {
  const router = useRouter()
  const [by, setBy] = useState<'company' | 'user'>('company')
  const [days, setDays] = useState(30)
  const { data, loading, error } = useAdminData<HeatData>(`/admin/insights/heatmap?by=${by}&days=${days}&limit=40`)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Card
      title="Who is actually working"
      subtitle="Each square is a day. Darker green = more real actions (jobs, clients, invoices…). Faint green = only logged in or looked around."
      actions={
        <>
          <Segmented value={by} onChange={setBy} options={[{ value: 'company', label: 'Companies' }, { value: 'user', label: 'People' }]} />
          <Segmented value={days} onChange={setDays} options={[{ value: 14, label: '14d' }, { value: 30, label: '30d' }, { value: 60, label: '60d' }]} />
        </>
      }
      bodyClassName="p-0"
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-5"><ErrorBox message={error} /></div>
      ) : !data || data.rows.length === 0 ? (
        <Empty>No activity in this period yet.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] min-w-[200px] bg-white px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {by === 'company' ? 'Company' : 'Person'}
                  </th>
                  {data.days.map((d, i) => (
                    <th key={d} className={`px-[1px] pb-1 pt-2 text-center text-[10px] font-medium ${d === today ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {i % 7 === 0 || d === today ? Number(d.slice(8)) : ''}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Days</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push(by === 'company' ? `/admin/companies/${row.id}` : `/admin/people/u-${row.id}`)}
                    className="group cursor-pointer"
                  >
                    <td className="sticky left-0 z-[1] border-t border-gray-50 bg-white px-5 py-1.5 group-hover:bg-gray-50">
                      <p className="truncate font-semibold text-gray-800">{row.name}</p>
                      {row.sub && <p className="truncate text-[11px] text-gray-400">{row.sub}</p>}
                    </td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="border-t border-gray-50 px-[1px] py-1.5 group-hover:bg-gray-50">
                        <div
                          title={`${formatDate(data.days[i])}: ${c.a} actions, ${c.e} events`}
                          className={`mx-auto h-4 w-4 rounded-[3px] ${heatClass(c.a, c.e, data.maxActions)}`}
                        />
                      </td>
                    ))}
                    <td className="border-t border-gray-50 px-4 py-1.5 text-right font-semibold tabular-nums text-gray-800 group-hover:bg-gray-50">{row.totalActions}</td>
                    <td className="border-t border-gray-50 px-4 py-1.5 text-right tabular-nums text-gray-500 group-hover:bg-gray-50">{row.activeDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-gray-100 px-5 py-3">
            <HeatLegend />
          </div>
        </>
      )}
    </Card>
  )
}
