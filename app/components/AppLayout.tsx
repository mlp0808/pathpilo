'use client'

import { useUser } from '../hooks/useUser'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useUser()
  const pathname = usePathname()

  // Auto-detect if we're on a settings page
  const isSettingsPage = pathname.startsWith('/settings')

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
          <p className="mt-2 text-primary-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-page flex overflow-x-hidden">
      {/* Conditional Sidebar */}
      {isSettingsPage ? (
        <SettingsSidebar 
          user={user} 
          onBack={() => {
            // Navigate back to dashboard
            window.location.href = '/dashboard'
          }} 
        />
      ) : (
        <Sidebar 
          user={user} 
          onSettingsClick={() => {
            // Navigate to settings
            window.location.href = '/settings/user'
          }} 
        />
      )}
      
      {/* Main Content */}
      <div className="flex-1 ml-[200px] relative overflow-x-hidden max-w-full flex flex-col">
        <main className="px-[40px] pt-[15px] pb-[15px] overflow-x-hidden max-w-full flex-1 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}
