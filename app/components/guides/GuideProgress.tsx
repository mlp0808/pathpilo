'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { CheckBadgeIcon, CheckIcon, TrophyIcon } from '@heroicons/react/24/solid'
import type { GuideWithProgress } from './useGuides'

/**
 * Remembers which step was completed since the last render, so the track can
 * celebrate it once. Returns the index for ~1s, then null.
 */
export function useJustCompleted(guideId: number | undefined, done: boolean[]): number | null {
  const key = done.map((d) => (d ? '1' : '0')).join('')
  const previous = useRef<{ id?: number; key: string }>({ id: guideId, key })
  const [just, setJust] = useState<number | null>(null)

  useEffect(() => {
    const prev = previous.current
    previous.current = { id: guideId, key }
    if (prev.id !== guideId) return
    const index = key.split('').findIndex((d, i) => d === '1' && prev.key[i] !== '1')
    if (index === -1) return
    setJust(index)
    const timer = window.setTimeout(() => setJust(null), 1200)
    return () => window.clearTimeout(timer)
  }, [guideId, key])

  return just
}

function Trophy({ complete, size = 'md' }: { complete: boolean; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${box} ${
        complete ? 'bg-accent-50 text-accent-600 shadow-[0_0_0_3px_rgba(16,185,129,0.16)] animate-guide-trophy' : 'bg-gray-200 text-gray-400'
      }`}
      aria-label={complete ? 'Guide complete' : 'Finish every step to complete the guide'}
    >
      <TrophyIcon className={glyph} />
    </span>
  )
}

/**
 * The banner's progress: one segment per step, filling towards a trophy.
 * A step you just finished pops once. Nothing moves while you wait.
 */
export function StepTrack({
  done,
  current,
  complete,
  justDone,
  className = '',
}: {
  done: boolean[]
  current: number
  complete: boolean
  justDone: number | null
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex flex-1 items-center gap-1">
        {done.map((d, i) => {
          const isCurrent = !complete && i === current
          return (
            <span
              key={i}
              className={`h-2.5 flex-1 rounded-full transition-colors duration-500 ${
                d ? 'bg-accent-500' : 'bg-gray-300'
              } ${isCurrent ? 'ring-2 ring-inset ring-accent-500' : ''} ${justDone === i ? 'animate-guide-pop' : ''}`}
            />
          )
        })}
      </div>
      <span className="relative">
        <Trophy complete={complete} size="sm" />
        {justDone != null && (
          <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold text-accent-600 animate-guide-float">
            +1
          </span>
        )}
      </span>
    </div>
  )
}

export interface SlideDot {
  label: string
  done: boolean
  /** The cover reads as a book, the last page stays a plain dot. */
  kind?: 'cover' | 'step' | 'finale'
}

/**
 * The guidebook's page dots: small white pebbles, the page you are on stands
 * taller, finished steps carry a tiny check. Every dot jumps to its slide.
 */
export function SlideDots({
  dots,
  index,
  onSelect,
  justDone = null,
}: {
  dots: SlideDot[]
  index: number
  onSelect: (i: number) => void
  justDone?: number | null
}) {
  return (
    <div className="flex h-9 items-center justify-center">
      {dots.map((dot, i) => {
        const active = i === index
        const cover = dot.kind === 'cover'
        const finale = dot.kind === 'finale'
        const locked = finale && !dot.done
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (!locked) onSelect(i)
            }}
            disabled={locked}
            aria-label={`${dot.label}${dot.done ? ', done' : ''}`}
            aria-current={active ? 'step' : undefined}
            title={dot.label}
            className="group flex h-9 items-center px-1.5 focus-visible:outline-none disabled:cursor-default"
          >
            {cover ? (
              <BookOpenIcon className={`h-5 w-5 ${active ? 'text-accent-600' : 'text-gray-400'}`} />
            ) : finale ? (
              <TrophyIcon className={`h-3.5 w-3.5 ${dot.done ? 'text-accent-600' : 'text-gray-300'}`} />
            ) : (
              <span
                className={`flex w-4 items-center justify-center rounded-full border shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-all duration-300 ease-out group-focus-visible:ring-2 group-focus-visible:ring-accent-300 ${
                  active ? 'h-7' : 'h-4'
                } ${
                  dot.done
                    ? 'border-accent-500 bg-accent-500'
                    : 'border-gray-300 bg-white group-hover:border-gray-400'
                } ${justDone === i ? 'animate-guide-pop' : ''}`}
              >
                {dot.done && <CheckIcon className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ProgressRing({
  done,
  total,
  size = 36,
  children,
}: {
  done: number
  total: number
  size?: number
  children?: ReactNode
}) {
  const r = (size - 4) / 2
  const circumference = 2 * Math.PI * r
  const ratio = total > 0 ? done / total : 0
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="text-accent-500 transition-all duration-500"
        />
      </svg>
      <span className="relative text-sm">{children}</span>
    </span>
  )
}

/** Every guide with its progress, like levels on a map. Picking one starts it. */
export function GuidePicker({
  guides,
  activeId,
  completed,
  onPick,
  className = '',
  flat = false,
}: {
  guides: GuideWithProgress[]
  activeId: number
  completed: number
  onPick: (id: number) => void
  className?: string
  flat?: boolean
}) {
  const visible = guides.filter((g) => g.total > 0)
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-2 ${flat ? '' : 'shadow-xl'} ${className}`}>
      <div className="px-2 pb-2.5 pt-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Guides</p>
          <p className="text-[11px] font-semibold tabular-nums text-gray-500">
            <TrophyIcon className="-mt-0.5 mr-1 inline h-3 w-3 text-accent-500" />
            {completed} of {visible.length} complete
          </p>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-700"
            style={{ width: `${visible.length ? (completed / visible.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <ul className="max-h-[min(60vh,420px)] space-y-0.5 overflow-y-auto">
        {visible.map((g) => {
          const active = g.id === activeId
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  active ? 'bg-accent-50' : 'hover:bg-gray-50'
                }`}
              >
                <ProgressRing done={g.doneCount} total={g.total}>
                  {g.icon || '📘'}
                </ProgressRing>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-gray-900">{g.title}</span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {g.complete ? 'Complete' : g.description || `${g.total} steps`}
                  </span>
                </span>
                {g.complete ? (
                  <CheckBadgeIcon className="h-5 w-5 shrink-0 text-accent-500" />
                ) : active ? (
                  <span className="shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                    Current
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-400">
                    {g.doneCount}/{g.total}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Opens a popover and closes it on outside click or Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return { open, setOpen, ref }
}

/** Next guide worth doing after this one: the next unfinished, else simply the next. */
export function neighbourGuides(guides: GuideWithProgress[], currentId: number) {
  const list = guides.filter((g) => g.total > 0)
  const at = list.findIndex((g) => g.id === currentId)
  const after = at === -1 ? [] : list.slice(at + 1)
  const next = after.find((g) => !g.complete) || after[0] || null
  const previous = at > 0 ? list[at - 1] : null
  return { next, previous }
}
