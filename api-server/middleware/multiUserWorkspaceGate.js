const { getWorkspaceAccess } = require('../utils/companyPlanAccess');

/** Paths that skip the multi-user workspace gate (auth, billing, company pickers, etc.). */
const SKIP_PREFIXES = [
  '/api/auth',
  '/api/admin',
  '/api/trial',
  '/api/public',
  '/api/stripe/webhook',
  '/api/invitations',
];

const SKIP_EXACT = new Set([
  '/api/user/profile',
  '/api/companies/workspace-access',
  '/api/companies/switch',
  '/api/stripe/subscription',
  '/api/stripe/checkout',
  '/api/stripe/portal',
  '/api/health',
]);

function shouldSkipWorkspaceGate(path) {
  if (SKIP_EXACT.has(path)) return true;
  if (path.startsWith('/api/companies/slug/')) return true;
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Blocks non-owner members when their active company is no longer on Pro.
 * Owners keep access on Standard so they can upgrade.
 */
async function multiUserWorkspaceGate(req, res, next) {
  try {
    if (shouldSkipWorkspaceGate(req.path)) return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return next();
    }

    if (decoded.overwatch) return next();

    const companyId = decoded.activeCompanyId;
    if (!companyId) return next();

    const access = await getWorkspaceAccess(decoded.userId, companyId);
    if (!access.blocked) return next();

    return res.status(403).json({
      error: 'MULTI_USER_ACCESS_DENIED',
      message:
        'This company no longer supports multiple users. Contact the company owner to upgrade the plan.',
      companyName: access.companyName,
      owner: access.owner,
    });
  } catch (err) {
    console.error('[workspace-gate]', err.message);
    return next();
  }
}

module.exports = { multiUserWorkspaceGate, shouldSkipWorkspaceGate };
