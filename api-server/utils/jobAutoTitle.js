/**
 * Auto-title generation for jobs that don't have an explicit title.
 *
 * Rules (agreed with product):
 *   - The fallback title is built from the job's services.
 *   - Service titles are joined with " + ".
 *   - Hard cap at 40 characters; longer titles are truncated and end with "…"
 *     (we use the three ASCII dots "..." for compatibility with email/PDF
 *     pipelines that may not handle the unicode ellipsis cleanly).
 *   - We NEVER overwrite a title the user has set; we only fill it in when
 *     the title column is NULL or whitespace-only.
 *   - If the job has no services yet, we leave the title alone (the caller
 *     can still write whatever default it wants — e.g. nothing).
 */

const AUTO_TITLE_MAX_LEN = 40;
const AUTO_TITLE_SEPARATOR = ' + ';
const AUTO_TITLE_ELLIPSIS = '...';

function buildAutoJobTitle(serviceTitles, maxLen = AUTO_TITLE_MAX_LEN) {
  if (!Array.isArray(serviceTitles) || serviceTitles.length === 0) return '';

  const cleaned = serviceTitles
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter((s) => s.length > 0);

  if (cleaned.length === 0) return '';

  const joined = cleaned.join(AUTO_TITLE_SEPARATOR);
  if (joined.length <= maxLen) return joined;

  // Reserve room for the ellipsis. Trim trailing whitespace / dangling
  // separator before appending so we don't end up with "Foo + ..." or
  // "Foo  ...".
  const sliceLen = Math.max(0, maxLen - AUTO_TITLE_ELLIPSIS.length);
  let head = joined.slice(0, sliceLen).replace(/\s+$/g, '');
  // Avoid leaving a trailing "+" mid-separator (e.g. "Foo +" → "Foo").
  while (head.length > 0 && /[+\s]$/.test(head)) {
    head = head.slice(0, -1).replace(/\s+$/g, '');
  }
  return head + AUTO_TITLE_ELLIPSIS;
}

/**
 * Fetch the service titles for a job, ordered the same way the UI lists them.
 * Returns an array of strings (custom_title takes precedence over the linked
 * service's title).
 */
async function fetchJobServiceTitles(dbClient, jobId) {
  const result = await dbClient.query(
    `SELECT COALESCE(NULLIF(TRIM(js.custom_title), ''), s.title) AS svc_title
       FROM job_services js
       LEFT JOIN services s ON js.service_id = s.id
      WHERE js.job_id = $1
      ORDER BY js.id ASC`,
    [jobId]
  );
  return result.rows.map((r) => r.svc_title).filter((t) => t && String(t).trim().length > 0);
}

/**
 * If the job's title is empty/null, replace it with the derived title.
 * Returns the title that ended up on the row (existing or newly written).
 *
 * Safe to call multiple times: only writes when the current title is empty.
 */
async function setJobAutoTitleIfEmpty(dbClient, jobId, maxLen = AUTO_TITLE_MAX_LEN) {
  if (jobId == null) return null;

  const cur = await dbClient.query(`SELECT title FROM jobs WHERE id = $1`, [jobId]);
  if (cur.rows.length === 0) return null;
  const existing = cur.rows[0].title;
  if (existing && String(existing).trim().length > 0) return existing;

  const titles = await fetchJobServiceTitles(dbClient, jobId);
  const derived = buildAutoJobTitle(titles, maxLen);
  if (!derived) return existing || '';

  await dbClient.query(`UPDATE jobs SET title = $2 WHERE id = $1`, [jobId, derived]);
  return derived;
}

/**
 * One-shot backfill for existing rows where the title is null or empty.
 * Designed to run at server boot. Idempotent — re-running does nothing once
 * every job has a title. Logs a one-line summary so deploys can confirm it
 * happened.
 */
async function backfillJobAutoTitles(pool, maxLen = AUTO_TITLE_MAX_LEN) {
  let updated = 0;
  try {
    const candidates = await pool.query(
      `SELECT id FROM jobs WHERE title IS NULL OR TRIM(title) = '' LIMIT 5000`
    );
    if (candidates.rows.length === 0) {
      return { updated: 0 };
    }

    // We do these one row at a time on a single shared connection so the
    // backfill stays gentle on the pool. With LIMIT 5000 we cap any single
    // pass; subsequent boots will keep chipping away if needed.
    const dbClient = await pool.connect();
    try {
      for (const row of candidates.rows) {
        try {
          const before = await dbClient.query(`SELECT title FROM jobs WHERE id = $1`, [row.id]);
          if (before.rows.length === 0) continue;
          const existing = before.rows[0].title;
          if (existing && String(existing).trim().length > 0) continue;

          const titles = await fetchJobServiceTitles(dbClient, row.id);
          const derived = buildAutoJobTitle(titles, maxLen);
          if (!derived) continue;

          await dbClient.query(`UPDATE jobs SET title = $2 WHERE id = $1`, [row.id, derived]);
          updated += 1;
        } catch (rowErr) {
          // Don't let one bad row abort the whole backfill.
          console.warn('[jobAutoTitle] backfill row failed for job', row.id, rowErr.message || rowErr);
        }
      }
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.warn('[jobAutoTitle] backfill skipped:', err.message || err);
  }

  if (updated > 0) {
    console.log(`[jobAutoTitle] Backfilled ${updated} untitled job${updated === 1 ? '' : 's'} from their services.`);
  }
  return { updated };
}

module.exports = {
  AUTO_TITLE_MAX_LEN,
  AUTO_TITLE_SEPARATOR,
  buildAutoJobTitle,
  fetchJobServiceTitles,
  setJobAutoTitleIfEmpty,
  backfillJobAutoTitles,
};
