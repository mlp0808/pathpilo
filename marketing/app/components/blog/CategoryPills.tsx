import Link from 'next/link'
import { BLOG_CATEGORIES } from '../../lib/blog/taxonomy'

/**
 * Top filter bar linking to each category archive (SEO-friendly real pages,
 * not a client-side filter). `active` highlights the current category slug;
 * pass 'all' on the main listing.
 */
export default function CategoryPills({ active = 'all' }: { active?: string }) {
  const base =
    'inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition border'
  const inactive = 'border-gray-200 bg-white text-gray-600 hover:border-accent-400 hover:text-accent-700'
  const activeCls = 'border-primary-800 bg-primary-800 text-white'

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Article categories">
      <Link href="/articles" className={`${base} ${active === 'all' ? activeCls : inactive}`}>
        All
      </Link>
      {BLOG_CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={`/articles/category/${c.slug}`}
          className={`${base} ${active === c.slug ? activeCls : inactive}`}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  )
}
