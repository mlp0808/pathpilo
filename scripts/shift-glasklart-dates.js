/**
 * Shift schedule dates for the Glasklart demo company so the densest job week
 * lands on the current calendar week (keeps structure, just moves time).
 *
 * Usage: node scripts/shift-glasklart-dates.js
 */
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
})

async function shiftCompany(companyId, days) {
  if (!Number.isFinite(days) || days === 0) return
  await pool.query(
    `UPDATE jobs
     SET scheduled_date = to_char(scheduled_date::date + ($2 || ' days')::interval, 'YYYY-MM-DD')
     WHERE company_id = $1`,
    [companyId, String(days)]
  )
  await pool.query(
    `UPDATE recurring_jobs
     SET starting_date = CASE WHEN starting_date IS NULL THEN NULL
                              ELSE starting_date + ($2 || ' days')::interval END,
         next_occurrence_date = CASE WHEN next_occurrence_date IS NULL THEN NULL
                                     ELSE next_occurrence_date + ($2 || ' days')::interval END,
         last_generated_date = CASE WHEN last_generated_date IS NULL THEN NULL
                                    ELSE last_generated_date + ($2 || ' days')::interval END,
         paused_at = CASE WHEN paused_at IS NULL THEN NULL
                          ELSE paused_at + ($2 || ' days')::interval END
     WHERE company_id = $1`,
    [companyId, String(days)]
  )
  await pool.query(
    `UPDATE daily_routes
     SET scheduled_date = scheduled_date + ($2 || ' days')::interval
     WHERE company_id = $1`,
    [companyId, String(days)]
  ).catch(() => {})
  await pool.query(
    `UPDATE invoices
     SET issue_date = CASE WHEN issue_date IS NULL THEN NULL
                           ELSE issue_date + ($2 || ' days')::interval END,
         due_date = CASE WHEN due_date IS NULL THEN NULL
                         ELSE due_date + ($2 || ' days')::interval END
     WHERE company_id = $1`,
    [companyId, String(days)]
  ).catch(() => {})
  await pool.query(
    `UPDATE jobs
     SET status = CASE
       WHEN scheduled_date::date < CURRENT_DATE THEN 'completed'
       WHEN status = 'cancelled' THEN 'cancelled'
       ELSE 'scheduled'
     END
     WHERE company_id = $1
       AND status IN ('scheduled', 'completed')`,
    [companyId]
  )
}

async function main() {
  const company = await pool.query(
    `SELECT id, slug, name FROM companies
     WHERE slug IN ('glasklart', 'glasklart-vinduespudsning')
        OR name ILIKE '%glasklart%'
     ORDER BY id
     LIMIT 1`
  )
  if (!company.rows[0]) {
    console.error('No Glasklart company found')
    process.exit(1)
  }
  const companyId = company.rows[0].id
  console.log(`Company: ${company.rows[0].name} (${company.rows[0].slug}) id=${companyId}`)

  const span = await pool.query(
    `SELECT MIN(scheduled_date) AS min_d, MAX(scheduled_date) AS max_d, COUNT(*)::int AS n
     FROM jobs WHERE company_id = $1`,
    [companyId]
  )
  console.log('Jobs before:', span.rows[0])

  // Align the densest job week with the current calendar week.
  const mid = await pool.query(
    `WITH weeks AS (
       SELECT date_trunc('week', scheduled_date::date)::date AS week_start, COUNT(*)::int AS n
       FROM jobs WHERE company_id = $1
       GROUP BY 1
     ),
     densest AS (
       SELECT week_start FROM weeks ORDER BY n DESC, week_start DESC LIMIT 1
     )
     SELECT (
       date_trunc('week', CURRENT_DATE)::date
       - (SELECT week_start FROM densest)
     )::int AS days`,
    [companyId]
  )
  const days = Number(mid.rows[0].days)
  if (!Number.isFinite(days) || days === 0) {
    console.log(`No shift needed (days=${days})`)
    return
  }
  console.log(`Shifting by ${days} day(s)…`)

  await pool.query('BEGIN')
  try {
    await shiftCompany(companyId, days)
    await pool.query('COMMIT')
  } catch (e) {
    await pool.query('ROLLBACK')
    throw e
  }

  const after = await pool.query(
    `SELECT MIN(scheduled_date) AS min_d, MAX(scheduled_date) AS max_d,
            COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE scheduled_date = to_char(CURRENT_DATE, 'YYYY-MM-DD'))::int AS today
     FROM jobs WHERE company_id = $1`,
    [companyId]
  )
  console.log('Jobs after:', after.rows[0])
  console.log('Done. Log in as admin@glasklart.dk / demo1234 (or mikkel@glasklart.dk).')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => pool.end())
