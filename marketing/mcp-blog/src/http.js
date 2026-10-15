#!/usr/bin/env node
/**
 * PathPilo Blog MCP — remote Streamable HTTP connector for Grok bots.
 *
 * Public endpoint (after HTTPS deploy / tunnel):
 *   POST https://<host>/mcp
 *
 * Auth: Authorization: Bearer <BLOG_MCP_TOKEN>
 *
 * Add in Grok:
 *   grok.com/connectors → New Connector → Custom → paste URL
 *   or tell the bot: "Add this MCP server: https://…/mcp"
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createBlogMcpServer } from './server.js'
import { sandboxInfo } from './blogStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Prefer mcp-blog/.env, then marketing/.env, then repo-root .env
dotenv.config({ path: path.join(__dirname, '../.env') })
dotenv.config({ path: path.join(__dirname, '../../.env') })
dotenv.config({ path: path.join(__dirname, '../../../.env') })

const PORT = Number(process.env.BLOG_MCP_PORT || process.env.PORT || 8787)
const HOST = process.env.BLOG_MCP_HOST || '0.0.0.0'
const TOKEN = process.env.BLOG_MCP_TOKEN || ''

if (!TOKEN) {
  console.error(
    '[pathpilo-blog-mcp] Refusing to start: set BLOG_MCP_TOKEN to a long random secret.'
  )
  process.exit(1)
}

function tokensEqual(provided) {
  if (!provided || typeof provided !== 'string') return false
  const a = Buffer.from(provided.trim())
  const b = Buffer.from(TOKEN)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Pull the shared secret from several places.
 * Cloudflare/Nginx sometimes drop Authorization; custom headers + ?token= survive.
 */
function extractToken(req) {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.trim()) {
    const bearer = auth.match(/^Bearer\s+(.+)$/i)
    if (bearer) return bearer[1].trim()
    const basic = auth.match(/^Basic\s+(.+)$/i)
    if (basic) {
      try {
        const decoded = Buffer.from(basic[1], 'base64').toString('utf8')
        const colon = decoded.indexOf(':')
        // Grok / browsers often send "user:password" — password is our token
        return (colon >= 0 ? decoded.slice(colon + 1) : decoded).trim()
      } catch {
        // ignore
      }
    }
    return auth.trim()
  }

  for (const key of ['x-api-key', 'x-blog-mcp-token', 'x-mcp-token', 'api-key']) {
    const v = req.headers[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }

  const q = req.query || {}
  for (const key of ['token', 'access_token', 'api_key']) {
    const v = q[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function requireAuth(req, res, next) {
  if (tokensEqual(extractToken(req))) return next()
  res.setHeader('WWW-Authenticate', 'Bearer')
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message:
        'Unauthorized — token required (Authorization Bearer, X-Api-Key, or ?token=)',
    },
    id: null,
  })
}

// Always allow local health checks; public hosts come from env / Nginx.
const allowedHosts = [
  '127.0.0.1',
  'localhost',
  '::1',
  ...(process.env.BLOG_MCP_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts,
})

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Mcp-Session-Id, X-Api-Key, X-Blog-MCP-Token, X-MCP-Token'
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

app.get('/health', async (_req, res) => {
  const info = sandboxInfo()
  let articleCount = null
  let sampleSlugs = []
  try {
    const { listArticles } = await import('./blogStore.js')
    const arts = await listArticles({ includeDrafts: true })
    articleCount = arts.length
    sampleSlugs = arts.slice(0, 8).map((a) => a.slug)
  } catch {
    // ignore — path still useful
  }
  res.json({
    ok: true,
    service: 'pathpilo-blog-mcp',
    transport: 'streamable-http',
    endpoint: '/mcp',
    readOnly: info.readOnly,
    allowedWriteRoots: info.allowedWriteRoots,
    // Public on purpose: proves which folder the live connector writes to
    marketingRoot: info.marketingRoot,
    articlesDir: info.articlesDir,
    imagesDir: info.imagesDir,
    articleCount,
    sampleSlugs,
    expectedLiveRoot: '/home/pathpilo/htdocs/pathpilo.com/marketing',
    writingToLiveTree: String(info.marketingRoot || '').startsWith(
      '/home/pathpilo/htdocs/pathpilo.com/marketing'
    ),
  })
})

/**
 * Diagnose proxies that strip Authorization.
 * Reports which auth channels arrived — never echoes secret values.
 */
app.get('/auth-probe', (req, res) => {
  const auth = req.headers.authorization
  let scheme = null
  if (typeof auth === 'string' && auth.trim()) {
    scheme = (auth.split(/\s+/)[0] || 'raw').slice(0, 32)
  }
  const extracted = extractToken(req)
  res.json({
    ok: true,
    codeVersion: 'auth-multi-2026-04-15',
    authorizationPresent: Boolean(auth),
    authorizationScheme: scheme,
    xApiKeyPresent: Boolean(req.headers['x-api-key']),
    xBlogMcpTokenPresent: Boolean(req.headers['x-blog-mcp-token']),
    queryTokenPresent: Boolean(req.query?.token || req.query?.access_token),
    tokenAccepted: tokensEqual(extracted),
    // Helps confirm nginx forwarded the request to this process
    writingToLiveTree: String(sandboxInfo().marketingRoot || '').startsWith(
      '/home/pathpilo/htdocs/pathpilo.com/marketing'
    ),
    incomingHeaderNames: Object.keys(req.headers).sort(),
  })
})

/** Connector discovery hint for humans / Grok setup UIs */
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><title>PathPilo Blog MCP</title></head>
<body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
  <h1>PathPilo Blog MCP</h1>
  <p>Custom connector for Grok bots. Blog articles &amp; images only — no app code access.</p>
  <ul>
    <li>MCP endpoint: <code>POST /mcp</code> (Streamable HTTP, JSON responses)</li>
    <li>Auth: Bearer, Basic, <code>X-Api-Key</code>, or <code>?token=</code> in the URL</li>
    <li>Health: <a href="/health"><code>/health</code></a></li>
    <li>Auth probe: <a href="/auth-probe"><code>/auth-probe</code></a></li>
  </ul>
  <p>If Authorization is stripped by a proxy, use this connector URL:<br>
  <code>https://pathpilo.com/blog-mcp/mcp?token=YOUR_TOKEN</code></p>
</body></html>`)
})

const IDLE_MS = 30 * 60_000
const MAX_SESSIONS = 200
const sessions = new Map()

const trackResponse = (session, res) => {
  if (!res.socket || res.destroyed) return
  session.open++
  res.on('close', () => {
    session.open--
    session.lastActive = Date.now()
  })
}

setInterval(() => {
  const cutoff = Date.now() - IDLE_MS
  for (const session of sessions.values()) {
    if (session.open === 0 && session.lastActive < cutoff) {
      session.transport.close().catch(() => {})
    }
  }
}, 60_000).unref()

app.post('/mcp', requireAuth, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id']
    const session = sessionId ? sessions.get(sessionId) : undefined
    let transport

    if (session) {
      transport = session.transport
      trackResponse(session, res)
    } else if (!sessionId && isInitializeRequest(req.body)) {
      if (sessions.size >= MAX_SESSIONS) {
        res.status(503).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Too many open sessions' },
          id: null,
        })
        return
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, open: 0, lastActive: Date.now() })
        },
      })
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
      }
      const server = createBlogMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
      return
    } else if (sessionId) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      })
      return
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: missing session or initialize' },
        id: null,
      })
      return
    }

    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('[pathpilo-blog-mcp] request error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      })
    }
  }
})

app.get('/mcp', requireAuth, (_req, res) => {
  res.status(405).set('Allow', 'POST, DELETE').send('Method Not Allowed')
})

app.delete('/mcp', requireAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id']
  const session = sessionId ? sessions.get(sessionId) : undefined
  if (session) {
    await session.transport.close().catch(() => {})
    sessions.delete(sessionId)
  }
  res.status(204).end()
})

app.listen(PORT, HOST, () => {
  console.error(`[pathpilo-blog-mcp] Grok connector listening on http://${HOST}:${PORT}`)
  console.error(`[pathpilo-blog-mcp] MCP URL path: /mcp  (auth: Bearer token)`)
  console.error(`[pathpilo-blog-mcp] Sandbox: articles + images only`)
})
