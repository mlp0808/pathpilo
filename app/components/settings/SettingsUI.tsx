'use client'

/**
 * Settings design system — Notion-style.
 *
 * Principles (do not reintroduce cards/boxes):
 *   - Pure white background. No panels, borders-as-boxes, or shadows around
 *     groups of settings.
 *   - Structure comes from TYPE and DIVIDERS, not containers. A section is a
 *     small heading with a hairline rule under it, followed by rows.
 *   - Each row puts the label + helper text on the LEFT (max ~60% width) and a
 *     compact control on the RIGHT. `justify-between` leaves open space between
 *     them — controls must not stretch to fill the row.
 *   - Colour is black / white / grey only. Green is reserved for "active"
 *     switches and a few important, obviously-clickable actions (e.g. Edit) —
 *     as text or a thin border, never a filled block.
 *   - Helper text is small and grey so it never competes with the label.
 */

import { useEffect, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** Scroll past this (px) before the bottom save banner appears. */
const SAVE_BANNER_SCROLL_PX = 72

// ─────────────────────────────────────────────────────────────────────────────
// Page header — large title + one muted line. No divider of its own; the first
// section's rule provides the separation.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-10">
      <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
        <h1 className="min-w-0 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {action && <div className="flex flex-shrink-0 items-center gap-2 pt-0.5 sm:gap-3">{action}</div>}
      </div>
      {description && (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500 sm:max-w-[60%]">{description}</p>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Save — compact top-right control + scroll-triggered bottom banner (mobile-friendly).
// Buttons stay visible but only clickable when `dirty`.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSaveButton({
  dirty,
  saving = false,
  onSave,
  label = 'Save',
  savingLabel = 'Saving…',
  className = '',
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  label?: string
  savingLabel?: string
  className?: string
}) {
  const canSave = dirty && !saving
  return (
    <button
      type="button"
      onClick={() => {
        if (canSave) onSave()
      }}
      disabled={!canSave}
      aria-disabled={!canSave}
      className={`inline-flex h-8 items-center justify-center rounded-md px-2.5 text-[13px] font-medium transition-colors ${
        canSave
          ? 'bg-gray-900 text-white hover:bg-black'
          : 'cursor-not-allowed bg-gray-100 text-gray-400'
      } ${className}`}
    >
      {saving ? savingLabel : label}
    </button>
  )
}

/**
 * Fixed bottom bar that appears after a short scroll. Save sits bottom-right;
 * only enabled when there are unsaved changes.
 */
export function SettingsScrollSaveBanner({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  label = 'Save',
  savingLabel = 'Saving…',
  unsavedLabel = 'Unsaved changes',
  discardLabel = 'Discard',
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => void
  onDiscard?: () => void
  label?: string
  savingLabel?: string
  unsavedLabel?: string
  discardLabel?: string
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SAVE_BANNER_SCROLL_PX)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm lg:left-[200px]">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <p className={`min-w-0 truncate text-[12px] ${dirty ? 'text-gray-600' : 'text-transparent'}`}>
          {dirty ? unsavedLabel : '—'}
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          {onDiscard && dirty ? (
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="text-[12px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
            >
              {discardLabel}
            </button>
          ) : null}
          <SettingsSaveButton
            dirty={dirty}
            saving={saving}
            onSave={onSave}
            label={label}
            savingLabel={savingLabel}
          />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — a small heading with a hairline rule beneath it, then rows.
// No box. `disabled` dims + blocks the body when a section is temporarily locked.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSection({
  title,
  description,
  action,
  children,
  disabled = false,
  className = '',
}: {
  title?: string
  description?: string
  action?: ReactNode
  children?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <section className={`mt-16 ${className}`} aria-disabled={disabled || undefined}>
      {(title || description || action) && (
        <div className="mb-1 flex items-end justify-between gap-6 border-b border-gray-200 pb-3">
          <div className="min-w-0 max-w-[60%]">
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{description}</p>
            )}
          </div>
          {action && <div className="flex flex-shrink-0 items-center">{action}</div>}
        </div>
      )}
      <div className={disabled ? 'pointer-events-none select-none opacity-40' : ''}>{children}</div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row — label/help on the left, control on the right. Hairline divider below.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsRow({
  title,
  description,
  htmlFor,
  control,
  children,
  className = '',
}: {
  title: ReactNode
  description?: ReactNode
  htmlFor?: string
  control?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 border-b border-gray-100 py-3.5 last:border-b-0 ${className}`}
    >
      <div className="max-w-[60%] min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
          {title}
        </label>
        {description && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{description}</p>
        )}
      </div>
      <div className="ml-8 flex flex-shrink-0 items-center">{control ?? children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Field — stacked label + full-width control. Use when an input/textarea needs
// the width (long text, payment terms, etc.). Hairline divider below.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsField({
  title,
  description,
  htmlFor,
  children,
  className = '',
}: {
  title?: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`border-b border-gray-100 py-4 last:border-b-0 ${className}`}>
      {(title || description) && (
        <div className="mb-2">
          {title && (
            <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
              {title}
            </label>
          )}
          {description && <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

/** Standalone hairline divider. */
export function SettingsDivider({ className = '' }: { className?: string }) {
  return <div className={`border-t border-gray-100 ${className}`} />
}

/** Small, muted helper line. Use under inputs for hints. */
export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[13px] leading-snug text-gray-500">{children}</p>
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle — green when active (the one sanctioned use of colour), grey when off.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsToggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-10 flex-shrink-0 items-center rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-accent-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs — quiet, single hairline border, neutral focus. Small by default.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsLabel({
  children,
  htmlFor,
}: {
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-800">
      {children}
    </label>
  )
}

const inputBase =
  'w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500'

export function SettingsInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...props} />
}

export function SettingsTextarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputBase} ${className}`} {...props} />
}

/** Native select styled to match the inputs. */
export function SettingsSelect({
  className = '',
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`${inputBase} ${className}`} {...(props as Record<string, unknown>)}>
      {children}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons
//   primary  → solid near-black (main save actions)
//   secondary→ thin neutral border
//   edit     → green text + thin green border, transparent (clearly clickable)
//   ghost    → plain text
// ─────────────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'edit' | 'ghost'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-gray-900 text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed',
  secondary:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed',
  edit:
    'border border-accent-500/40 bg-transparent text-accent-700 hover:bg-accent-50/60 disabled:opacity-40 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed',
}

export function SettingsButton({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...props
}: {
  variant?: ButtonVariant
} & InputHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type as 'button' | 'submit' | 'reset'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${buttonVariants[variant]} ${className}`}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status notes — text only. Saved = muted grey, error = restrained red.
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSavedNote({ children }: { children: ReactNode }) {
  return <span className="text-sm text-gray-500">{children}</span>
}

export function SettingsErrorNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-red-600">{children}</p>
}
