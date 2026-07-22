'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Classic line reveal: content rises from below its own clip edge.
 * Stagger with `delay` (ms). Respects prefers-reduced-motion.
 */
export default function HeroRise({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'h1' | 'h2' | 'p'
}) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const id = window.setTimeout(() => setShown(true), 40)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <Tag className={`overflow-hidden ${className}`}>
      <span
        className={`block will-change-transform transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          shown ? 'translate-y-0' : 'translate-y-[110%]'
        }`}
        style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      >
        {children}
      </span>
    </Tag>
  )
}
