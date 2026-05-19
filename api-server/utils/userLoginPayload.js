const { pool } = require('./database');

const DEFAULT_LANGUAGE_CODE = 'en';
const DEFAULT_COUNTRY_CODE = 'DK';

/**
 * Membership companies for a user (same shape as POST /auth/login).
 */
async function fetchUserCompanies(userId) {
  const companiesResult = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        COALESCE(c.slug, LOWER(REGEXP_REPLACE(c.name, '[^a-z0-9]+', '-', 'g'))) AS slug,
        uc.role AS user_role,
        c.owner_id,
        c.country_code,
        c.suspended_at,
        CASE WHEN c.owner_id = $1 THEN true ELSE false END AS is_owner
      FROM user_companies uc
      JOIN companies c ON uc.company_id = c.id
      WHERE uc.user_id = $1
      ORDER BY is_owner DESC, c.created_at ASC
    `,
    [userId]
  );
  return companiesResult.rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    countryCode: c.country_code || DEFAULT_COUNTRY_CODE,
    role: c.user_role,
    isOwner: c.is_owner,
    suspendedAt: c.suspended_at || null,
  }));
}

/**
 * Pending team invitations for an email (not yet accepted / cancelled).
 */
async function fetchPendingInvitesForEmail(email) {
  if (!email || !String(email).trim()) return [];
  const result = await pool.query(
    `
      SELECT
        ci.token,
        ci.role,
        ci.expires_at,
        c.name AS company_name,
        COALESCE(c.slug, LOWER(REGEXP_REPLACE(c.name, '[^a-z0-9]+', '-', 'g'))) AS company_slug,
        u.first_name,
        u.last_name
      FROM company_invitations ci
      JOIN companies c ON c.id = ci.company_id
      LEFT JOIN users u ON ci.invited_by_user_id = u.id
      WHERE LOWER(TRIM(ci.email)) = LOWER(TRIM($1))
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
      ORDER BY ci.created_at ASC
    `,
    [email]
  );
  return result.rows.map((row) => ({
    token: row.token,
    role: row.role,
    companyName: row.company_name,
    companySlug: row.company_slug,
    expiresAt: row.expires_at,
    invitedByName: row.first_name
      ? `${row.first_name} ${row.last_name || ''}`.trim()
      : 'Your team',
  }));
}

module.exports = {
  fetchUserCompanies,
  fetchPendingInvitesForEmail,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_COUNTRY_CODE,
};
