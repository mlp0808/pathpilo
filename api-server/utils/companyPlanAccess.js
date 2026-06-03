const { pool } = require('./database');

/**
 * Whether a company row currently has Pro / multi-user access.
 * Mirrors the client-side hasProPlanAccess logic using DB fields only.
 */
function hasProPlanAccessFromCompany(company) {
  if (!company) return false;
  const plan = company.plan || 'standard';
  if (plan !== 'pro') return false;
  if (company.stripe_subscription_id) return true;
  if (company.expires_at) {
    return new Date(company.expires_at).getTime() > Date.now();
  }
  return true;
}

function formatOwnerName(owner) {
  if (!owner) return null;
  const name = `${owner.first_name || ''} ${owner.last_name || ''}`.trim();
  return name || owner.email || null;
}

/**
 * Resolve whether the user may use this company workspace (multi-user access).
 * Owners always retain access on Standard so they can upgrade.
 */
async function getWorkspaceAccess(userId, companyId, { allowOverwatch = false, overwatch = false } = {}) {
  if (!companyId) {
    return {
      hasProAccess: false,
      isOwner: false,
      role: null,
      blocked: false,
      companyName: null,
      owner: null,
    };
  }

  const [companyRes, membershipRes] = await Promise.all([
    pool.query(
      `SELECT c.id, c.name, c.plan, c.expires_at, c.stripe_subscription_id, c.owner_id,
              u.first_name AS owner_first_name, u.last_name AS owner_last_name, u.email AS owner_email
       FROM companies c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = $1`,
      [companyId]
    ),
    pool.query(
      'SELECT role FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    ),
  ]);

  if (companyRes.rows.length === 0 || membershipRes.rows.length === 0) {
    return {
      hasProAccess: false,
      isOwner: false,
      role: null,
      blocked: false,
      companyName: null,
      owner: null,
    };
  }

  const company = companyRes.rows[0];
  const role = membershipRes.rows[0].role;
  const isOwner = role === 'owner';
  const hasProAccess = hasProPlanAccessFromCompany(company);
  const owner = {
    firstName: company.owner_first_name || '',
    lastName: company.owner_last_name || '',
    email: company.owner_email || '',
    name: formatOwnerName({
      first_name: company.owner_first_name,
      last_name: company.owner_last_name,
      email: company.owner_email,
    }),
  };

  const blocked = allowOverwatch && overwatch ? false : !hasProAccess && !isOwner;

  return {
    hasProAccess,
    isOwner,
    role,
    blocked,
    companyName: company.name,
    owner,
  };
}

module.exports = {
  hasProPlanAccessFromCompany,
  getWorkspaceAccess,
};
