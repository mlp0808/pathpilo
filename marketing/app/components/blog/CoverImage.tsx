'use client'

import Image from 'next/image'
import { useState } from 'react'

/**
 * Cover image with a graceful, branded gradient fallback. Uses next/image for
 * local assets; falls back to gradient on missing src or load failure.
 */
export default function CoverImage({
  src,
  alt,
  color = '#193434',
  className = '',
  label,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 720px',
}: {
  src?: string
  alt?: string
  color?: string
  className?: string
  /** Short text shown on the gradient fallback (e.g. category label). */
  label?: string
  sizes?: string
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

  const isSvg = src.endsWith('.svg')

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt || ''}
        fill
        className="object-cover"
        sizes={sizes}
        unoptimized={isSvg}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
