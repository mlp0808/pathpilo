import type { MetadataRoute } from 'next'
import { getMarketingSiteUrl } from './lib/siteUrl'
import { getAllArticles, getAllUsedTags } from './lib/blog/articles'
import { BLOG_CATEGORIES } from './lib/blog/taxonomy'
import { INDUSTRIES } from './lib/industries/data'
import { COMPARISON_PAGES } from './lib/comparisons/data'
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
  '/features/scheduling',
  '/features/leads',
  '/features/reminders',
  '/features/analytics',
  '/features/services',
  '/tools',
  '/tools/route-planner',
  '/articles',
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
      const isHome = route === ''

      return {
        url: absoluteUrl(localizedPath),
        lastModified: now,
        changeFrequency: (isHome ? 'daily' : 'weekly') as 'daily' | 'weekly',
        priority: isHome ? 1 : 0.8,
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
    { url: absoluteUrl('/articles'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
  ]

  const categoryEntries: MetadataRoute.Sitemap = BLOG_CATEGORIES.map((c) => ({
    url: absoluteUrl(`/articles/category/${c.slug}`),
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  let tagEntries: MetadataRoute.Sitemap = []
  let articleEntries: MetadataRoute.Sitemap = []
  try {
    tagEntries = getAllUsedTags().map((tag) => ({
      url: absoluteUrl(`/articles/tag/${tag}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    }))
    articleEntries = getAllArticles().map((a) => ({
      url: absoluteUrl(`/articles/${a.slug}`),
      lastModified: new Date(a.updated || a.date),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))
  } catch (err) {
    console.error('[sitemap] Failed to load articles:', err)
  }

  // Industry landing pages — fully localised under /en/ and /da/.
  const industryEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    {
      url: absoluteUrl(`/${locale}/industries`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: {
        languages: {
          en: absoluteUrl('/en/industries'),
          da: absoluteUrl('/da/industries'),
          'x-default': absoluteUrl('/en/industries'),
        },
      },
    },
    ...INDUSTRIES.map((i) => ({
      url: absoluteUrl(`/${locale}/industries/${i.slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: {
        languages: {
          en: absoluteUrl(`/en/industries/${i.slug}`),
          da: absoluteUrl(`/da/industries/${i.slug}`),
          'x-default': absoluteUrl(`/en/industries/${i.slug}`),
        },
      },
    })),
  ])

  // Comparison pages — fully localised under /en/ and /da/.
  const comparisonEntries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) => [
    {
      url: absoluteUrl(`/${locale}/comparisons`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      alternates: {
        languages: {
          en: absoluteUrl('/en/comparisons'),
          da: absoluteUrl('/da/comparisons'),
          'x-default': absoluteUrl('/en/comparisons'),
        },
      },
    },
    ...COMPARISON_PAGES.map((c) => ({
      url: absoluteUrl(`/${locale}/comparisons/${c.slug}`),
      lastModified: new Date(c.lastUpdated),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: {
        languages: {
          en: absoluteUrl(`/en/comparisons/${c.slug}`),
          da: absoluteUrl(`/da/comparisons/${c.slug}`),
          'x-default': absoluteUrl(`/en/comparisons/${c.slug}`),
        },
      },
    })),
  ])

  // Localised URLs only — unprefixed /industries and /comparisons redirect via middleware.
  return [
    ...localizedEntries,
    ...blogIndex,
    ...categoryEntries,
    ...tagEntries,
    ...articleEntries,
    ...industryEntries,
    ...comparisonEntries,
  ]
}
