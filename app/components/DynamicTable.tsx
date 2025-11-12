'use client'

import React, { useState } from 'react'

interface DynamicTableProps {
  data: any[]
  title: string
  emptyMessage: string
  emptyIcon: React.ReactNode
}

export default function DynamicTable({ data, title, emptyMessage, emptyIcon }: DynamicTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Get all unique keys from all objects (even if data is empty, we'll show headers)
  const allKeys = data.length > 0 
    ? Array.from(new Set(data.flatMap(item => Object.keys(item))))
    : [] // If no data, we'll show a message about no columns detected
  
  // Filter out sensitive data and organize columns
  const sensitiveKeys = ['password_hash', 'password']
  const displayKeys = allKeys.filter(key => !sensitiveKeys.includes(key))
  
  // Separate primary columns (always visible) from secondary columns
  const primaryColumns = displayKeys.slice(0, 6) // Show first 6 columns
  const secondaryColumns = displayKeys.slice(6) // Rest are in expandable view

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  const formatValue = (value: any, key: string) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">null</span>
    }
    
    if (typeof value === 'boolean') {
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {value.toString()}
        </span>
      )
    }
    
    if (key.includes('_at') || key.includes('date') || key.includes('created') || key.includes('updated')) {
      try {
        const date = new Date(value)
        return (
          <div className="text-sm">
            <div className="text-gray-900">{date.toLocaleDateString()}</div>
            <div className="text-gray-500 text-xs">{date.toLocaleTimeString()}</div>
          </div>
        )
      } catch {
        return <span className="text-sm text-gray-900">{value}</span>
      }
    }
    
    if (typeof value === 'string' && value.length > 50) {
      return (
        <div className="text-sm text-gray-900 max-w-xs">
          <div className="truncate" title={value}>{value}</div>
        </div>
      )
    }
    
    if (key === 'role') {
      return (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value === 'admin' 
            ? 'bg-red-100 text-red-800' 
            : 'bg-blue-100 text-blue-800'
        }`}>
          {value}
        </span>
      )
    }
    
    if (key.includes('price') || key.includes('amount')) {
      return <span className="text-sm text-gray-900 font-medium">{value} DKK</span>
    }
    
    if (key.includes('duration') && key.includes('minutes')) {
      const minutes = parseInt(value) || 0
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      const durationText = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`
      return <span className="text-sm text-gray-900">{durationText}</span>
    }
    
    return <span className="text-sm text-gray-900">{value}</span>
  }

  const formatColumnName = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  }

  // If no columns detected (empty data), show a message
  if (displayKeys.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400">
          {emptyIcon}
        </div>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No {title.toLowerCase()}</h3>
        <p className="mt-1 text-sm text-gray-500">{emptyMessage}</p>
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            <strong>Database Info:</strong> No columns detected. This could mean the table is empty or there's a connection issue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            {primaryColumns.map((key) => (
              <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {formatColumnName(key)}
              </th>
            ))}
            {secondaryColumns.length > 0 && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                More
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td 
                colSpan={primaryColumns.length + (secondaryColumns.length > 0 ? 1 : 0)} 
                className="px-6 py-12 text-center"
              >
                <div className="text-sm text-gray-500">
                  <div className="mx-auto h-8 w-8 text-gray-400 mb-2">
                    {emptyIcon}
                  </div>
                  <div className="font-medium">No {title.toLowerCase()} found</div>
                  <div className="text-xs mt-1">{emptyMessage}</div>
                </div>
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              // Use a more reliable key - try to use an id field if available, otherwise use index
              const rowKey = item.id || item.ID || index;
              return (
                <React.Fragment key={rowKey}>
                  <tr className="hover:bg-gray-50">
                    {primaryColumns.map((key) => (
                      <td key={key} className="px-6 py-4 whitespace-nowrap">
                        {formatValue(item[key], key)}
                      </td>
                    ))}
                    {secondaryColumns.length > 0 && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleRowExpansion(index)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {expandedRows.has(index) ? 'Hide' : 'Show'} Details
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedRows.has(index) && secondaryColumns.length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={primaryColumns.length + 1} className="px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {secondaryColumns.map((key) => (
                            <div key={key} className="space-y-1">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {formatColumnName(key)}
                              </div>
                              <div className="text-sm">
                                {formatValue(item[key], key)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
      
      {/* Column Information Footer */}
      <div className="bg-gray-100 px-6 py-3 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          <strong>Database Columns:</strong> {displayKeys.length} total 
          {displayKeys.length > 6 && ` (${primaryColumns.length} visible, ${secondaryColumns.length} expandable)`}
          {displayKeys.length <= 6 && ' (all visible)'}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Columns: {displayKeys.join(', ')}
        </div>
        {data.length === 0 && (
          <div className="text-xs text-blue-600 mt-1">
            📊 Table structure visible - ready for data
          </div>
        )}
      </div>
    </div>
  )
}
