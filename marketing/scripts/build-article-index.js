/**
 * Generates content/articles/ARTICLE-INDEX.md — an always-current digest of
 * every published article. This is the file you paste into Claude (or that
 * Claude reads) before writing a new article, so it can add a few relevant
 * internal links instead of guessing at URLs.
 *
 * Run manually:   npm run articles:index
 * Runs automatically before every build via the "prebuild" script.
 */
const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const ARTICLES_DIR = path.join(__dirname, '..', 'content', 'articles')
const OUTPUT = path.join(ARTICLES_DIR, 'ARTICLE-INDEX.md')

// Keep in sync with app/lib/blog/taxonomy.ts (labels only — for display).
const CATEGORY_LABELS = {
  'getting-started': 'Getting Started',
  'route-planning': 'Route Planning',
  scheduling: 'Scheduling & Jobs',
  invoicing: 'Invoicing & Payments',
  'leads-marketing': 'Leads & Marketing',
  'team-management': 'Team Management',
  'business-growth': 'Business Growth',
  'product-updates': 'Product Updates',
}

function catLabel(slug) {
  return CATEGORY_LABELS[slug] || slug || 'Uncategorised'
}

function readArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) return []
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8')
      const { data } = matter(raw)
      return {
        slug: data.slug || file.replace(/\.mdx$/, ''),
        title: data.title || file,
        description: data.description || '',
        category: data.category || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        date: data.date || '',
        draft: Boolean(data.draft),
      }
    })
    .filter((a) => !a.draft)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

function build() {
  const articles = readArticles()
  const lines = []

  lines.push('# Article index (auto-generated — do not edit by hand)')
  lines.push('')
  lines.push(`> Regenerate with \`npm run articles:index\`. Last built: ${new Date().toISOString()}.`)
  lines.push(`> Total published articles: **${articles.length}**`)
  lines.push('')
  lines.push(
    'When writing a new article, scan this list and link to **2–4** genuinely relevant existing articles using their URL below (e.g. `[smart route planning](/articles/cut-drive-time-route-planning)`). Do not invent URLs that are not in this list.',
  )
  lines.push('')

  // Flat table — easiest for an AI to scan.
  lines.push('## All articles')
  lines.push('')
  lines.push('| Title | URL | Category | Tags |')
  lines.push('| --- | --- | --- | --- |')
  for (const a of articles) {
    lines.push(
      `| ${a.title} | \`/articles/${a.slug}\` | ${catLabel(a.category)} | ${a.tags.join(', ') || '—'} |`,
    )
  }
  lines.push('')

  // Grouped with excerpts — gives context on what each article is about.
  lines.push('## By category (with summaries)')
  lines.push('')
  const byCat = {}
  for (const a of articles) {
    ;(byCat[a.category] = byCat[a.category] || []).push(a)
  }
  for (const cat of Object.keys(byCat).sort()) {
    lines.push(`### ${catLabel(cat)}`)
    lines.push('')
    for (const a of byCat[cat]) {
      lines.push(`- **[${a.title}](/articles/${a.slug})** — ${a.description}`)
    }
    lines.push('')
  }

  fs.writeFileSync(OUTPUT, lines.join('\n'), 'utf8')
  console.log(`[articles] Wrote ${path.relative(process.cwd(), OUTPUT)} (${articles.length} articles).`)
}

build()
