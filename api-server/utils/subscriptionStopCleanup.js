/**
 * When a subscription ends or a client is anonymized: stop recurring rows and
 * remove materialized jobs that are still "planned" (from today onward),
 * without touching completed work or anything tied to an invoice.
 */

function todayYmdUtc() {
  return new Date().toISOString().split('T')[0];
}

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
       AND j.scheduled_date >= $3::date
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
       AND j.scheduled_date >= $3::date
       AND j.status NOT IN ('completed', 'sub_completed')
       AND j.invoice_id IS NULL`,
    [companyId, clientId, asOf]
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
  deactivateSubscriptionsForClient,
};
