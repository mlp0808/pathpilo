'use client'

/**
 * Searchable single-select. Desktop opens an anchored popover; phones get a
 * bottom sheet so the on-screen keyboard never covers the results.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

export interface SearchableOption {
  value: string
  label: string
  /** Rendered before the label (flag emoji, icon). */
  prefix?: string
  /** Small muted line under the label. */
  hint?: string
  /** Extra terms the search should match besides the label. */
  keywords?: string[]
}

export interface SearchableGroup {
  /** Omit for the main ungrouped list. */
  label?: string
  options: SearchableOption[]
}

export default function SearchableSelect({
  value,
  groups,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  invalid = false,
  disabled = false,
  buttonClassName = '',
  ariaLabel,
  /** Custom matcher; defaults to label + keywords + value prefix. */
  matches,
}: {
  value: string
  groups: SearchableGroup[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  invalid?: boolean
  disabled?: boolean
  buttonClassName?: string
  ariaLabel?: string
  matches?: (option: SearchableOption, query: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const isSheet = useIsSmallScreen()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const allOptions = useMemo(() => groups.flatMap((g) => g.options), [groups])
  const selected = useMemo(
    () => allOptions.find((o) => o.value === value) || null,
    [allOptions, value],
  )

  const match = useCallback(
    (option: SearchableOption, q: string) => {
      if (matches) return matches(option, q)
      const needle = normalize(q)
      if (!needle) return true
      if (normalize(option.value).startsWith(needle)) return true
      if (normalize(option.label).includes(needle)) return true
      return (option.keywords || []).some((k) => normalize(k).includes(needle))
    },
    [matches],
  )

  /** Groups with non-matching options removed, plus a flat list for keyboard nav. */
  const { visibleGroups, flatVisible } = useMemo(() => {
    const vg: SearchableGroup[] = []
    const flat: SearchableOption[] = []
    for (const group of groups) {
      const options = group.options.filter((o) => match(o, query))
      if (options.length === 0) continue
      vg.push({ label: group.label, options })
      flat.push(...options)
    }
    return { visibleGroups: vg, flatVisible: flat }
  }, [groups, query, match])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  // Keep the highlighted row inside the list and in view as the query narrows.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const pick = (next: string) => {
    onChange(next)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flatVisible.length === 0) return
      setActiveIndex((i) => {
        const delta = e.key === 'ArrowDown' ? 1 : -1
        return (i + delta + flatVisible.length) % flatVisible.length
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flatVisible[activeIndex]
      if (hit) pick(hit.value)
    }
  }

  let runningIndex = -1

  const list = (
    <>
      <div className="relative border-b border-gray-100 p-2">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls={listboxId}
          className="w-full rounded-lg border border-transparent bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-accent-300 focus:bg-white"
        />
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain py-1"
      >
        {flatVisible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">{emptyLabel}</p>
        ) : (
          visibleGroups.map((group, gi) => (
            <div key={group.label || `group-${gi}`}>
              {group.label && (
                <p className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
              )}
              {group.options.map((option) => {
                runningIndex += 1
                const index = runningIndex
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(option.value)}
                    className={[
                      'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors',
                      isActive ? 'bg-accent-50' : 'bg-transparent',
                      isSelected ? 'font-semibold text-gray-900' : 'text-gray-700',
                    ].join(' ')}
                  >
                    {option.prefix && (
                      <span className="text-lg leading-none" aria-hidden>
                        {option.prefix}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {option.hint && (
                        <span className="block truncate text-xs font-normal text-gray-400">
                          {option.hint}
                        </span>
                      )}
                    </span>
                    {isSelected && <CheckIcon className="h-4 w-4 flex-none text-accent-500" />}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        className={[
          'flex w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          open
            ? 'border-accent-500 ring-2 ring-accent-500/15'
            : invalid
              ? 'border-red-300 hover:border-red-400'
              : 'border-gray-200/90 hover:border-gray-300',
          buttonClassName,
        ].join(' ')}
      >
        {selected?.prefix && (
          <span className="text-lg leading-none" aria-hidden>
            {selected.prefix}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronUpDownIcon className="h-4 w-4 flex-none text-gray-400" />
      </button>

      {/* Phones: bottom sheet, so the on-screen keyboard can't cover the list. */}
      {open && isSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{ariaLabel || placeholder}</p>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {list}
          </div>
        </>
      )}

      {open && !isSheet && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {list}
        </div>
      )}
    </div>
  )
}

/** Matches Tailwind's `sm` breakpoint; drives popover vs bottom sheet. */
function useIsSmallScreen(): boolean {
  const [small, setSmall] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setSmall(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return small
}

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
