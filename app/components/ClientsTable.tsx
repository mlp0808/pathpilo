'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EyeIcon } from '@heroicons/react/24/outline'

interface Client {
  id: number
  first_name: string
  last_name: string
  personal_address: string
  personal_zip_code: string
  personal_phone: string
  personal_email: string
  created_at: string
}

interface ClientsTableProps {
  clients: Client[]
  searchTerm: string
}

export default function ClientsTable({ clients, searchTerm }: ClientsTableProps) {
  const router = useRouter()
  
  const filteredClients = useMemo(() => {
    if (!searchTerm) {
      return clients
    }
    const lowercasedSearchTerm = searchTerm.toLowerCase()
    return clients.filter(client =>
      client.first_name.toLowerCase().includes(lowercasedSearchTerm) ||
      client.last_name.toLowerCase().includes(lowercasedSearchTerm) ||
      client.personal_email?.toLowerCase().includes(lowercasedSearchTerm) ||
      client.personal_phone?.toLowerCase().includes(lowercasedSearchTerm)
    )
  }, [clients, searchTerm])

  const handleClientClick = (clientId: number) => {
    router.push(`/clients/${clientId}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

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
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredClients.map((client) => (
            <tr 
              key={client.id} 
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => handleClientClick(client.id)}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {client.first_name} {client.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      Added {formatDate(client.created_at)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.personal_address ? (
                    <>
                      {client.personal_address}
                      {client.personal_zip_code && (
                        <><br />{client.personal_zip_code}</>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 italic">No address</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.personal_phone || (
                    <span className="text-gray-400 italic">No phone</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {client.personal_email || (
                    <span className="text-gray-400 italic">No email</span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClientClick(client.id)
                  }}
                  className="text-blue-600 hover:text-blue-900 transition-colors"
                >
                  <EyeIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
