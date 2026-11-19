'use client'

import { useEffect, useRef } from 'react'

/** A short burst of fireworks over the whole screen, then it tidies itself away. */
export default function GuideFireworks({ duration = 3800, onDone }: { duration?: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doneRef.current()
      return
    }
    let cancelled = false
    let stop: (() => void) | null = null
    let timer = 0

    import('fireworks-js').then(({ Fireworks }) => {
      if (cancelled || !ref.current) return
      const fireworks = new Fireworks(ref.current, {
        autoresize: true,
        opacity: 0.5,
        acceleration: 1.04,
        friction: 0.97,
        gravity: 1.4,
        particles: 70,
        traceLength: 3,
        traceSpeed: 10,
        explosion: 6,
        intensity: 38,
        flickering: 40,
        lineStyle: 'round',
        hue: { min: 0, max: 360 },
        delay: { min: 20, max: 40 },
        rocketsPoint: { min: 25, max: 75 },
        lineWidth: { explosion: { min: 1.5, max: 3.5 }, trace: { min: 1, max: 2 } },
        brightness: { min: 55, max: 80 },
        decay: { min: 0.015, max: 0.03 },
        mouse: { click: false, move: false, max: 1 },
        sound: { enabled: false },
      })
      fireworks.start()
      fireworks.launch(6)
      stop = () => fireworks.stop(true)
      timer = window.setTimeout(() => {
        fireworks.waitStop(true).then(() => {
          if (!cancelled) doneRef.current()
        })
      }, duration)
    })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stop?.()
    }
  }, [duration])

  return <div ref={ref} className="pointer-events-none fixed inset-0 z-[170]" aria-hidden />
}
