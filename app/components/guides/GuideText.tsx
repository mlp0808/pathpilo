'use client'

import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

/**
 * The small markup guide bodies are written in from the admin panel:
 *   **bold**              → heavy text
 *   [label](/{slug}/jobs) → link ({slug} becomes the company slug)
 *   blank line            → new paragraph
 *
 * Deliberately tiny: an admin writing a tutorial step should never have to
 * think about HTML, and nothing user-authored is rendered as markup.
 */

/** Swaps `{slug}` for the company slug and normalises the leading slash. */
export function resolveGuideHref(href: string, companySlug?: string): string {
  const filled = href.replace(/\{slug\}/g, companySlug || '')
  if (/^(https?:)?\/\//.test(filled) || filled.startsWith('mailto:')) return filled
  return filled.startsWith('/') ? filled : `/${filled}`
}

function renderInline(text: string, companySlug?: string, keyPrefix = ''): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean)

  return parts.map((part, i) => {
    const key = `${keyPrefix}${i}`

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      )
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const [, label, rawHref] = link
      const href = resolveGuideHref(rawHref, companySlug)
      const external = /^(https?:)?\/\//.test(href) || href.startsWith('mailto:')
      const className =
        'font-semibold text-accent-600 underline decoration-accent-600/30 underline-offset-2 transition-colors hover:text-accent-700'
      return external ? (
        <a key={key} href={href} target="_blank" rel="noreferrer" className={className}>
          {label}
        </a>
      ) : (
        <Link key={key} href={href} className={className}>
          {label}
        </Link>
      )
    }

    return <Fragment key={key}>{part}</Fragment>
  })
}

export default function GuideText({
  text,
  companySlug,
  className = '',
}: {
  text: string
  companySlug?: string
  className?: string
}) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return null

  return (
    <div className={`space-y-2.5 text-[13px] leading-relaxed text-gray-600 ${className}`}>
      {paragraphs.map((paragraph, pi) => (
        <p key={pi}>
          {paragraph.split('\n').map((line, li, lines) => (
            <Fragment key={li}>
              {renderInline(line, companySlug, `${pi}-${li}-`)}
              {li < lines.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
