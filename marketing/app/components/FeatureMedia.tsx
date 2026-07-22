'use client'

import MarketingImage from './MarketingImage'

/**
 * Feature-page media slot. Missing files show a grey box with filename + size.
 * Soft border + shadow so white UI screenshots don’t disappear on white pages.
 */
export default function FeatureMedia({
  src,
  alt,
  className = '',
  priority = false,
  width = 1600,
  height = 1000,
}: {
  src?: string | null
  alt: string
  className?: string
  priority?: boolean
  width?: number
  height?: number
  /** @deprecated unused — placeholder shows filename from src */
  label?: string
}) {
  return (
    <MarketingImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={`border border-primary-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.08)] ${className}`}
      rounded="rounded-xl md:rounded-2xl"
      imgClassName="h-auto w-full object-contain"
    />
  )
}
