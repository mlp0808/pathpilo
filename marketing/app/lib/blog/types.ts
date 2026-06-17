/** Raw frontmatter as written in each .mdx file. */
export interface ArticleFrontmatter {
  title: string
  description: string
  /** Optional — defaults to the filename. */
  slug?: string
  category: string
  tags?: string[]
  /** ISO date, e.g. 2026-06-17 */
  date: string
  /** ISO date of last meaningful edit (optional). */
  updated?: string
  author?: string
  authorRole?: string
  /** Cover image path under /public, e.g. /images/articles/foo.jpg */
  image?: string
  imageAlt?: string
  /** Pin to the featured slot on the listing page. */
  featured?: boolean
  /** Hide from listings + sitemap while writing. */
  draft?: boolean
  /** Overrides for the <title> and meta description (SEO). */
  seoTitle?: string
  seoDescription?: string
}

/** A fully-resolved article (frontmatter + body + computed fields). */
export interface Article {
  slug: string
  frontmatter: ArticleFrontmatter
  /** MDX body (no frontmatter). */
  content: string
  readingMinutes: number
}

/** Lightweight shape used by cards, carousels, and archives. */
export interface ArticleSummary {
  slug: string
  title: string
  description: string
  category: string
  tags: string[]
  date: string
  updated?: string
  author?: string
  authorRole?: string
  image?: string
  imageAlt?: string
  featured: boolean
  readingMinutes: number
}
