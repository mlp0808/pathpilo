import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import matter from 'gray-matter'
import { CATEGORY_SLUGS } from './taxonomy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** marketing/ — parent of mcp-blog/ */
export const MARKETING_ROOT = path.resolve(__dirname, '../..')
export const ARTICLES_DIR = path.join(MARKETING_ROOT, 'content', 'articles')
export const IMAGES_DIR = path.join(MARKETING_ROOT, 'public', 'images', 'articles')

const PROTECTED_ARTICLE_FILES = new Set([
  '_TEMPLATE.mdx',
  'AUTHORING-GUIDE.md',
  'ARTICLE-INDEX.md',
])

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

function assertWritable() {
  if (process.env.BLOG_MCP_READONLY === '1' || process.env.BLOG_MCP_READONLY === 'true') {
    throw new Error('Blog MCP is in read-only mode (BLOG_MCP_READONLY).')
  }
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      'Invalid slug. Use lowercase letters, numbers, and dashes only (e.g. cut-drive-time).'
    )
  }
  if (slug.startsWith('_')) {
    throw new Error('Slugs starting with "_" are reserved.')
  }
  return slug
}

function articlePath(slug) {
  const safe = assertSafeSlug(slug)
  const full = path.resolve(ARTICLES_DIR, `${safe}.mdx`)
  if (!isInside(ARTICLES_DIR, full)) throw new Error('Path escape blocked.')
  return full
}

function imagePath(filename) {
  const base = path.basename(filename)
  if (base !== filename || base.includes('..')) {
    throw new Error('Invalid image filename.')
  }
  const ext = path.extname(base).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) {
    throw new Error(`Unsupported image type "${ext}". Allowed: ${[...IMAGE_EXTS].join(', ')}`)
  }
  const full = path.resolve(IMAGES_DIR, base)
  if (!isInside(IMAGES_DIR, full)) throw new Error('Path escape blocked.')
  return full
}

function normalizeTags(tags) {
  if (!tags) return undefined
  if (!Array.isArray(tags)) throw new Error('tags must be an array of strings.')
  return tags.map((t) => {
    const s = String(t).trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
      throw new Error(`Invalid tag "${t}". Use lowercase-dashed slugs.`)
    }
    return s
  })
}

function validateFrontmatter(fm, { partial = false } = {}) {
  const out = { ...fm }
  if (!partial || out.category !== undefined) {
    if (out.category != null && !CATEGORY_SLUGS.has(String(out.category))) {
      throw new Error(
        `Unknown category "${out.category}". Use blog_list_taxonomy for valid category slugs.`
      )
    }
  }
  if (out.tags !== undefined) out.tags = normalizeTags(out.tags)
  if (out.date !== undefined && out.date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.date))) {
      throw new Error('date must be YYYY-MM-DD.')
    }
  }
  if (out.updated !== undefined && out.updated !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.updated))) {
      throw new Error('updated must be YYYY-MM-DD.')
    }
  }
  if (out.locale !== undefined && out.locale !== null) {
    if (out.locale !== 'en' && out.locale !== 'da') {
      throw new Error('locale must be "en" or "da".')
    }
  }
  if (out.image !== undefined && out.image !== null && out.image !== '') {
    const img = String(out.image)
    if (!img.startsWith('/images/articles/')) {
      throw new Error('image must be a path under /images/articles/…')
    }
  }
  return out
}

function serializeArticle(data, content) {
  const cleaned = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || v === '') continue
    cleaned[k] = v
  }
  return matter.stringify(content.replace(/^\uFEFF/, '').replace(/^\n+/, ''), cleaned)
}

async function readArticleFile(slug) {
  const file = articlePath(slug)
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Article not found: ${slug}`)
    throw e
  }
  const parsed = matter(raw)
  return {
    slug,
    path: `content/articles/${slug}.mdx`,
    frontmatter: parsed.data || {},
    content: parsed.content.replace(/^\n+/, ''),
    raw,
  }
}

export async function listArticles({ includeDrafts = true, category, tag, locale } = {}) {
  const names = await fs.readdir(ARTICLES_DIR)
  const out = []
  for (const name of names) {
    if (!name.endsWith('.mdx') || name.startsWith('_')) continue
    const slug = name.slice(0, -4)
    try {
      const art = await readArticleFile(slug)
      const fm = art.frontmatter
      if (!includeDrafts && fm.draft === true) continue
      if (category && fm.category !== category) continue
      if (tag && !(Array.isArray(fm.tags) && fm.tags.includes(tag))) continue
      if (locale && (fm.locale || 'en') !== locale) continue
      out.push({
        slug,
        title: fm.title || slug,
        description: fm.description || '',
        category: fm.category || null,
        tags: fm.tags || [],
        date: fm.date || null,
        updated: fm.updated || null,
        draft: Boolean(fm.draft),
        featured: Boolean(fm.featured),
        locale: fm.locale || 'en',
        image: fm.image || null,
        seoTitle: fm.seoTitle || null,
        seoDescription: fm.seoDescription || null,
        author: fm.author || null,
      })
    } catch {
      // skip unreadable
    }
  }
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return out
}

export async function getArticle(slug) {
  return readArticleFile(slug)
}

export async function createArticle({
  slug,
  title,
  description,
  category,
  date,
  content,
  tags,
  author = 'The PathPilo Team',
  authorRole,
  image,
  imageAlt,
  draft = true,
  featured,
  seoTitle,
  seoDescription,
  locale,
  updated,
}) {
  assertWritable()
  const safe = assertSafeSlug(slug)
  if (PROTECTED_ARTICLE_FILES.has(`${safe}.mdx`)) {
    throw new Error('That filename is reserved.')
  }
  const file = articlePath(safe)
  try {
    await fs.access(file)
    throw new Error(`Article already exists: ${safe}. Use blog_update_article to edit.`)
  } catch (e) {
    if (e.code === 'ENOENT') {
      // ok — create
    } else {
      throw e
    }
  }

  const fm = validateFrontmatter({
    title,
    description,
    category,
    date: date || new Date().toISOString().slice(0, 10),
    tags,
    author,
    authorRole,
    image: image || `/images/articles/${safe}.svg`,
    imageAlt: imageAlt || title,
    draft,
    featured,
    seoTitle,
    seoDescription,
    locale,
    updated,
  })

  if (!fm.title || !fm.description || !fm.category || !fm.date) {
    throw new Error('title, description, category, and date are required.')
  }

  const body =
    content?.trim() ||
    `Open with a short intro that states the problem and what the reader will learn.

<KeyTakeaways>
- Takeaway one
- Takeaway two
- Takeaway three
</KeyTakeaways>

## First section

Body text goes here.

## Wrap up

Close with a clear next step.

<CTABox />
`

  await fs.mkdir(ARTICLES_DIR, { recursive: true })
  await fs.writeFile(file, serializeArticle(fm, body), 'utf8')
  return readArticleFile(safe)
}

export async function updateArticle(slug, { frontmatterPatch = {}, content, replaceContent = false } = {}) {
  assertWritable()
  const art = await readArticleFile(slug)
  const nextFm = validateFrontmatter(
    { ...art.frontmatter, ...frontmatterPatch },
    { partial: true }
  )
  // Explicit nulls in patch remove optional fields
  for (const [k, v] of Object.entries(frontmatterPatch)) {
    if (v === null) delete nextFm[k]
  }
  let nextContent = art.content
  if (content !== undefined) {
    nextContent = replaceContent ? content : content
  }
  await fs.writeFile(articlePath(slug), serializeArticle(nextFm, nextContent), 'utf8')
  return readArticleFile(slug)
}

export async function deleteArticle(slug, { confirmSlug } = {}) {
  assertWritable()
  if (confirmSlug !== slug) {
    throw new Error('Pass confirmSlug equal to slug to confirm deletion.')
  }
  const file = articlePath(slug)
  await fs.unlink(file)
  return { deleted: slug }
}

export async function listImages() {
  await fs.mkdir(IMAGES_DIR, { recursive: true })
  const names = await fs.readdir(IMAGES_DIR)
  const out = []
  for (const name of names) {
    const full = path.join(IMAGES_DIR, name)
    const st = await fs.stat(full)
    if (!st.isFile()) continue
    const ext = path.extname(name).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue
    out.push({
      filename: name,
      path: `/images/articles/${name}`,
      bytes: st.size,
      updatedAt: st.mtime.toISOString(),
    })
  }
  out.sort((a, b) => a.filename.localeCompare(b.filename))
  return out
}

export async function uploadImage({ filename, base64, contentType }) {
  assertWritable()
  let name = path.basename(filename)
  if (!path.extname(name) && contentType) {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/avif': '.avif',
    }
    if (map[contentType]) name += map[contentType]
  }
  const file = imagePath(name)
  const buf = Buffer.from(base64, 'base64')
  if (!buf.length) throw new Error('Empty image payload.')
  if (buf.length > 8 * 1024 * 1024) throw new Error('Image too large (max 8MB).')
  await fs.mkdir(IMAGES_DIR, { recursive: true })
  await fs.writeFile(file, buf)
  return {
    filename: path.basename(file),
    path: `/images/articles/${path.basename(file)}`,
    bytes: buf.length,
  }
}

export async function deleteImage(filename, { confirmFilename } = {}) {
  assertWritable()
  if (confirmFilename !== filename && confirmFilename !== path.basename(filename)) {
    throw new Error('Pass confirmFilename equal to filename to confirm deletion.')
  }
  const file = imagePath(filename)
  await fs.unlink(file)
  return { deleted: path.basename(file) }
}

export async function getAuthoringGuide() {
  const file = path.join(ARTICLES_DIR, 'AUTHORING-GUIDE.md')
  return fs.readFile(file, 'utf8')
}

export async function getArticleIndex() {
  const file = path.join(ARTICLES_DIR, 'ARTICLE-INDEX.md')
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return '(ARTICLE-INDEX.md missing — run blog_refresh_index)'
  }
}

export async function getTemplate() {
  const file = path.join(ARTICLES_DIR, '_TEMPLATE.mdx')
  return fs.readFile(file, 'utf8')
}

export function refreshIndex() {
  assertWritable()
  return new Promise((resolve, reject) => {
    const script = path.join(MARKETING_ROOT, 'scripts', 'build-article-index.js')
    const child = spawn(process.execPath, [script], {
      cwd: MARKETING_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `articles:index exited ${code}`))
        return
      }
      resolve({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

export function sandboxInfo() {
  return {
    marketingRoot: MARKETING_ROOT,
    articlesDir: ARTICLES_DIR,
    imagesDir: IMAGES_DIR,
    readOnly: process.env.BLOG_MCP_READONLY === '1' || process.env.BLOG_MCP_READONLY === 'true',
    allowedWriteRoots: ['content/articles/*.mdx', 'public/images/articles/*'],
    denied: ['app source', 'api-server', 'repo root', 'arbitrary filesystem'],
  }
}
