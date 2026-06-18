'use client'

import { useEffect, useRef, useState } from 'react'
import type { IndustryStat } from '../../lib/industries/types'

function useCountUp(target: number, run: boolean, durationMs = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, durationMs])
  return value
}

function StatItem({ stat, run }: { stat: IndustryStat; run: boolean }) {
  const v = useCountUp(stat.value, run)
  const rendered = stat.display ?? `${stat.prefix ?? ''}${Math.round(v)}${stat.suffix ?? ''}`
  return (
    <div className="text-center">
      <div className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">{rendered}</div>
      <div className="mx-auto mt-2 max-w-[14rem] text-sm leading-snug text-white/70 md:text-base">
        {stat.label}
      </div>
    </div>
  )
}

export default function CountUpStats({ stats }: { stats: IndustryStat[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [run, setRun] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRun(true)
            observer.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-6">
      {stats.map((s) => (
        <StatItem key={s.label} stat={s} run={run} />
      ))}
    </div>
  )
}
