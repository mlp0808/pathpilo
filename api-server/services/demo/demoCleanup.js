/**
 * Hard-deletes expired demo workspaces so the database only ever holds the
 * demos that are currently alive (rows are removed, autovacuum reuses space).
 */
const { pool } = require('../../utils/database');
const { ensureDemoSchema, DEMO_EMAIL_DOMAIN } = require('../../utils/demoGuard');

const SWEEP_EVERY_MS = 30 * 60 * 1000;
const BATCH = 25;

/**
 * Without these, every cascaded row delete seq-scans the child table (a demo
 * has ~6k jobs, so deleting one would scan `jobs` thousands of times).
 */
const FK_INDEXES = [
  ['jobs_recurring_job_id_idx', 'jobs (recurring_job_id) WHERE recurring_job_id IS NOT NULL'],
  ['jobs_cancellation_fee_job_id_idx', 'jobs (cancellation_fee_job_id) WHERE cancellation_fee_job_id IS NOT NULL'],
  ['jobs_source_cancelled_job_id_idx', 'jobs (source_cancelled_job_id) WHERE source_cancelled_job_id IS NOT NULL'],
  ['invoice_items_job_id_idx', 'invoice_items (job_id)'],
  ['invoice_items_service_id_idx', 'invoice_items (service_id)'],
  ['job_services_service_id_idx', 'job_services (service_id)'],
  ['invoices_client_id_idx', 'invoices (client_id)'],
  ['invoices_created_by_idx', 'invoices (created_by)'],
  ['job_logs_job_id_idx', 'job_logs (job_id)'],
  ['job_notes_job_id_idx', 'job_notes (job_id)'],
  ['automated_email_sends_job_id_idx', 'automated_email_sends (job_id)'],
  ['scheduled_automation_sends_job_id_idx', 'scheduled_automation_sends (job_id)'],
  ['automated_invoice_email_sends_invoice_id_idx', 'automated_invoice_email_sends (invoice_id)'],
  ['scheduled_invoice_reminder_sends_invoice_id_idx', 'scheduled_invoice_reminder_sends (invoice_id)'],
  ['recurring_job_services_service_id_idx', 'recurring_job_services (service_id)'],
  ['recurring_jobs_assigned_user_id_idx', 'recurring_jobs (assigned_user_id)'],
  ['round_stops_recurring_job_id_idx', 'round_stops (recurring_job_id)'],
  ['round_stops_client_id_idx', 'round_stops (client_id)'],
  ['daily_routes_user_id_idx', 'daily_routes (user_id)'],
  ['user_company_work_hours_company_id_idx', 'user_company_work_hours (company_id)'],
  ['leads_client_id_idx', 'leads (client_id) WHERE client_id IS NOT NULL'],
];

let indexesReady = null;
function ensureDemoCleanupIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      for (const [name, target] of FK_INDEXES) {
        try {
          await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${target}`);
        } catch (e) {
          if (e?.code !== '42P01' && e?.code !== '42703') console.warn(`[demo] index ${name} failed:`, e.message || e);
        }
      }
    })();
  }
  return indexesReady;
}

/** Tables without a cascading FK to companies; missing tables are skipped. */
async function optionalDelete(db, sql, params) {
  await db.query('SAVEPOINT demo_cleanup_step');
  try {
    await db.query(sql, params);
    await db.query('RELEASE SAVEPOINT demo_cleanup_step');
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT demo_cleanup_step');
    if (e?.code !== '42P01' && e?.code !== '42703') throw e;
  }
}

async function deleteDemoWorkspace(companyId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const company = await db.query(
      `SELECT id FROM companies WHERE id = $1 AND is_demo = TRUE FOR UPDATE`,
      [companyId]
    );
    if (!company.rows[0]) {
      await db.query('ROLLBACK');
      return false;
    }

    // Only throwaway demo logins are removed — never a real account.
    const users = await db.query(
      `SELECT u.id FROM users u
       WHERE (u.company_id = $1 OR u.id IN (SELECT user_id FROM user_companies WHERE company_id = $1))
         AND LOWER(u.email) LIKE $2`,
      [companyId, `%@${DEMO_EMAIL_DOMAIN}`]
    );
    const userIds = users.rows.map((r) => r.id);

    await optionalDelete(db, `DELETE FROM leads WHERE company_id = $1`, [companyId]);
    await optionalDelete(db, `DELETE FROM offers WHERE company_id = $1`, [companyId]);
    await optionalDelete(db, `DELETE FROM lead_forms WHERE company_id = $1`, [companyId]);
    await optionalDelete(db, `DELETE FROM notifications WHERE company_id = $1`, [companyId]);
    await optionalDelete(db, `DELETE FROM user_guide_progress WHERE company_id = $1 OR user_id = ANY($2::int[])`, [companyId, userIds]);
    await optionalDelete(db, `DELETE FROM activity_events WHERE company_id = $1 OR user_id = ANY($2::int[])`, [companyId, userIds]);
    await optionalDelete(db, `DELETE FROM user_login_events WHERE company_id = $1 OR user_id = ANY($2::int[])`, [companyId, userIds]);
    await optionalDelete(db, `DELETE FROM secure_notes_audit WHERE user_id = ANY($1::int[])`, [userIds]);

    await db.query(`UPDATE users SET company_id = NULL WHERE company_id = $1`, [companyId]);
    await db.query(`UPDATE companies SET owner_id = NULL WHERE id = $1`, [companyId]);
    await db.query(`DELETE FROM companies WHERE id = $1`, [companyId]);

    if (userIds.length) {
      await optionalDelete(db, `DELETE FROM notification_reads WHERE user_id = ANY($1::int[])`, [userIds]);
      await db.query(
        `DELETE FROM users u
         WHERE u.id = ANY($1::int[])
           AND NOT EXISTS (SELECT 1 FROM user_companies uc WHERE uc.user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.owner_id = u.id)`,
        [userIds]
      );
    }

    await db.query('COMMIT');
    return true;
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

async function sweepExpiredDemos() {
  await ensureDemoSchema();
  await ensureDemoCleanupIndexes();
  const expired = await pool.query(
    `SELECT id FROM companies
     WHERE is_demo = TRUE AND demo_expires_at IS NOT NULL AND demo_expires_at < NOW()
     ORDER BY demo_expires_at ASC
     LIMIT ${BATCH}`
  );
  let deleted = 0;
  for (const row of expired.rows) {
    try {
      if (await deleteDemoWorkspace(row.id)) deleted += 1;
    } catch (e) {
      console.error('[demo] failed to delete expired demo', row.id, e.message || e);
    }
  }
  if (deleted) console.log(`[demo] deleted ${deleted} expired demo workspace(s)`);
  return deleted;
}

function startDemoCleanup() {
  const run = () => sweepExpiredDemos().catch((e) => console.error('[demo] sweep failed:', e.message || e));
  setTimeout(() => {
    ensureDemoCleanupIndexes().finally(run);
  }, 30 * 1000);
  setInterval(run, SWEEP_EVERY_MS);
}

module.exports = { deleteDemoWorkspace, sweepExpiredDemos, startDemoCleanup, ensureDemoCleanupIndexes };
