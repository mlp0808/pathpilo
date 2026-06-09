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
 * `snapPoints` are the fraction of the parent container that should be VISIBLE
 * at each stop, ascending (e.g. 0.16 = peek, 0.55 = half, 0.94 = full).
 */
export default function MobileRouteSheet({
  children,
  footer,
  snapPoints = [0.16, 0.55, 0.94],
  initialSnap = 1,
}: {
  children: ReactNode
  /** Pinned to the bottom of the sheet — e.g. week day picker */
  footer?: ReactNode
  snapPoints?: number[]
  initialSnap?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerH, setContainerH] = useState(0)
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

  const translateForSnap = useCallback(
    (i: number) => containerH * (1 - snapPoints[i]),
    [containerH, snapPoints],
  )

  const minT = useMemo(
    () => containerH * (1 - snapPoints[snapPoints.length - 1]),
    [containerH, snapPoints],
  )
  const maxT = useMemo(
    () => containerH * (1 - snapPoints[0]),
    [containerH, snapPoints],
  )

  const settledTranslate = translateForSnap(snap)
  const currentTranslate = dragTranslate != null ? dragTranslate : settledTranslate

  const nearestSnap = useCallback(
    (t: number) => {
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < snapPoints.length; i++) {
        const d = Math.abs(t - translateForSnap(i))
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
      return best
    },
    [snapPoints, translateForSnap],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (containerH === 0) return
    const t = translateForSnap(snap)
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

  const isFull = snap === snapPoints.length - 1 && dragTranslate == null

  return (
    <div
      ref={wrapRef}
      className="absolute inset-x-0 bottom-0 z-30 touch-none"
      style={{
        height: containerH || '60%',
        transform: `translateY(${currentTranslate}px)`,
        transition: dragTranslate == null
          ? 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'none',
        willChange: 'transform',
      }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-t-[26px] bg-[#F8F9FB]"
        style={{
          boxShadow: '0 -8px 40px rgba(15, 30, 22, 0.18), 0 -1px 0 rgba(255,255,255,0.6) inset',
        }}
      >
        {/* Grab handle — the drag zone */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
          role="button"
          aria-label="Drag to resize"
        >
          <div className="h-1 w-9 rounded-full bg-gray-300/90 transition-colors" />
        </div>

        {/* Content — scrolls independently; locked unless fully expanded so a
            drag on the list pulls the sheet instead of scrolling mid-height. */}
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={{ overflow: isFull ? 'visible' : 'hidden' }}
        >
          {children}
        </div>

        {/* Fixed footer — stays pinned at the bottom of the sheet */}
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200/80 bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
