/**
 * Lightweight login / session-start tracking for the super-admin activity views.
 * One row per successful login; daily active companies = COUNT(DISTINCT company_id) per day.
 */

let schemaReady = null;

function getRequestMeta(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    req.ip ||
    null;
  const userAgent = req.headers['user-agent'] || null;
  return { ip, userAgent };
}

async function initActivitySchema(pool) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_login_events (
        id          BIGSERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        ip          TEXT,
        user_agent  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_login_events_user_created
        ON user_login_events (user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_login_events_company_created
        ON user_login_events (company_id, created_at DESC)
    `);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Record a session start after a successful login. Fire-and-forget safe. */
async function recordLoginEvent(pool, { userId, companyId, ip, userAgent }) {
  await initActivitySchema(pool);
  const uid = userId != null && Number(userId) > 0 ? Number(userId) : null;
  const cid = companyId != null && Number(companyId) > 0 ? Number(companyId) : null;

  await pool.query(
    `INSERT INTO user_login_events (user_id, company_id, ip, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [uid, cid, ip || null, userAgent || null]
  );

  if (uid) {
    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [uid]);
  }
}

module.exports = {
  initActivitySchema,
  getRequestMeta,
  recordLoginEvent,
};
