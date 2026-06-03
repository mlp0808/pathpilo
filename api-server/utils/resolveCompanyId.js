/**
 * Resolve the active company for an authenticated user (JWT + fallbacks).
 * Used during setup when the token may not yet include activeCompanyId.
 */
async function resolveCompanyIdForUser(pool, user, bodyCompanyId) {
  const userId = user?.userId ?? user?.id ?? null;
  if (!userId) return null;

  let companyId =
    bodyCompanyId != null
      ? Number(bodyCompanyId)
      : user?.activeCompanyId ?? user?.companyId ?? null;

  if (!companyId) {
    const membership = await pool.query(
      `SELECT uc.company_id
       FROM user_companies uc
       WHERE uc.user_id = $1
       ORDER BY CASE WHEN uc.role = 'owner' THEN 0 ELSE 1 END, uc.company_id ASC
       LIMIT 1`,
      [userId]
    );
    companyId = membership.rows[0]?.company_id ?? null;
  }

  if (!companyId) {
    const owned = await pool.query(
      'SELECT id FROM companies WHERE owner_id = $1 ORDER BY id DESC LIMIT 1',
      [userId]
    );
    companyId = owned.rows[0]?.id ?? null;
  }

  if (!companyId) return null;

  const exists = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
  if (!exists.rows.length) return null;

  const linked = await pool.query(
    'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
    [userId, companyId]
  );
  if (linked.rows.length === 0) {
    const isOwner = await pool.query(
      'SELECT 1 FROM companies WHERE id = $1 AND owner_id = $2',
      [companyId, userId]
    );
    if (isOwner.rows.length === 0) return null;
  }

  return companyId;
}

module.exports = { resolveCompanyIdForUser };
