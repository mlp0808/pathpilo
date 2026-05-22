/**
 * When a subscription ends or a client is anonymized: stop recurring rows and
 * remove materialized jobs that are still "planned" (from today onward),
 * without touching completed work or anything tied to an invoice.
 */

function todayYmdUtc() {
  return new Date().toISOString().split('T')[0];
}

/**
 * `jobs.scheduled_date` is stored as VARCHAR in many deployments — cast before
 * comparing to a date parameter so Postgres does not error with
 * "operator does not exist: character varying >= date".
 */
const FUTURE_JOB_DATE_SQL = 'j.scheduled_date::date >= $3::date';

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<number>} deleted row count
 */
async function deleteFutureNonCompletedJobsForSubscription(db, companyId, subscriptionId, options = {}) {
  const asOf = options.asOfDate || todayYmdUtc();
  const result = await db.query(
    `DELETE FROM jobs j
     WHERE j.company_id = $1
       AND j.recurring_job_id = $2
       AND ${FUTURE_JOB_DATE_SQL}
       AND j.status NOT IN ('completed', 'sub_completed')
       AND j.invoice_id IS NULL`,
    [companyId, subscriptionId, asOf]
  );
  return result.rowCount || 0;
}

/**
 * One-off and subscription-backed jobs for this client from `asOf` onward.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<number>}
 */
async function deleteFutureNonCompletedJobsForClient(db, companyId, clientId, options = {}) {
  const asOf = options.asOfDate || todayYmdUtc();
  const result = await db.query(
    `DELETE FROM jobs j
     WHERE j.company_id = $1
       AND j.client_id = $2
       AND ${FUTURE_JOB_DATE_SQL}
       AND j.status NOT IN ('completed', 'sub_completed')
       AND j.invoice_id IS NULL`,
    [companyId, clientId, asOf]
  );
  return result.rowCount || 0;
}

/**
 * Pause-style cleanup plus full removal of the subscription row (and its services).
 * Past/completed/invoiced jobs stay; their link to the subscription is cleared.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<number>} 1 if the recurring_jobs row was deleted, else 0
 */
async function removeSubscriptionCompletely(db, companyId, subscriptionId, options = {}) {
  await deleteFutureNonCompletedJobsForSubscription(db, companyId, subscriptionId, options);

  await db.query(
    `UPDATE jobs
     SET recurring_job_id = NULL, recurring_occurrence = NULL
     WHERE company_id = $1 AND recurring_job_id = $2`,
    [companyId, subscriptionId]
  );

  await db.query(
    'DELETE FROM recurring_job_services WHERE recurring_job_id = $1',
    [subscriptionId]
  );

  const result = await db.query(
    'DELETE FROM recurring_jobs WHERE id = $1 AND company_id = $2',
    [subscriptionId, companyId]
  );
  return result.rowCount || 0;
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<number>} rows updated
 */
async function deactivateSubscriptionsForClient(db, companyId, clientId) {
  const result = await db.query(
    `UPDATE recurring_jobs
     SET is_active = false, updated_at = NOW()
     WHERE company_id = $1 AND client_id = $2 AND is_active = true`,
    [companyId, clientId]
  );
  return result.rowCount || 0;
}

module.exports = {
  todayYmdUtc,
  deleteFutureNonCompletedJobsForSubscription,
  deleteFutureNonCompletedJobsForClient,
  removeSubscriptionCompletely,
  deactivateSubscriptionsForClient,
};
