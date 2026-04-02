import type { MetadataRoute } from 'next'

const SITE_URL = 'https://pathpilo.com'
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
] as const

function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return ROUTES.flatMap((route) =>
    LOCALES.map((locale) => {
      const localizedPath = `/${locale}${route}`

      return {
        url: absoluteUrl(localizedPath),
        lastModified: now,
        changeFrequency: route === '' ? 'daily' : 'weekly',
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
}
