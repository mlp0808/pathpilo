'use client'

import { useEffect, useState } from 'react'

interface Heading {
  id: string
  text: string
  level: number
}

/**
 * Sticky table of contents. Reads h2/h3 headings (with ids added by
 * rehype-slug) from the article body after mount, and highlights the section
 * currently in view. Renders nothing if the article has fewer than 2 headings.
 */
export default function TableOfContents({ bodyId = 'article-body' }: { bodyId?: string }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const body = document.getElementById(bodyId)
    if (!body) return
    const nodes = Array.from(body.querySelectorAll('h2[id], h3[id]')) as HTMLElement[]
    const found = nodes.map((n) => ({
      id: n.id,
      text: n.textContent || '',
      level: n.tagName === 'H3' ? 3 : 2,
    }))
    setHeadings(found)

    if (found.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-100px 0px -70% 0px', threshold: 0 },
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [bodyId])

  if (headings.length < 2) return null

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 font-semibold uppercase tracking-wide text-gray-400">On this page</p>
      <ul className="space-y-2 border-l border-gray-200">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'pl-4' : ''}>
            <a
              href={`#${h.id}`}
              className={`-ml-px block border-l-2 pl-3 leading-snug transition ${
                activeId === h.id
                  ? 'border-accent-500 font-medium text-accent-700'
                  : 'border-transparent text-gray-500 hover:text-primary-800'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
