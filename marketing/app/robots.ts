import { MetadataRoute } from 'next'
import { getMarketingSiteUrl } from './lib/siteUrl'

export default function robots(): MetadataRoute.Robots {
  const base = getMarketingSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
