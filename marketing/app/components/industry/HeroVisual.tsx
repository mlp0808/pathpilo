'use client'

import MarketingImage from '../MarketingImage'

/**
 * Industry hero visual — uses MarketingImage so missing files show
 * filename + dimensions for easy uploads.
 */
export default function HeroVisual({
  src,
  alt,
  width = 1200,
  height = 900,
}: {
  src?: string
  alt: string
  width?: number
  height?: number
}) {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-primary-800/[0.04] blur-2xl md:-inset-6"
        aria-hidden
      />
      <MarketingImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority
        rounded="rounded-2xl md:rounded-3xl"
        imgClassName="relative h-auto w-full object-cover shadow-xl"
        className="relative shadow-xl"
      />
    </div>
  )
}
