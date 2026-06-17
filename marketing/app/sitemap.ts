import type { MetadataRoute } from 'next'
import { getMarketingSiteUrl } from './lib/siteUrl'
import { getAllArticles, getAllUsedTags } from './lib/blog/articles'
import { BLOG_CATEGORIES } from './lib/blog/taxonomy'
const LOCALES = ['en', 'da'] as const
const ROUTES = [
  '',
  '/about',
  '/pricing',
  '/faq',
  '/contact',
  '/features/routeplanning',
  '/features/subscriptions',
  '/features/team',
  '/terms',
  '/privacy',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE_URL = getMarketingSiteUrl()
  function absoluteUrl(path: string): string {
    return `${SITE_URL}${path}`
  }

  const now = new Date()

  const localizedEntries: MetadataRoute.Sitemap = ROUTES.flatMap((route) =>
    LOCALES.map((locale) => {
      const localizedPath = `/${locale}${route}`

      return {
        url: absoluteUrl(localizedPath),
        lastModified: now,
        changeFrequency: (route === '' ? 'daily' : 'weekly') as 'daily' | 'weekly',
        priority: route === '' ? 1 : 0.8,
        alternates: {
          languages: {
            en: absoluteUrl(`/en${route}`),
            da: absoluteUrl(`/da${route}`),
            'x-default': absoluteUrl(`/en${route}`),
          },
        },
      }
    })
  )

  // Blog — English-first, lives at /articles (no locale prefix).
  const blogIndex: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/articles'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
  ]

  const categoryEntries: MetadataRoute.Sitemap = BLOG_CATEGORIES.map((c) => ({
    url: absoluteUrl(`/articles/category/${c.slug}`),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const tagEntries: MetadataRoute.Sitemap = getAllUsedTags().map((tag) => ({
    url: absoluteUrl(`/articles/tag/${tag}`),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.4,
  }))

  const articleEntries: MetadataRoute.Sitemap = getAllArticles().map((a) => ({
    url: absoluteUrl(`/articles/${a.slug}`),
    lastModified: new Date(a.updated || a.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...localizedEntries, ...blogIndex, ...categoryEntries, ...tagEntries, ...articleEntries]
}
