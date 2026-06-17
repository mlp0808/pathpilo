'use client'

import { useState } from 'react'

/**
 * Cover image with a graceful, branded gradient fallback. If `src` is missing
 * or fails to load, we render a category-coloured gradient instead of a broken
 * image — so authors can publish without always supplying artwork.
 */
export default function CoverImage({
  src,
  alt,
  color = '#193434',
  className = '',
  label,
}: {
  src?: string
  alt?: string
  color?: string
  className?: string
  /** Short text shown on the gradient fallback (e.g. category label). */
  label?: string
}) {
  const [failed, setFailed] = useState(false)
  const showFallback = !src || failed

  if (showFallback) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden ${className}`}
        style={{ background: `linear-gradient(135deg, ${color} 0%, #0d2020 100%)` }}
        aria-hidden
      >
        <span className="px-4 text-center text-sm font-semibold uppercase tracking-widest text-white/70">
          {label || 'PathPilo'}
        </span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ''}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
