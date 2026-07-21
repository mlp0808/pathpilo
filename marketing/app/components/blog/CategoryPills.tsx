import Link from 'next/link'
import { BLOG_CATEGORIES, getCategoryLabel } from '../../lib/blog/taxonomy'
import type { MarketingLocale } from '../../lib/i18n'
import { withLocalePath } from '../../lib/i18n'

/**
 * Top filter bar linking to each category archive (SEO-friendly real pages,
 * not a client-side filter). `active` highlights the current category slug;
 * pass 'all' on the main listing.
 */
export default function CategoryPills({
  active = 'all',
  locale = 'en',
}: {
  active?: string
  locale?: MarketingLocale
}) {
  const da = locale === 'da'
  const articlesBase = withLocalePath(locale, '/articles')
  const base =
    'inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition border'
  const inactive = 'border-gray-200 bg-white text-gray-600 hover:border-accent-400 hover:text-accent-700'
  const activeCls = 'border-primary-800 bg-primary-800 text-white'

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Article categories">
      <Link href={articlesBase} className={`${base} ${active === 'all' ? activeCls : inactive}`}>
        {da ? 'Alle' : 'All'}
      </Link>
      {BLOG_CATEGORIES.map((c) => (
        <Link
          key={c.slug}
          href={`${articlesBase}/category/${c.slug}`}
          className={`${base} ${active === c.slug ? activeCls : inactive}`}
        >
          {getCategoryLabel(c.slug, locale)}
        </Link>
      ))}
    </nav>
  )
}
