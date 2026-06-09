'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function SetupWizardHintArrow({ direction = 'down' }: { direction?: 'down' | 'up' }) {
  const flip = direction === 'up'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 164.006 193.522"
      aria-hidden
      className={[
        'pointer-events-none absolute z-30 h-14 w-auto text-accent-500 opacity-90 sm:h-16',
        flip ? '-right-1 bottom-0' : '-right-1 top-0',
      ].join(' ')}
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
    >
      <path
        d="M170.837,25.842c-1.715,2.337-3.773,4.249-5.317,6.8-13.207,22.73-31.815,36.639-52.739,42.8a43.73,43.73,0,0,1-22.811,0c-21.1-5.1-34.428-16.574-51.065-33.569-4.8-4.886-10.056-13.692-13.486-20.7,1.886.85,3.944,1.7,5.832,2.762,5.488,2.974,10.977,6.161,16.637,8.711,2.4,1.062,5.317,1.062,8.062.85,1.029,0,2.572-1.912,2.744-3.187s-.858-3.611-1.715-3.824C42.4,20.956,29.706,10.335,16.5,1.2c-4.631-3.186-7.547-2.337-9.6,3.4A126.814,126.814,0,0,0,.034,49.422c0,.425.686,1.062,1.715,2.337,10.12-4.674,7.033-18.269,12.006-29.1,1.2,2.549,2.058,4.674,3.087,6.373,21.611,32.927,48.07,50.03,73.127,56.02,5.3,1.373,15.864,1.973,21.009.911,18.866-4.036,35.675-13.808,49.568-30.165,4.459-5.311,7.718-12.321,10.977-18.906,1.372-2.549,1.372-6.16,1.887-9.135Z"
        transform="translate(89.859 193.193) rotate(-121)"
        fill="currentColor"
      />
    </svg>
  )
}

export type WizardHintTarget = { x: number; y: number; width: number; height: number }

const OVERLAY = 'rgba(10, 20, 15, 0.55)'
const PAD = 8 // px of spotlight padding around the column

export function SetupWizardFloatingCallout({
  target,
  createModalOpen = false,
  children,
}: {
  target: WizardHintTarget | null
  createModalOpen?: boolean
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setMounted(true)
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  if (!mounted || typeof document === 'undefined') return null

  // Spotlight window — column bounds with a little padding
  const spotLeft   = target ? Math.max(0, target.x - PAD) : 0
  const spotTop    = target ? Math.max(0, target.y - PAD) : 0
  const spotWidth  = target ? target.width  + PAD * 2 : 0
  const spotHeight = target ? target.height + PAD * 2 : 0

  // Sticker sits in the dark strip bottom-left until the user clicks Add a job
  const stickerPos = {
    left: 56,
    bottom: 160,
  }

  return createPortal(
    <>
      {/* Spotlight — single element, box-shadow darkens everything outside.
          Hidden while create-job modal is open. */}
      {!createModalOpen && target && (
        <div
          className="fixed pointer-events-none transition-all duration-500"
          style={{
            left: spotLeft,
            top: spotTop,
            width: spotWidth,
            height: spotHeight,
            borderRadius: 14,
            boxShadow: `0 0 0 9999px ${OVERLAY}`,
            opacity: visible ? 1 : 0,
            zIndex: 190,
          }}
        />
      )}
      {!createModalOpen && !target && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-500"
          style={{ background: OVERLAY, opacity: visible ? 1 : 0, zIndex: 190 }}
        />
      )}

      {/* Sticker — hidden while modal is open so the job popup owns the screen */}
      {!createModalOpen && (
      <div
        className="fixed z-[200] pointer-events-none select-none transition-all duration-500 ease-out"
        style={stickerPos}
      >
        <div
          className="transition-all duration-500"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) rotate(-2deg)' : 'translateY(16px) rotate(-2deg)',
          }}
        >
          {/* Tape strip */}
          <div className="flex justify-center -mb-1 relative z-10">
            <div
              className="h-3 w-12 rounded-sm opacity-75"
              style={{ backgroundColor: '#86efac', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
            />
          </div>

          {/* Sticker body */}
          <div
            className="relative w-[210px] px-5 py-4 rounded-lg"
            style={{
              background: 'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)',
              boxShadow: '0 10px 28px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.7)',
              border: '1px solid rgba(74,222,128,0.4)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 shrink-0">
                <span className="text-[9px] font-bold text-white">1</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-700">
                First step
              </span>
            </div>

            <p className="text-[14px] font-bold text-gray-800 leading-snug mb-3">
              {children}
            </p>

            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-500" />
              </span>
              <span className="text-[12px] font-semibold text-accent-700">
                Click <strong className="text-gray-800">"Add a job"</strong> to begin
              </span>
            </div>
          </div>
        </div>
      </div>
      )}
    </>,
    document.body,
  )
}

export default function SetupWizardHint({
  children,
  showArrow = false,
  arrowDirection = 'down',
  className = '',
}: {
  children: React.ReactNode
  showArrow?: boolean
  arrowDirection?: 'down' | 'up'
  className?: string
}) {
  const padForArrow = showArrow
    ? arrowDirection === 'up'
      ? 'pb-14 sm:pb-16'
      : 'pr-14 sm:pr-16'
    : ''
  return (
    <div className={`relative ${padForArrow} ${className}`}>
      <p className="relative z-[1] text-[15px] font-semibold text-gray-800 leading-snug">{children}</p>
      {showArrow && <SetupWizardHintArrow direction={arrowDirection} />}
    </div>
  )
}
