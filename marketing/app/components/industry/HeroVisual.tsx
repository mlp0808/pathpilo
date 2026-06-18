'use client'

import { useState } from 'react'

/**
 * Hero image with a graceful, on-brand fallback. If the photo at `src` is
 * missing, we render a built-in illustration (phone + round map) so the page
 * always looks finished — drop a real image at the path later to override.
 */
export default function HeroVisual({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(!src)

  if (!failed && src) {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-accent-500/10 blur-2xl" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="relative h-auto w-full rounded-3xl shadow-2xl"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }

  // Fallback illustration: a phone showing the round over a soft map.
  return (
    <div className="relative mx-auto w-full max-w-md" role="img" aria-label={alt}>
      <div className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-accent-500/15 blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[2.5rem] border-[6px] border-[#0d1f1f] bg-[#f4f7f6] shadow-2xl">
        <div className="flex items-center justify-between bg-[#0d1f1f] px-5 py-3">
          <span className="text-sm font-bold text-white">Today’s round</span>
          <span className="rounded-full bg-accent-500/20 px-2.5 py-1 text-xs font-semibold text-accent-300">
            6 jobs · 9.1 mi
          </span>
        </div>
        <svg viewBox="0 0 380 300" className="h-auto w-full">
          <defs>
            <pattern id="heroGrid" width="38" height="38" patternUnits="userSpaceOnUse">
              <path d="M38 0H0V38" fill="none" stroke="#193434" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="380" height="300" fill="url(#heroGrid)" />
          {(() => {
            const stops = [
              [50, 180],
              [110, 90],
              [200, 60],
              [290, 110],
              [320, 210],
              [210, 250],
            ] as const
            const path = stops.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
            return (
              <>
                <path d={path} fill="none" stroke="#3DD57A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {stops.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r="15" fill="#193434" />
                    <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">
                      {i + 1}
                    </text>
                  </g>
                ))}
              </>
            )
          })()}
        </svg>
        <div className="space-y-2 bg-white p-4">
          <div className="flex items-center justify-between rounded-xl bg-primary-50 px-3.5 py-2.5">
            <span className="text-sm font-semibold text-primary-800">Next: 14 Oakfield Road</span>
            <span className="text-xs font-semibold text-accent-700">£18</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-accent-500 px-3.5 py-2.5">
            <span className="text-sm font-semibold text-white">Reminder sent to customer</span>
            <span className="text-xs font-semibold text-white/90">✓</span>
          </div>
        </div>
      </div>
    </div>
  )
}
