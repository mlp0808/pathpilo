/**
 * Public demo safety net.
 *
 * Demo workspaces are created by anonymous visitors, so nothing they do may
 * reach a real inbox or phone. Outbound email/SMS is refused when ANY of
 * these is true:
 *   1. the current request was made with a demo workspace token,
 *   2. the send is on behalf of a demo company (covers background ticks),
 *   3. a recipient is on a reserved / demo-only domain.
 */
const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DEMO_EMAIL_DOMAIN = 'demo.pathpilo.com';
/** Shared logo for every demo — never deleted when a demo workspace expires. */
const DEMO_LOGO_FILENAME = 'pathpilo-demo-logo.png';
const DEMO_LOGO_URL = `/api/companies/logo/${DEMO_LOGO_FILENAME}`;
const CACHE_MS = 60 * 1000;

const LOGO_DIR = path.resolve(__dirname, '..', 'uploads', 'company-logos');
const LOGO_SOURCES = [
  path.resolve(__dirname, '..', '..', 'marketing', 'public', 'hero', 'pathpilo_logo_color-pos.png'),
  path.resolve(__dirname, '..', '..', 'public', 'images', 'brand', 'logo.png'),
];

/** Copy the PathPilo mark into company-logos once so demos can point at it. */
function ensureDemoLogoAsset() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const dest = path.join(LOGO_DIR, DEMO_LOGO_FILENAME);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return DEMO_LOGO_URL;
  const src = LOGO_SOURCES.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn('[demo] PathPilo logo source missing — demos will have no logo');
    return null;
  }
  fs.copyFileSync(src, dest);
  return DEMO_LOGO_URL;
}

function isSharedDemoLogoFilename(filename) {
  return Boolean(filename) && String(filename) === DEMO_LOGO_FILENAME;
}

const requestContext = new AsyncLocalStorage();
const demoCache = new Map();

let schemaReady = null;
function ensureDemoSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
      await db.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ`);
      await db.query(
        `CREATE INDEX IF NOT EXISTS companies_demo_expires_idx ON companies (demo_expires_at) WHERE is_demo`
      );
      const logoUrl = ensureDemoLogoAsset();
      if (logoUrl) {
        // Every public demo shows PathPilo — including ones created before the logo seed.
        await db.query(
          `UPDATE companies SET logo_url = $1 WHERE is_demo = TRUE AND COALESCE(logo_url, '') IS DISTINCT FROM $1`,
          [logoUrl]
        ).catch(() => {});
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function normalizeCompanyId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function isDemoCompany(companyId) {
  const id = normalizeCompanyId(companyId);
  if (id == null) return false;
  const hit = demoCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.isDemo;
  try {
    const r = await pool.query(`SELECT is_demo FROM companies WHERE id = $1`, [id]);
    const isDemo = !!r.rows[0]?.is_demo;
    demoCache.set(id, { isDemo, at: Date.now() });
    return isDemo;
  } catch (e) {
    // Column missing means no demo has ever been created on this database.
    if (e?.code === '42703') return false;
    throw e;
  }
}

function markDemoCompany(companyId) {
  const id = normalizeCompanyId(companyId);
  if (id != null) demoCache.set(id, { isDemo: true, at: Date.now() });
}

function isDemoRequest() {
  return !!requestContext.getStore()?.demo;
}

const RESERVED_DOMAIN_RE = /(^|\.)(example\.(com|org|net)|invalid|example|test|localhost)$/i;

function isUndeliverableAddress(address) {
  const raw = String(address || '').trim();
  const m = raw.match(/<([^>]+)>\s*$/);
  const email = (m ? m[1] : raw).toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return domain === DEMO_EMAIL_DOMAIN || domain.endsWith(`.${DEMO_EMAIL_DOMAIN}`) || RESERVED_DOMAIN_RE.test(domain);
}

function flattenRecipients(list) {
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (Array.isArray(item)) out.push(...flattenRecipients(item));
    else out.push(...String(item).split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

/**
 * Returns a reason string when the send must be dropped, otherwise null.
 * Fails closed: if the demo lookup itself errors, the send is dropped.
 */
async function outboundBlockReason({ companyId, emails = [] } = {}) {
  if (isDemoRequest()) return 'demo session';
  try {
    if (await isDemoCompany(companyId)) return 'demo company';
  } catch (e) {
    console.error('[demoGuard] demo lookup failed, dropping send:', e.message || e);
    return 'demo lookup failed';
  }
  if (flattenRecipients(emails).some(isUndeliverableAddress)) return 'reserved recipient domain';
  return null;
}

function decodeToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const NOT_IN_DEMO = { error: 'DEMO_RESTRICTED', message: 'This is not available in the demo.' };

/** Writes a demo workspace may never make. */
function isRestrictedInDemo(req, decoded) {
  const { method, path } = req;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;

  // Billing / integrations / invites / company identity
  if (path.startsWith('/api/stripe/')) return true;
  if (path.startsWith('/api/integrations')) return true;
  if (method === 'POST' && /^\/api\/companies\/?$/.test(path)) return true;
  if (/^\/api\/companies\/[^/]+\/invit/.test(path)) return true;
  if (path.startsWith('/api/invitations/')) return true;
  if (path === '/api/companies/slug') return true;

  // Settings area — demos are for looking around, not configuring the business
  if (path.startsWith('/api/companies/profile')) return true;
  if (path.startsWith('/api/company-defaults') || path.startsWith('/api/companies/defaults')) return true;
  if (path.startsWith('/api/email-templates')) return true;
  if (path.startsWith('/api/work-hours')) return true;
  if (path.startsWith('/api/company-users')) return true;
  if (path.startsWith('/api/companies/sms')) return true;
  if (path.startsWith('/api/companies/cancellation')) return true;
  if (path.startsWith('/api/companies/onboarding')) return true;
  if (/^\/api\/users?\/profile$/.test(path)) return true;

  return false;
}

/**
 * Marks requests made with a demo workspace token so every send further down
 * the call chain can see it, and refuses the few writes a demo must not make.
 */
async function demoRequestContext(req, res, next) {
  const decoded = decodeToken(req);
  const companyId = normalizeCompanyId(decoded?.activeCompanyId);
  if (!companyId || decoded?.overwatch) return next();

  let demo = false;
  try {
    demo = await isDemoCompany(companyId);
  } catch (e) {
    console.error('[demoGuard] context lookup failed:', e.message || e);
  }
  if (!demo) return next();

  if (isRestrictedInDemo(req, decoded)) return res.status(403).json(NOT_IN_DEMO);
  return requestContext.run({ demo: true, companyId }, next);
}

module.exports = {
  DEMO_EMAIL_DOMAIN,
  DEMO_LOGO_FILENAME,
  DEMO_LOGO_URL,
  ensureDemoSchema,
  ensureDemoLogoAsset,
  isSharedDemoLogoFilename,
  isDemoCompany,
  isDemoRequest,
  markDemoCompany,
  isUndeliverableAddress,
  outboundBlockReason,
  demoRequestContext,
};
