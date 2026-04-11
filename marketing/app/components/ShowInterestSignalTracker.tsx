'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { pushShowInterestEvent } from '../lib/dataLayer'

const MIN_MS = 30_000

/**
 * One-time dataLayer event `show_interest` when the user has been on the page for more than 30s
 * and has performed at least one scroll or click (whichever comes first counts as interaction).
 * Re-initializes on each client navigation so each page can emit at most once.
 */
export function ShowInterestSignalTracker() {
  const pathname = usePathname()
  const startRef = useRef<number>(0)
  const interactionRef = useRef(false)
  const firedRef = useRef(false)
  const firstInteractionRef = useRef<'scroll' | 'click' | null>(null)

  useEffect(() => {
    startRef.current = Date.now()
    interactionRef.current = false
    firedRef.current = false
    firstInteractionRef.current = null

    const cleanupFns: Array<() => void> = []

    const tryEmit = () => {
      if (firedRef.current) return
      if (!interactionRef.current) return
      const elapsed = Date.now() - startRef.current
      if (elapsed < MIN_MS) return

      firedRef.current = true
      pushShowInterestEvent({
        page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        interaction: firstInteractionRef.current ?? undefined,
      })

      for (const fn of cleanupFns) {
        try {
          fn()
        } catch {
          // ignore
        }
      }
    }

    const markScroll = () => {
      if (interactionRef.current) return
      interactionRef.current = true
      firstInteractionRef.current = 'scroll'
      tryEmit()
    }

    const markClick = () => {
      if (interactionRef.current) return
      interactionRef.current = true
      firstInteractionRef.current = 'click'
      tryEmit()
    }

    const onScroll = () => {
      markScroll()
    }

    window.addEventListener('scroll', onScroll, { passive: true, once: true })
    cleanupFns.push(() => window.removeEventListener('scroll', onScroll))

    document.addEventListener('click', markClick, { capture: true })
    cleanupFns.push(() => document.removeEventListener('click', markClick, { capture: true }))

    const id = window.setTimeout(() => tryEmit(), MIN_MS)
    cleanupFns.push(() => window.clearTimeout(id))

    return () => {
      window.clearTimeout(id)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', markClick, { capture: true })
    }
  }, [pathname])

  return null
}
