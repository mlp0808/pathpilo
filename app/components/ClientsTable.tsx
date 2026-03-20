'use client'

import { useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Client {
  id: number
  client_type: 'person' | 'company'
  name: string
  last_name: string | null
  address: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  created_at: string
}

interface ClientsTableProps {
  clients: Client[]
  searchTerm: string
  currentPage: number
  onPageChange: (page: number) => void
}

export default function ClientsTable({ clients, searchTerm, currentPage, onPageChange }: ClientsTableProps) {
  const router = useRouter()
  const params = useParams() as any
  const companySlug = params?.company as string | undefined
  const ITEMS_PER_PAGE = 50

  const filteredClients = useMemo(() => {
    if (!searchTerm) {
      return clients
    }
    // Remove spaces from search term for phone number matching
    const normalizedSearchTerm = searchTerm.replace(/\s+/g, '').toLowerCase()
    const lowercasedSearchTerm = searchTerm.toLowerCase()
    
    return clients.filter(client => {
      // Normalize phone numbers by removing spaces for comparison
      const normalizedPhone = client.phone ? client.phone.replace(/\s+/g, '').toLowerCase() : ''
      
      return (
        client.name.toLowerCase().includes(lowercasedSearchTerm) ||
        (client.last_name && client.last_name.toLowerCase().includes(lowercasedSearchTerm)) ||
        (client.email && client.email.toLowerCase().includes(lowercasedSearchTerm)) ||
        (normalizedPhone && normalizedPhone.includes(normalizedSearchTerm))
      )
    })
  }, [clients, searchTerm])

  const handleClientClick = (clientId: number) => {
    const href = companySlug ? `/${companySlug}/clients/${clientId}` : `/clients/${clientId}`
    router.push(href)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Pagination logic
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedClients = filteredClients.slice(startIndex, endIndex)

  if (filteredClients.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {searchTerm ? 'No clients found' : 'No clients yet'}
        </h3>
        <p className="text-gray-500">
          {searchTerm 
            ? 'Try adjusting your search terms' 
            : 'Get started by adding your first client'
          }
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedClients.map((client) => (
            <tr
              key={client.id}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => handleClientClick(client.id)}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {client.name}{client.last_name ? ` ${client.last_name}` : ''}
                    </div>
                    <div className="text-sm text-gray-500">
                      Added {formatDate(client.created_at)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.address ? (
                    <>
                      {client.address}
                      {client.zip_code && (
                        <><br />{client.zip_code}</>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 italic">No address</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.phone || (
                    <span className="text-gray-400 italic">No phone</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.email || (
                    <span className="text-gray-400 italic">No email</span>
                  )}
                </div>
              </td>
            </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{Math.min(endIndex, filteredClients.length)}</span> of <span className="font-medium">{filteredClients.length}</span> clients
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                currentPage === 1
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Previous
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first page, last page, current page, and pages around current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  )
                })
                .map((page, index, array) => {
                  // Add ellipsis if there's a gap
                  const showEllipsisBefore = index > 0 && array[index - 1] < page - 1
                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsisBefore && (
                        <span className="px-2 text-gray-500">...</span>
                      )}
                      <button
                        onClick={() => onPageChange(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                          currentPage === page
                            ? 'bg-accent-500 text-white border-accent-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  )
                })}
            </div>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                currentPage === totalPages
                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  )
}
