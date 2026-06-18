/**
 * Generates an on-brand SVG cover for every article into
 * marketing/public/images/articles/<slug>.svg.
 *
 * The cover is derived from the article's frontmatter (title + category), so it
 * always matches the content and new articles get a cover automatically. Each
 * cover shows a stylised map/route motif in the category colour with the title
 * baked in — crisp at any size, tiny, and version-controlled.
 *
 * To use a real photo instead, drop a file in public/images/articles/ and point
 * the article's `image:` frontmatter at it; the generated .svg is then unused.
 *
 * Run:  npm run articles:covers   (also runs automatically before build)
 */
const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const ARTICLES_DIR = path.join(__dirname, '..', 'content', 'articles')
const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'articles')

// Mirror of the category palette in app/lib/blog/taxonomy.ts.
const CATEGORY_COLORS = {
  'getting-started': '#3DD57A',
  'route-planning': '#14b8c4',
  scheduling: '#6366f1',
  invoicing: '#8b5cf6',
  'leads-marketing': '#f59e0b',
  'team-management': '#ec4899',
  'business-growth': '#0ea5e9',
  'product-updates': '#193434',
}
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

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function seedFromString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapTitle(title, maxChars) {
  const words = title.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 4)
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + amt)
  const g = Math.min(255, ((n >> 8) & 255) + amt)
  const b = Math.min(255, (n & 255) + amt)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

function buildSvg({ title, category }) {
  const W = 1600
  const H = 900
  const color = CATEGORY_COLORS[category] || '#193434'
  const label = CATEGORY_LABELS[category] || 'PathPilo'
  const rand = mulberry32(seedFromString(title + category))

  // Route motif: 6 pins left→right zigzag in the upper-right region.
  const pins = []
  const n = 6
  const x0 = 870
  const x1 = 1480
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / (n - 1))
    const y = Math.round(150 + rand() * 360)
    pins.push([x, y])
  }
  const routePath = pins.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
  const pinDots = pins
    .map(
      ([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="${i === 0 || i === n - 1 ? 16 : 11}" fill="#FFFFFF" opacity="0.95"/>` +
        `<circle cx="${x}" cy="${y}" r="${i === 0 || i === n - 1 ? 26 : 19}" fill="none" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="3"/>`,
    )
    .join('\n  ')

  // Faint map grid.
  const grid = []
  for (let gx = 0; gx <= W; gx += 80)
    grid.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#FFFFFF" stroke-opacity="0.04"/>`)
  for (let gy = 0; gy <= H; gy += 80)
    grid.push(`<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#FFFFFF" stroke-opacity="0.04"/>`)

  // Title block, bottom-left anchored.
  const lines = wrapTitle(title, 24)
  const lineHeight = 92
  const titleBottom = 800
  const firstBaseline = titleBottom - (lines.length - 1) * lineHeight
  const titleTspans = lines
    .map(
      (ln, i) =>
        `<tspan x="110" y="${firstBaseline + i * lineHeight}">${escapeXml(ln)}</tspan>`,
    )
    .join('')
  const labelY = firstBaseline - lineHeight - 36

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="#0d2020"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.28" r="0.6">
      <stop offset="0" stop-color="${lighten(color, 40)}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${grid.join('\n  ')}
  <circle cx="1320" cy="240" r="360" fill="#FFFFFF" opacity="0.05"/>
  <path d="${routePath}" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 22"/>
  <path d="${routePath}" stroke="${lighten(color, 70)}" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  ${pinDots}
  <text x="110" y="${labelY}" fill="#FFFFFF" fill-opacity="0.75" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="3">${escapeXml(label.toUpperCase())}</text>
  <text fill="#FFFFFF" font-family="Inter, Arial, sans-serif" font-size="74" font-weight="800" letter-spacing="-1">${titleTspans}</text>
  <g>
    <circle cx="122" cy="852" r="9" fill="${lighten(color, 70)}"/>
    <text x="144" y="862" fill="#FFFFFF" fill-opacity="0.85" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">PathPilo</text>
  </g>
</svg>
`
}

function run() {
  if (!fs.existsSync(ARTICLES_DIR)) return
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
  let count = 0
  for (const file of files) {
    const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8')
    const { data } = matter(raw)
    if (data.draft) continue
    const slug = data.slug || file.replace(/\.mdx$/, '')
    const svg = buildSvg({ title: data.title || slug, category: data.category || '' })
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg, 'utf8')
    count++
  }
  console.log(`[articles] Wrote ${count} cover image(s) to public/images/articles/.`)
}

run()
