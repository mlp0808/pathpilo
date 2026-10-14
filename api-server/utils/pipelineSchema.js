/**
 * Lead → offer → booking pipeline: notifications, pending bookings on jobs and
 * the extra lead status. Idempotent; memoised per process.
 */

const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

let ensured = null;

async function run(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      type VARCHAR(40) NOT NULL,
      entity_type VARCHAR(20),
      entity_id INTEGER,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_notifications_company_created ON notifications(company_id, created_at DESC)'
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (notification_id, user_id)
    )
  `);

  // 'pending' = created from an accepted offer, waiting for the admin to confirm.
  await pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS booking_status VARCHAR(20)');
  await pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS offer_id INTEGER');

  const check = await pool.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'leads'::regclass AND conname = 'leads_status_check'`
  );
  const def = check.rows[0]?.def || '';
  if (!LEAD_STATUSES.every((s) => def.includes(`'${s}'`))) {
    await pool.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check');
    await pool.query(
      `ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (${LEAD_STATUSES.map((s) => `'${s}'`).join(', ')}))`
    );
  }
}

function ensurePipelineSchema(pool) {
  if (!ensured) {
    ensured = run(pool).catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

module.exports = { ensurePipelineSchema, LEAD_STATUSES };
