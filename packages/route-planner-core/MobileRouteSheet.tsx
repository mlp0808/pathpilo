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
  toolbar,
  footer,
  snapPoints = [0.16, 0.55, 0.94],
  initialSnap = 1,
}: {
  children: ReactNode
  /** Pinned above the footer — e.g. save route (slides in above day picker) */
  toolbar?: ReactNode
  /** Pinned to the bottom of the screen — e.g. week day picker */
  footer?: ReactNode
  snapPoints?: number[]
  initialSnap?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
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
    () => panelH * (1 - snapPoints[snapPoints.length - 1]),
    [panelH, snapPoints],
  )
  const maxT = useMemo(
    () => panelH * (1 - snapPoints[0]),
    [panelH, snapPoints],
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
    if (panelH === 0) return
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
        {/* Grab handle — the drag zone */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none touch-none"
          role="button"
          aria-label="Drag to resize"
        >
          <div className="h-1 w-9 rounded-full bg-gray-300/90 transition-colors" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
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
