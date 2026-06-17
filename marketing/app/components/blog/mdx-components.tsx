import Link from 'next/link'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import {
  InfoBox,
  KeyTakeaways,
  Quote,
  Columns,
  Column,
  ProsCons,
  StatGrid,
  Stat,
  Figure,
  CTABox,
  ButtonLink,
} from './content'

/**
 * Maps markdown/MDX elements to styled components, and exposes the rich
 * authoring components. Passed to <MDXRemote components={mdxComponents} />.
 *
 * h1 is reserved for the page chrome (the article title). Authors start at h2.
 * rehype-slug adds ids to headings for the table of contents.
 */

function SmartLink({ href = '', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  const isExternal = /^https?:\/\//.test(href) && !href.includes('pathpilo.com')
  const className = 'font-medium text-accent-700 underline decoration-accent-300/70 underline-offset-2 transition hover:text-accent-800 hover:decoration-accent-600'
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...rest}>
        {children}
      </a>
    )
  }
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  )
}

export const mdxComponents = {
  /* ── Headings ────────────────────────────────────────────────────────── */
  h2: (p: { children?: ReactNode; id?: string }) => (
    <h2
      id={p.id}
      className="mt-14 mb-5 scroll-mt-28 text-[24px] font-bold tracking-tight text-primary-800 sm:text-[28px]"
    >
      {p.children}
    </h2>
  ),
  h3: (p: { children?: ReactNode; id?: string }) => (
    <h3
      id={p.id}
      className="mt-10 mb-4 scroll-mt-28 text-xl font-bold text-primary-800"
    >
      {p.children}
    </h3>
  ),
  h4: (p: { children?: ReactNode; id?: string }) => (
    <h4
      id={p.id}
      className="mt-7 mb-3 scroll-mt-28 text-lg font-semibold text-primary-800"
    >
      {p.children}
    </h4>
  ),

  /* ── Body text ───────────────────────────────────────────────────────── */
  p: (p: { children?: ReactNode }) => (
    <p className="my-5 text-[17px] leading-[1.85] text-gray-700">{p.children}</p>
  ),

  a: SmartLink,

  ul: (p: { children?: ReactNode }) => (
    <ul className="my-5 list-disc space-y-2.5 pl-6 text-[17px] leading-relaxed text-gray-700 marker:text-accent-500">
      {p.children}
    </ul>
  ),
  ol: (p: { children?: ReactNode }) => (
    <ol className="my-5 list-decimal space-y-2.5 pl-6 text-[17px] leading-relaxed text-gray-700 marker:font-semibold marker:text-accent-600">
      {p.children}
    </ol>
  ),
  li: (p: { children?: ReactNode }) => <li className="pl-1">{p.children}</li>,

  blockquote: (p: { children?: ReactNode }) => (
    <blockquote className="my-7 border-l-4 border-accent-500 pl-6 text-lg italic leading-relaxed text-primary-800">
      {p.children}
    </blockquote>
  ),

  hr: () => <hr className="my-12 border-gray-200" />,

  strong: (p: { children?: ReactNode }) => (
    <strong className="font-semibold text-primary-900">{p.children}</strong>
  ),

  code: (p: { children?: ReactNode }) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.88em] font-medium text-primary-800">
      {p.children}
    </code>
  ),
  pre: (p: { children?: ReactNode }) => (
    <pre className="my-7 overflow-x-auto rounded-2xl bg-[#0d2020] p-6 text-sm leading-relaxed text-gray-100">
      {p.children}
    </pre>
  ),

  /* ── GFM Tables ──────────────────────────────────────────────────────── */
  table: (p: { children?: ReactNode }) => (
    <div className="my-8 overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
      <table className="w-full min-w-[420px] border-collapse text-left text-[15px]">
        {p.children}
      </table>
    </div>
  ),
  thead: (p: { children?: ReactNode }) => (
    <thead className="bg-primary-50">{p.children}</thead>
  ),
  th: (p: { children?: ReactNode }) => (
    <th className="border-b border-gray-200 px-5 py-3.5 font-semibold text-primary-800">
      {p.children}
    </th>
  ),
  td: (p: { children?: ReactNode }) => (
    <td className="border-b border-gray-100 px-5 py-3.5 align-top text-gray-700">
      {p.children}
    </td>
  ),
  tr: (p: { children?: ReactNode }) => (
    <tr className="even:bg-gray-50/60">{p.children}</tr>
  ),

  img: (p: { src?: string; alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.src}
      alt={p.alt || ''}
      className="my-8 w-full rounded-2xl border border-gray-100 shadow-sm"
      loading="lazy"
    />
  ),

  /* ── Rich authoring components ───────────────────────────────────────── */
  InfoBox,
  KeyTakeaways,
  Quote,
  Columns,
  Column,
  ProsCons,
  StatGrid,
  Stat,
  Figure,
  CTABox,
  ButtonLink,
}
