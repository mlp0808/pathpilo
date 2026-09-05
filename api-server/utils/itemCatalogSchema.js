/**
 * Item catalog schema foundation + cancellation-fee settings.
 *
 * Evolve `services` in place (stable IDs) with:
 *   - item_groups (default locked "Services" group per company)
 *   - services.group_id / system_key for special catalog rows
 *   - company cancellation fee flags
 *   - jobs.job_kind + fee linkage columns
 *
 * Idempotent; safe to call on every request that needs the catalog.
 */

let migrationDone = false

const SYSTEM_SERVICES_GROUP_KEY = 'services'
const SYSTEM_CANCELLATION_FEE_KEY = 'cancellation_fee'

async function ensureItemCatalogSchema(pool) {
  if (migrationDone) return
  migrationDone = true

  const stmts = [
    `CREATE TABLE IF NOT EXISTS item_groups (
       id SERIAL PRIMARY KEY,
       company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
       key VARCHAR(64) NOT NULL,
       name VARCHAR(255) NOT NULL,
       is_system BOOLEAN NOT NULL DEFAULT FALSE,
       meta_fields TEXT[] NOT NULL DEFAULT ARRAY['price','duration']::TEXT[],
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       UNIQUE (company_id, key)
     )`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES item_groups(id) ON DELETE SET NULL`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS system_key VARCHAR(64)`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS cancellation_fee_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS cancellation_fee_service_id INTEGER REFERENCES services(id) ON DELETE SET NULL`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_kind VARCHAR(32) NOT NULL DEFAULT 'standard'`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_cancelled_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_fee_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL`,
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS default_quantity NUMERIC(12,3) NOT NULL DEFAULT 1`,
    `ALTER TABLE job_services ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3) NOT NULL DEFAULT 1`,
    `ALTER TABLE recurring_job_services ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3) NOT NULL DEFAULT 1`,
  ]

  for (const sql of stmts) {
    try {
      await pool.query(sql)
    } catch (e) {
      console.warn('[itemCatalogSchema]', e?.message || e)
    }
  }

  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS services_company_system_key_uq
       ON services (company_id, system_key)
       WHERE system_key IS NOT NULL`,
    )
  } catch (e) {
    console.warn('[itemCatalogSchema] unique index:', e?.message || e)
  }
}

/** Ensure the locked default "Services" group exists and existing catalog rows are attached. */
async function ensureCompanyServicesGroup(pool, companyId) {
  await ensureItemCatalogSchema(pool)
  const existing = await pool.query(
    `SELECT id FROM item_groups WHERE company_id = $1 AND key = $2 LIMIT 1`,
    [companyId, SYSTEM_SERVICES_GROUP_KEY],
  )
  let groupId = existing.rows[0]?.id
  if (!groupId) {
    const ins = await pool.query(
      `INSERT INTO item_groups (company_id, key, name, is_system, meta_fields, sort_order)
       VALUES ($1, $2, 'Services', TRUE, ARRAY['price','duration']::TEXT[], 0)
       ON CONFLICT (company_id, key) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [companyId, SYSTEM_SERVICES_GROUP_KEY],
    )
    groupId = ins.rows[0].id
  }
  await pool.query(
    `UPDATE services
     SET group_id = $1
     WHERE company_id = $2
       AND group_id IS NULL
       AND (system_key IS NULL OR system_key <> $3)`,
    [groupId, companyId, SYSTEM_CANCELLATION_FEE_KEY],
  )
  return groupId
}

/**
 * Upsert the hidden system "cancellation fee" catalog item and return it.
 * Duration is always 0 — fees are not work time.
 */
async function ensureCancellationFeeService(pool, companyId, { title, price } = {}) {
  await ensureCompanyServicesGroup(pool, companyId)
  const safeTitle = (title && String(title).trim()) || 'Cancellation fee'
  const safePrice = Number.isFinite(Number(price)) ? Number(price) : 0

  const existing = await pool.query(
    `SELECT * FROM services
     WHERE company_id = $1 AND system_key = $2
     LIMIT 1`,
    [companyId, SYSTEM_CANCELLATION_FEE_KEY],
  )
  if (existing.rows[0]) {
    const row = existing.rows[0]
    if (title != null || price != null) {
      const updated = await pool.query(
        `UPDATE services
         SET title = COALESCE($1, title),
             price = COALESCE($2, price),
             duration_minutes = 0,
             is_system = TRUE,
             system_key = $3,
             archived_at = NULL,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          title != null ? safeTitle : null,
          price != null ? safePrice : null,
          SYSTEM_CANCELLATION_FEE_KEY,
          row.id,
        ],
      )
      return updated.rows[0]
    }
    return row
  }

  const ins = await pool.query(
    `INSERT INTO services
       (company_id, title, price, duration_minutes, is_system, system_key, archived_at)
     VALUES ($1, $2, $3, 0, TRUE, $4, NULL)
     RETURNING *`,
    [companyId, safeTitle, safePrice, SYSTEM_CANCELLATION_FEE_KEY],
  )
  return ins.rows[0]
}

async function getCancellationFeeSettings(pool, companyId) {
  await ensureItemCatalogSchema(pool)
  const company = await pool.query(
    `SELECT cancellation_fee_enabled, cancellation_fee_service_id
     FROM companies WHERE id = $1`,
    [companyId],
  )
  const enabled = !!company.rows[0]?.cancellation_fee_enabled
  let service = null
  const sid = company.rows[0]?.cancellation_fee_service_id
  if (sid) {
    const s = await pool.query(`SELECT * FROM services WHERE id = $1 AND company_id = $2`, [sid, companyId])
    service = s.rows[0] || null
  }
  if (!service) {
    const byKey = await pool.query(
      `SELECT * FROM services WHERE company_id = $1 AND system_key = $2 LIMIT 1`,
      [companyId, SYSTEM_CANCELLATION_FEE_KEY],
    )
    service = byKey.rows[0] || null
  }
  return {
    enabled,
    title: service?.title || 'Cancellation fee',
    price: service ? Number(service.price) || 0 : 0,
    service_id: service?.id ?? null,
  }
}

async function setCancellationFeeSettings(pool, companyId, { enabled, title, price } = {}) {
  const current = await getCancellationFeeSettings(pool, companyId)
  const nextEnabled = enabled === undefined ? current.enabled : !!enabled
  const nextTitle = title !== undefined && title !== null ? String(title).trim() || 'Cancellation fee' : current.title
  const nextPrice = price !== undefined && price !== null && price !== ''
    ? Number(price)
    : current.price

  const service = await ensureCancellationFeeService(pool, companyId, {
    title: nextTitle,
    price: Number.isFinite(nextPrice) ? nextPrice : 0,
  })
  await pool.query(
    `UPDATE companies
     SET cancellation_fee_enabled = $1,
         cancellation_fee_service_id = $2
     WHERE id = $3`,
    [nextEnabled, service.id, companyId],
  )
  return getCancellationFeeSettings(pool, companyId)
}

/**
 * Format visit date for invoice / fee line copy.
 * @param {string|Date|null} dateVal
 */
function formatVisitDateForFee(dateVal) {
  if (!dateVal) return null
  const raw = String(dateVal).slice(0, 10)
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * After a job is cancelled: optionally create a completed fee job that can be invoiced.
 * Returns the fee job row or null.
 */
async function createCancellationFeeJob(pool, {
  companyId,
  cancelledJob,
  chargeFee = true,
}) {
  await ensureItemCatalogSchema(pool)
  if (!chargeFee) return null

  const settings = await getCancellationFeeSettings(pool, companyId)
  if (!settings.enabled || !(settings.price > 0) || !settings.service_id) return null

  // Already charged?
  if (cancelledJob.cancellation_fee_job_id) {
    const existing = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [cancelledJob.cancellation_fee_job_id])
    return existing.rows[0] || null
  }

  const visitLabel = formatVisitDateForFee(cancelledJob.scheduled_date)
  const lineTitle = visitLabel
    ? `Cancellation fee — visit on ${visitLabel}`
    : (settings.title || 'Cancellation fee')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const jobIns = await client.query(
      `INSERT INTO jobs
         (company_id, client_id, assigned_user_id, title, note, scheduled_date,
          scheduled_time_from, scheduled_time_to, status, job_kind, source_cancelled_job_id, sort_order)
       VALUES ($1, $2, $3, $4, NULL, $5, NULL, NULL, 'completed', 'cancellation_fee', $6, 0)
       RETURNING *`,
      [
        companyId,
        cancelledJob.client_id,
        cancelledJob.assigned_user_id ?? null,
        lineTitle,
        cancelledJob.scheduled_date || null,
        cancelledJob.id,
      ],
    )
    const feeJob = jobIns.rows[0]

    await client.query(
      `INSERT INTO job_services
         (job_id, service_id, custom_title, custom_price, custom_duration_minutes, status, completed_at)
       VALUES ($1, $2, $3, $4, 0, 'completed', NOW())`,
      [feeJob.id, settings.service_id, lineTitle, settings.price],
    )

    await client.query(
      `UPDATE jobs SET cancellation_fee_job_id = $1, updated_at = NOW() WHERE id = $2`,
      [feeJob.id, cancelledJob.id],
    )

    await client.query('COMMIT')
    return feeJob
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) { /* ignore */ }
    throw e
  } finally {
    client.release()
  }
}

module.exports = {
  SYSTEM_SERVICES_GROUP_KEY,
  SYSTEM_CANCELLATION_FEE_KEY,
  ALLOWED_META_FIELDS: ['price', 'duration', 'quantity'],
  ensureItemCatalogSchema,
  ensureCompanyServicesGroup,
  ensureCancellationFeeService,
  getCancellationFeeSettings,
  setCancellationFeeSettings,
  formatVisitDateForFee,
  createCancellationFeeJob,
  normalizeMetaFields,
  slugifyGroupKey,
}

/** @param {unknown} raw */
function normalizeMetaFields(raw) {
  const allowed = new Set(['price', 'duration', 'quantity'])
  const list = Array.isArray(raw) ? raw : []
  const out = []
  for (const f of list) {
    const key = String(f || '').trim().toLowerCase()
    if (allowed.has(key) && !out.includes(key)) out.push(key)
  }
  // Always keep price — catalog items are monetary.
  if (!out.includes('price')) out.unshift('price')
  return out
}

function slugifyGroupKey(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'group'
}
