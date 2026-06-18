'use client'

import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import type { IndustryFaq } from '../../lib/industries/types'

export default function IndustryFAQ({ items }: { items: IndustryFaq[] }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="mx-auto max-w-3xl divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-primary-50/50 sm:px-6"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold text-primary-800 sm:text-lg">{item.q}</span>
              <PlusIcon
                className={`h-5 w-5 flex-shrink-0 text-accent-600 transition-transform duration-300 ${
                  isOpen ? 'rotate-45' : ''
                }`}
              />
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-[15px] leading-relaxed text-gray-600 sm:px-6">{item.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
