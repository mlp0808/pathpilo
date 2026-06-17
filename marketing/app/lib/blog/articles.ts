import 'server-only'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { Article, ArticleFrontmatter, ArticleSummary } from './types'

/**
 * Server-only data layer for the blog. Reads .mdx files from /content/articles
 * at build/request time, parses frontmatter, and exposes helpers for listing,
 * archives, and related-article suggestions.
 *
 * Nothing here runs on the client — pages call these in server components.
 */

const ARTICLES_DIR = path.join(process.cwd(), 'content', 'articles')
const WORDS_PER_MINUTE = 210

function readingMinutesFor(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

function isArticleFile(file: string): boolean {
  // .mdx posts only; underscore-prefixed files (_TEMPLATE) and docs are ignored.
  return file.endsWith('.mdx') && !file.startsWith('_')
}

function slugFromFile(file: string): string {
  return file.replace(/\.mdx$/, '')
}

let _cache: Article[] | null = null

/** All articles (including drafts), unsorted. Cached per process. */
function loadAll(): Article[] {
  if (_cache) return _cache
  if (!fs.existsSync(ARTICLES_DIR)) {
    _cache = []
    return _cache
  }
  const files = fs.readdirSync(ARTICLES_DIR).filter(isArticleFile)
  const articles: Article[] = files.map((file) => {
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8')
    const { data, content } = matter(raw)
    const fm = data as ArticleFrontmatter
    return {
      slug: fm.slug || slugFromFile(file),
      frontmatter: {
        ...fm,
        tags: Array.isArray(fm.tags) ? fm.tags : [],
      },
      content,
      readingMinutes: readingMinutesFor(content),
    }
  })
  _cache = articles
  return _cache
}

function toSummary(a: Article): ArticleSummary {
  return {
    slug: a.slug,
    title: a.frontmatter.title,
    description: a.frontmatter.description,
    category: a.frontmatter.category,
    tags: a.frontmatter.tags || [],
    date: a.frontmatter.date,
    updated: a.frontmatter.updated,
    author: a.frontmatter.author,
    authorRole: a.frontmatter.authorRole,
    image: a.frontmatter.image,
    imageAlt: a.frontmatter.imageAlt,
    featured: Boolean(a.frontmatter.featured),
    readingMinutes: a.readingMinutes,
  }
}

function byDateDesc(a: ArticleSummary, b: ArticleSummary): number {
  return new Date(b.date).getTime() - new Date(a.date).getTime()
}

/** Published (non-draft) articles, newest first. */
export function getAllArticles(): ArticleSummary[] {
  return loadAll()
    .filter((a) => !a.frontmatter.draft)
    .map(toSummary)
    .sort(byDateDesc)
}

export function getArticleSlugs(): string[] {
  return loadAll()
    .filter((a) => !a.frontmatter.draft)
    .map((a) => a.slug)
}

export function getArticleBySlug(slug: string): Article | null {
  const found = loadAll().find((a) => a.slug === slug)
  if (!found || found.frontmatter.draft) return null
  return found
}

export function getArticlesByCategory(categorySlug: string): ArticleSummary[] {
  return getAllArticles().filter((a) => a.category === categorySlug)
}

export function getArticlesByTag(tagSlug: string): ArticleSummary[] {
  return getAllArticles().filter((a) => a.tags.includes(tagSlug))
}

/** Every tag slug actually used across published articles. */
export function getAllUsedTags(): string[] {
  const set = new Set<string>()
  for (const a of getAllArticles()) a.tags.forEach((t) => set.add(t))
  return [...set].sort()
}

export function getFeaturedArticle(): ArticleSummary | null {
  const all = getAllArticles()
  return all.find((a) => a.featured) || all[0] || null
}

/**
 * Score-based related articles. Same category is worth most, then each shared
 * tag. Ties break on recency. Used for the "Read next" bullet list.
 */
export function getRelatedArticles(slug: string, limit = 4): ArticleSummary[] {
  const current = getAllArticles().find((a) => a.slug === slug)
  if (!current) return []
  const currentTags = new Set(current.tags)

  return getAllArticles()
    .filter((a) => a.slug !== slug)
    .map((a) => {
      let score = 0
      if (a.category === current.category) score += 3
      for (const t of a.tags) if (currentTags.has(t)) score += 2
      return { a, score }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || byDateDesc(x.a, y.a))
    .slice(0, limit)
    .map((x) => x.a)
}

/**
 * A broader, image-friendly set for the carousel ("More articles"). Prefers
 * related, then backfills with the newest other articles so the carousel is
 * never sparse.
 */
export function getMoreArticles(slug: string, limit = 8): ArticleSummary[] {
  const related = getRelatedArticles(slug, limit)
  if (related.length >= limit) return related
  const seen = new Set([slug, ...related.map((r) => r.slug)])
  const backfill = getAllArticles().filter((a) => !seen.has(a.slug))
  return [...related, ...backfill].slice(0, limit)
}
