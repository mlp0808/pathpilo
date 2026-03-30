'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  label?: string
  minTime?: string
}

/**
 * Custom time picker that avoids the native browser time input.
 * Shows a text input + a 30-minute-interval grid dropdown rendered via portal.
 */
export default function TimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'e.g. 09:00',
  className = '',
  label,
  minTime,
}: TimePickerProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!showPicker || !triggerRef.current) {
      setRect(null)
      return
    }
    const el = triggerRef.current
    const update = () => setRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showPicker])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        !target.closest('[data-time-picker-trigger]') &&
        !target.closest('[data-time-picker-dropdown]')
      ) {
        setShowPicker(false)
      }
    }
    if (showPicker) {
      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [showPicker])

  const times = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2)
    const m = (i % 2) * 30
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  })

  const minMinutes = (() => {
    if (!minTime) return -1
    const parts = minTime.split(':')
    if (parts.length < 2) return -1
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
  })()

  return (
    <div data-time-picker-trigger ref={triggerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-primary-700 mb-2">{label}</label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => !disabled && setShowPicker(true)}
        onClick={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      />
      {typeof document !== 'undefined' && showPicker && rect && createPortal(
        <div
          data-time-picker-dropdown
          className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white shadow-2xl"
          style={{
            position: 'fixed',
            top: rect.bottom + 6,
            left: rect.left,
            width: Math.max(rect.width, 240),
            zIndex: 9999,
          }}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {times.map((t) => {
              const tMinutes = parseInt(t.split(':')[0], 10) * 60 + parseInt(t.split(':')[1], 10)
              const isDisabled = minMinutes >= 0 && tMinutes <= minMinutes
              return (
                <button
                  key={t}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => { if (!isDisabled) { onChange(t); setShowPicker(false) } }}
                  className={`px-2 py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    isDisabled
                      ? 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                      : value === t
                        ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30 ring-2 ring-accent-300'
                        : 'bg-white text-gray-700 hover:bg-accent-50 border border-gray-200 hover:border-accent-200'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
