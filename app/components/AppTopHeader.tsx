'use client'

/**
 * Global top header. Sits above every page as a thin, transparent strip:
 * breadcrumbs on the left, then search / quick add / account on the right.
 * It only grows a frosted background once the page scrolls under it, so at
 * rest it reads as part of the page rather than a second chrome bar.
 */

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bars3Icon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { clearClientLocaleStorage } from '../i18n'
import { isOverwatchActive, stopOverwatchSession } from '../utils/overwatch'
import AppBreadcrumbs from './AppBreadcrumbs'
import QuickAddMenu from './QuickAddMenu'
import SidebarAccountPanel from './SidebarAccountPanel'
import MapSearch from './map/MapSearch'
import { MAP_ADD_TO_ROUTE_EVENT, MAP_SEARCH_PICK_EVENT, modeToQuery } from './map/mapMode'
import { dispatchOpenOverlay } from './map/mapOverlays'

interface AppTopHeaderProps {
  companySlug: string
  userName: string
  companyName: string
  onOpenMobileNav: () => void
  /** Extra classes on the bar itself, e.g. hiding it on the full-bleed map. */
  className?: string
}

export default function AppTopHeader({
  companySlug,
  userName,
  companyName,
  onOpenMobileNav,
  className = '',
}: AppTopHeaderProps) {
  const { t } = useAppI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [scrolled, setScrolled] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [overwatchActive, setOverwatchActive] = useState(false)
  /** Address handed over from elsewhere, e.g. "see this lead on the map". */
  const [handoffQuery, setHandoffQuery] = useState('')

  // On the map planner (day/route), search rows offer "Add to route".
  const mapFocus = searchParams.get('focus')
  const mapDate = searchParams.get('date')
  const mapUserIdRaw = searchParams.get('userId')
  const mapUserId = mapUserIdRaw != null ? Number(mapUserIdRaw) : null
  const canAddToRoute =
    !!pathname?.endsWith('/map') &&
    (mapFocus === 'day' || mapFocus === 'route') &&
    !!mapDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(mapDate)

  const dispatchAddToRoute = (detail: {
    clientId?: number
    newClient?: {
      name?: string
      address?: string
      zip_code?: string
      city?: string
      lat?: number | null
      lng?: number | null
    }
  }) => {
    if (!mapDate) return
    window.dispatchEvent(new CustomEvent(MAP_ADD_TO_ROUTE_EVENT, {
      detail: {
        date: mapDate,
        userId: mapFocus === 'route' && Number.isFinite(mapUserId) ? mapUserId : null,
        ...detail,
      },
    }))
  }

  useEffect(() => {
    setOverwatchActive(isOverwatchActive())
  }, [])

  useEffect(() => {
    if (!pathname?.endsWith('/map')) {
      setHandoffQuery('')
      return
    }
    const params = new URLSearchParams(window.location.search)
    setHandoffQuery(params.get('focus') ? '' : params.get('q') || '')
  }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('pathpilo_video_guide_dismissed')
    window.location.href = '/'
  }

  const handleQuitOverwatch = () => {
    const restored = stopOverwatchSession()
    if (!restored) {
      alert('No active overwatch session found.')
      return
    }
    window.location.href = '/admin/companies'
  }

  const mapBase = companySlug ? `/${companySlug}/map` : '/map'
  const onMapPage = !!pathname?.endsWith('/map')

  const searchField = (
    <MapSearch
      // Remount so a fresh handover actually lands in the field.
      key={handoffQuery}
      compact
      initialQuery={handoffQuery}
      placeholder={t('app.header.searchPlaceholder', 'Find a client or address…')}
      onPickClient={client => {
        setMobileSearchOpen(false)
        window.dispatchEvent(new Event(MAP_SEARCH_PICK_EVENT))
        const coords =
          client.lat != null && client.lng != null
          && Number.isFinite(Number(client.lat)) && Number.isFinite(Number(client.lng))
            ? { lat: Number(client.lat), lng: Number(client.lng) }
            : {}
        if (onMapPage) {
          dispatchOpenOverlay({
            kind: 'client',
            clientId: client.id,
            name: client.name,
            last_name: client.last_name,
            address: client.address,
            zip_code: client.zip_code,
            city: client.city,
            lat: coords.lat ?? client.lat,
            lng: coords.lng ?? client.lng,
            client_type: client.client_type,
          })
          return
        }
        router.push(`${mapBase}${modeToQuery({
          kind: 'client',
          clientId: client.id,
          ...coords,
        })}`)
      }}
      onPickLocation={loc => {
        setMobileSearchOpen(false)
        window.dispatchEvent(new Event(MAP_SEARCH_PICK_EVENT))
        if (onMapPage) {
          dispatchOpenOverlay({
            kind: 'location',
            lat: loc.lat,
            lng: loc.lng,
            label: loc.label,
            address: loc.address,
            zip_code: loc.zip_code,
            city: loc.city,
          })
          return
        }
        router.push(
          `${mapBase}${modeToQuery({
            kind: 'location',
            lat: loc.lat,
            lng: loc.lng,
            label: loc.label,
            address: loc.address,
            zip_code: loc.zip_code,
            city: loc.city,
          })}`,
        )
      }}
      onAddToRouteClient={
        canAddToRoute
          ? (client) => {
              setMobileSearchOpen(false)
              dispatchAddToRoute({ clientId: client.id })
            }
          : undefined
      }
      onAddToRouteLocation={
        canAddToRoute
          ? (loc) => {
              setMobileSearchOpen(false)
              dispatchAddToRoute({
                newClient: {
                  address: loc.address || loc.label,
                  zip_code: loc.zip_code,
                  city: loc.city,
                  lat: loc.lat,
                  lng: loc.lng,
                },
              })
            }
          : undefined
      }
    />
  )

  return (
    <header
      className={`sticky top-0 z-40 pt-safe transition-colors duration-200 ${
        scrolled
          ? 'bg-white/65 backdrop-blur-xl border-b border-gray-900/[0.07]'
          : 'bg-transparent border-b border-transparent'
      } ${className}`}
    >
      <div className="h-14 flex items-center gap-2 px-4 sm:px-6 lg:px-[40px]">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden -ml-1.5 flex-shrink-0 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900"
          aria-label={t('app.layout.openMenu', 'Open menu')}
        >
          <Bars3Icon className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <AppBreadcrumbs />
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden md:block w-56 lg:w-72">{searchField}</div>

          <button
            type="button"
            onClick={() => setMobileSearchOpen(v => !v)}
            className="md:hidden rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900"
            aria-label={t('app.header.search', 'Search')}
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? (
              <XMarkIcon className="h-5 w-5" />
            ) : (
              <MagnifyingGlassIcon className="h-5 w-5" />
            )}
          </button>

          <QuickAddMenu companySlug={companySlug} />

          <div className="ml-0.5 h-6 w-px bg-gray-900/[0.08]" aria-hidden />

          <SidebarAccountPanel
            placement="header"
            companyName={companyName}
            userName={userName}
            companySlug={companySlug}
            overwatchActive={overwatchActive}
            onLogout={handleLogout}
            onQuitOverwatch={handleQuitOverwatch}
          />
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="md:hidden px-4 pb-3 sm:px-6">{searchField}</div>
      )}
    </header>
  )
}
