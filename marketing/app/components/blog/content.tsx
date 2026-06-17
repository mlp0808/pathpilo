import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'

/**
 * Rich content building blocks for MDX articles. All are presentational
 * server components — authors use them directly inside .mdx files.
 * See content/articles/AUTHORING-GUIDE.md for usage of each.
 */

/* ── InfoBox ─────────────────────────────────────────────────────────────── */

type InfoBoxType = 'info' | 'tip' | 'warning' | 'success'

const INFO_STYLES: Record<
  InfoBoxType,
  { border: string; bg: string; iconColor: string; Icon: typeof InformationCircleIcon; defaultTitle: string }
> = {
  info: { border: 'border-sky-300', bg: 'bg-sky-50', iconColor: 'text-sky-600', Icon: InformationCircleIcon, defaultTitle: 'Good to know' },
  tip: { border: 'border-accent-400', bg: 'bg-accent-50', iconColor: 'text-accent-700', Icon: LightBulbIcon, defaultTitle: 'Tip' },
  warning: { border: 'border-amber-300', bg: 'bg-amber-50', iconColor: 'text-amber-600', Icon: ExclamationTriangleIcon, defaultTitle: 'Heads up' },
  success: { border: 'border-emerald-300', bg: 'bg-emerald-50', iconColor: 'text-emerald-600', Icon: CheckCircleIcon, defaultTitle: 'Best practice' },
}

export function InfoBox({
  type = 'info',
  title,
  children,
}: {
  type?: InfoBoxType
  title?: string
  children: ReactNode
}) {
  const s = INFO_STYLES[type] || INFO_STYLES.info
  const Icon = s.Icon
  return (
    <div className={`my-7 flex gap-3.5 rounded-2xl border ${s.border} ${s.bg} p-5`}>
      <Icon className={`h-6 w-6 flex-shrink-0 ${s.iconColor}`} aria-hidden />
      <div className="min-w-0">
        <p className="mb-1 font-semibold text-primary-800">{title || s.defaultTitle}</p>
        <div className="prose-tight text-[15px] leading-relaxed text-gray-700 [&>*:last-child]:mb-0 [&>p]:mb-2">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── KeyTakeaways ────────────────────────────────────────────────────────── */

export function KeyTakeaways({ title = 'Key takeaways', children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="my-8 rounded-2xl border border-primary-100 bg-primary-50/60 p-6">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircleIcon className="h-5 w-5 text-accent-600" aria-hidden />
        <h2 className="m-0 text-base font-bold uppercase tracking-wide text-primary-800">{title}</h2>
      </div>
      <div className="[&_li]:mb-2 [&_li]:text-gray-700 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </aside>
  )
}

/* ── Quote / Pullquote ───────────────────────────────────────────────────── */

export function Quote({ children, author, role }: { children: ReactNode; author?: string; role?: string }) {
  return (
    <figure className="my-8 border-l-4 border-accent-500 pl-6">
      <blockquote className="m-0 text-xl font-medium leading-relaxed text-primary-800">{children}</blockquote>
      {(author || role) && (
        <figcaption className="mt-3 text-sm text-gray-500">
          {author && <span className="font-semibold text-gray-700">{author}</span>}
          {author && role && ' · '}
          {role}
        </figcaption>
      )}
    </figure>
  )
}

/* ── Columns / Column ────────────────────────────────────────────────────── */

export function Columns({ children }: { children: ReactNode }) {
  return <div className="my-7 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}

export function Column({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      {title && <h3 className="m-0 mb-2 text-base font-bold text-primary-800">{title}</h3>}
      <div className="text-[15px] leading-relaxed text-gray-700 [&>*:last-child]:mb-0 [&>p]:mb-2">{children}</div>
    </div>
  )
}

/* ── ProsCons ────────────────────────────────────────────────────────────── */

export function ProsCons({
  pros = [],
  cons = [],
  prosTitle = 'Pros',
  consTitle = 'Cons',
}: {
  pros?: string[]
  cons?: string[]
  prosTitle?: string
  consTitle?: string
}) {
  return (
    <div className="my-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <p className="mb-3 flex items-center gap-2 font-bold text-emerald-700">
          <CheckCircleIcon className="h-5 w-5" aria-hidden /> {prosTitle}
        </p>
        <ul className="m-0 space-y-2 p-0">
          {pros.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] text-gray-700">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" /> {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <p className="mb-3 flex items-center gap-2 font-bold text-rose-700">
          <ExclamationTriangleIcon className="h-5 w-5" aria-hidden /> {consTitle}
        </p>
        <ul className="m-0 space-y-2 p-0">
          {cons.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] text-gray-700">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-400" /> {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Stats ───────────────────────────────────────────────────────────────── */

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="my-8 grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <div className="text-3xl font-black text-accent-600">{value}</div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
    </div>
  )
}

/* ── Figure (image + caption) ────────────────────────────────────────────── */

export function Figure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full rounded-2xl border border-gray-100" loading="lazy" />
      {caption && <figcaption className="mt-2 text-center text-sm text-gray-500">{caption}</figcaption>}
    </figure>
  )
}

/* ── CTABox ──────────────────────────────────────────────────────────────── */

export function CTABox({
  title = 'Run your service business with PathPilo',
  text = 'Scheduling, routing, invoicing, and your whole team — in one place. Start free.',
  buttonLabel = 'Get started free',
  href = 'https://app.pathpilo.com/register',
}: {
  title?: string
  text?: string
  buttonLabel?: string
  href?: string
}) {
  return (
    <div className="my-9 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d2020] to-[#193434] p-8 text-center">
      <h3 className="m-0 text-2xl font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-white/70">{text}</p>
      <a
        href={href}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-[#0d2020] transition hover:bg-accent-400"
      >
        {buttonLabel}
        <ArrowRightIcon className="h-4 w-4" />
      </a>
    </div>
  )
}

/* ── ButtonLink (inline CTA) ─────────────────────────────────────────────── */

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href) && !href.includes('pathpilo.com')
  const cls =
    'my-2 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-accent-600'
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <ArrowRightIcon className="h-4 w-4" />
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  )
}
