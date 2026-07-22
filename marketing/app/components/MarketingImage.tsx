'use client'

import { useState } from 'react'

/**
 * Marketing image slot with a self-documenting grey placeholder.
 *
 * If the file at `src` is missing or fails to load, shows a grey box with:
 * - target filename (upload here, no code change needed)
 * - pixel dimensions to create
 *
 * Prefer `.webp` for photos; PNG is fine for sharp UI screenshots.
 * Drop files into `public/images/features/` (or the folder shown on the box).
 */
export default function MarketingImage({
  src,
  alt,
  width,
  height,
  className = '',
  imgClassName = 'h-auto w-full object-cover',
  rounded = 'rounded-2xl',
  priority = false,
  /** Stretch to fill parent (use with absolute inset-0 parent). */
  fill = false,
}: {
  /** Public path, e.g. `/images/features/window-cleaning-software-midpage.webp` */
  src?: string | null
  alt: string
  width: number
  height: number
  className?: string
  imgClassName?: string
  rounded?: string
  priority?: boolean
  fill?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const filename = src ? src.split('/').pop() || src : 'name-me.webp'
  const folder = src ? src.replace(/\/[^/]+$/, '') : '/images/features'
  const showPlaceholder = !src || failed

  if (showPlaceholder) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 border border-gray-300 bg-gray-200 px-4 text-center ${rounded} ${
          fill ? 'absolute inset-0 h-full w-full' : 'w-full'
        } ${className}`}
        style={fill ? undefined : { aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`Placeholder: ${filename}, ${width}×${height}`}
      >
        <span className="font-mono text-sm font-semibold text-gray-700 sm:text-base">{filename}</span>
        <span className="font-mono text-xs text-gray-500 sm:text-sm">
          {width} × {height} px
        </span>
        <span className="mt-1 max-w-[18rem] text-[11px] leading-snug text-gray-500">
          Upload to <span className="font-medium text-gray-600">public{folder}</span>
        </span>
      </div>
    )
  }

  return (
    <div className={`overflow-hidden ${rounded} ${fill ? 'absolute inset-0 h-full w-full' : ''} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        className={fill ? `h-full w-full object-cover ${imgClassName}` : imgClassName}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
