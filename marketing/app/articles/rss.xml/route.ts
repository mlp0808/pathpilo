import { getAllArticles } from '../../lib/blog/articles'
import { getMarketingSiteUrl } from '../../lib/siteUrl'

export const dynamic = 'force-static'
export const revalidate = 3600

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const siteUrl = getMarketingSiteUrl()
  const articles = getAllArticles('en')
  const lastBuild = articles[0]
    ? new Date(articles[0].updated || articles[0].date).toUTCString()
    : new Date().toUTCString()

  const items = articles
    .map((a) => {
      const link = `${siteUrl}/articles/${a.slug}`
      const pub = new Date(a.date).toUTCString()
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeXml(a.description)}</description>
      ${a.author ? `<author>${escapeXml(a.author)}</author>` : ''}
      ${a.category ? `<category>${escapeXml(a.category)}</category>` : ''}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PathPilo Articles</title>
    <link>${siteUrl}/articles</link>
    <description>Field service management guides, route planning tips, and product updates from PathPilo.</description>
    <language>en-gb</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${siteUrl}/articles/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
