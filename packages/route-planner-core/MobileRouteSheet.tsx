'use client'

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * Draggable bottom sheet for the mobile route planner.
 *
 * The sheet sits over a full-bleed map and can be pulled up/down between
 * snap points. Dragging is handled from the grab handle / header strip so the
 * inner content keeps its own scroll. Releasing snaps to the nearest point,
 * with velocity-aware flicking for a native feel.
 *
 * Toolbar + footer are pinned to the viewport bottom and never translated,
 * so expanding controls (e.g. save bar) cannot push them off-screen.
 *
 * `snapPoints` are the fraction of the parent container that should be VISIBLE
 * at each stop, ascending (e.g. 0.16 = peek, 0.55 = half, 0.94 = full).
 */
export default function MobileRouteSheet({
  children,
  header,
  toolbar,
  footer,
  snapPoints = [0.16, 0.55, 0.94],
  initialSnap = 1,
  topInset = 0,
}: {
  children: ReactNode
  /** Fixed chrome below the grab bar (toolbar, stats) — does not scroll away. */
  header?: ReactNode
  /** Pinned above the footer — e.g. save route (slides in above day picker) */
  toolbar?: ReactNode
  /** Pinned to the bottom of the screen — e.g. week day picker */
  footer?: ReactNode
  snapPoints?: number[]
  initialSnap?: number
  /** Keep the sheet top below floating UI (e.g. map search bar). */
  topInset?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerH, setContainerH] = useState(0)
  const [bottomChromeH, setBottomChromeH] = useState(0)
  const [snap, setSnap] = useState(
    Math.min(Math.max(initialSnap, 0), snapPoints.length - 1),
  )
  // While actively dragging this holds the live translateY (px). null = settled.
  const [dragTranslate, setDragTranslate] = useState<number | null>(null)
  const drag = useRef<{
    startY: number
    startT: number
    lastY: number
    lastTime: number
    velocity: number
  } | null>(null)

  // Measure the parent (map) container so snap offsets track its real height.
  useEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const measure = () => setContainerH(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Bottom chrome (save bar + day picker) stays fixed — track its height for snap math.
  useEffect(() => {
    const el = chromeRef.current
    if (!el) {
      setBottomChromeH(0)
      return
    }
    const measure = () => setBottomChromeH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [toolbar, footer])

  const panelH = Math.max(0, containerH - bottomChromeH)

  const translateForSnap = useCallback(
    (i: number) => panelH * (1 - snapPoints[i]),
    [panelH, snapPoints],
  )

  const minT = useMemo(
    () => Math.max(topInset, panelH * (1 - snapPoints[snapPoints.length - 1])),
    [panelH, snapPoints, topInset],
  )
  const maxT = useMemo(
    () => panelH * (1 - snapPoints[0]),
    [panelH, snapPoints],
  )

  const clampedTranslateForSnap = useCallback(
    (i: number) => {
      const raw = translateForSnap(i)
      return Math.min(maxT, Math.max(minT, raw))
    },
    [translateForSnap, minT, maxT],
  )

  const settledTranslate = clampedTranslateForSnap(snap)
  const currentTranslate = dragTranslate != null ? dragTranslate : settledTranslate

  const nearestSnap = useCallback(
    (t: number) => {
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < snapPoints.length; i++) {
        const d = Math.abs(t - clampedTranslateForSnap(i))
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
      return best
    },
    [snapPoints, clampedTranslateForSnap],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (panelH === 0) return
    const t = clampedTranslateForSnap(snap)
    drag.current = {
      startY: e.clientY,
      startT: t,
      lastY: e.clientY,
      lastTime: performance.now(),
      velocity: 0,
    }
    setDragTranslate(t)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  /** Don't steal drags from buttons, links, inputs, or explicitly opted-out rows. */
  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    return !!target.closest(
      'button, a, input, textarea, select, [role="button"], [data-no-sheet-drag]',
    )
  }

  /**
   * When the list is scrolled to the top, pulling down anywhere in the scroll
   * area (except buttons) should resize the sheet — not just the tiny grab bar.
   */
  const onScrollAreaPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current
    if (!el || el.scrollTop > 2 || isInteractiveTarget(e.target)) return
    onPointerDown(e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.startY
    let next = drag.current.startT + dy
    // Rubber-band past the bounds for a soft, springy edge.
    if (next < minT) next = minT - (minT - next) * 0.4
    if (next > maxT) next = maxT + (next - maxT) * 0.4

    const now = performance.now()
    const dt = now - drag.current.lastTime
    if (dt > 0) drag.current.velocity = (e.clientY - drag.current.lastY) / dt
    drag.current.lastY = e.clientY
    drag.current.lastTime = now
    setDragTranslate(next)
  }

  const endDrag = () => {
    if (!drag.current) return
    const v = drag.current.velocity // px/ms; + = downward (collapse)
    const t = dragTranslate ?? settledTranslate
    let target = nearestSnap(t)
    const FLICK = 0.45
    if (v > FLICK) target = Math.max(0, nearestSnap(t) - 1)
    else if (v < -FLICK) target = Math.min(snapPoints.length - 1, nearestSnap(t) + 1)
    drag.current = null
    setSnap(target)
    setDragTranslate(null)
  }

  return (
    <div
      ref={wrapRef}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end pointer-events-none"
    >
      {/* Sliding panel — only handle + scrollable jobs list */}
      <div
        className="pointer-events-auto flex flex-col overflow-hidden rounded-t-[26px] bg-[#F8F9FB]"
        style={{
          height: panelH || undefined,
          minHeight: panelH > 0 ? undefined : '40%',
          transform: `translateY(${currentTranslate}px)`,
          transition: dragTranslate == null
            ? 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'none',
          willChange: 'transform',
          boxShadow: '0 -8px 40px rgba(15, 30, 22, 0.18), 0 -1px 0 rgba(255,255,255,0.6) inset',
        }}
      >
        {/* Grab handle + fixed header — always reachable for dragging */}
        <div
          onPointerDown={(e) => {
            if (isInteractiveTarget(e.target)) return
            onPointerDown(e)
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-shrink-0 select-none touch-none"
        >
          <div
            className="flex flex-col items-center justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing min-h-[52px]"
            aria-label="Drag to resize"
            role="button"
          >
            <div className="h-1.5 w-12 rounded-full bg-gray-300/90 shadow-sm" />
          </div>
          {header ? <div className="pointer-events-auto">{header}</div> : null}
        </div>

        <div
          ref={scrollRef}
          onPointerDown={onScrollAreaPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y"
        >
          {children}
        </div>
      </div>

      {/* Fixed bottom chrome — never translated, always flush with screen bottom */}
      {(toolbar || footer) && (
        <div
          ref={chromeRef}
          className={`pointer-events-auto flex-shrink-0 flex flex-col w-full border-t border-gray-200/80 bg-[#F8F9FB] ${
            !footer ? 'pb-[max(0.5rem,env(safe-area-inset-bottom))]' : ''
          }`}
        >
          {toolbar && (
            <div className="flex-shrink-0 bg-[#F8F9FB]">
              {toolbar}
            </div>
          )}
          {footer && (
            <div className="flex-shrink-0 border-t border-gray-200/80 bg-white">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
