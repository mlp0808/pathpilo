'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { IndustryTestimonial } from '../../lib/industries/types'

const CYCLE_MS = 6000

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function TestimonialsCarousel({ items }: { items: IndustryTestimonial[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = items.length
  const go = useCallback((i: number) => setActive(((i % n) + n) % n), [n])

  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (paused || n <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timer.current = setInterval(() => setActive((i) => (i + 1) % n), CYCLE_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [paused, n])

  return (
    <div
      className="relative mx-auto max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-3xl border border-primary-100 bg-white p-8 shadow-xl sm:p-12">
        <svg
          className="absolute right-8 top-6 h-16 w-16 text-accent-500/15"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M9.5 6C6.5 6 4 8.5 4 11.5V18h6.5v-6.5H7.5C7.5 9.6 8.4 8.5 10 8.5V6zm10 0c-3 0-5.5 2.5-5.5 5.5V18H20v-6.5h-3C17 9.6 17.9 8.5 19.5 8.5V6z" />
        </svg>

        <div className="min-h-[150px]">
          {items.map((t, i) => (
            <blockquote
              key={t.name}
              className={`transition-all duration-500 ${
                i === active ? 'opacity-100' : 'pointer-events-none absolute inset-0 p-8 opacity-0 sm:p-12'
              }`}
              aria-hidden={i !== active}
            >
              <p className="text-lg leading-relaxed text-primary-800 sm:text-xl">“{t.quote}”</p>
              <footer className="mt-6 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-800 text-sm font-bold text-white">
                  {initials(t.name)}
                </span>
                <span>
                  <span className="block font-semibold text-primary-800">{t.name}</span>
                  <span className="block text-sm text-gray-500">
                    {t.role}
                    {t.location ? ` · ${t.location}` : ''}
                  </span>
                </span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(active - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-200 bg-white text-primary-800 transition hover:border-accent-400 hover:text-accent-700"
          aria-label="Previous testimonial"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex gap-2">
          {items.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to testimonial ${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${
                i === active ? 'w-7 bg-accent-500' : 'w-2.5 bg-primary-200 hover:bg-primary-300'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(active + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-200 bg-white text-primary-800 transition hover:border-accent-400 hover:text-accent-700"
          aria-label="Next testimonial"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
