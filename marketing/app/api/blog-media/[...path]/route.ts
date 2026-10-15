import { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMAGES_ROOT = path.join(process.cwd(), 'public', 'images', 'articles')

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Serve blog/MCP images from disk on every request so uploads appear
 * without a marketing rebuild (Next's default public/ snapshot does not).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await context.params
  if (!parts?.length) {
    return new NextResponse('Not found', { status: 404 })
  }

  const safeParts = parts.map((p) => path.basename(p))
  if (safeParts.some((p, i) => p !== parts[i] || p === '..' || p === '.')) {
    return new NextResponse('Bad path', { status: 400 })
  }

  const filePath = path.resolve(IMAGES_ROOT, ...safeParts)
  if (!isInside(IMAGES_ROOT, filePath) || !existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const st = statSync(filePath)
  if (!st.isFile()) {
    return new NextResponse('Not found', { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const stream = createReadStream(filePath)
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(st.size),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
