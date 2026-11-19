const { GUIDE_SEED } = require('./guideSeed');

let schemaReady = null;

/** Count keys a step can auto-complete on. Mirrors ROADMAP_COUNT_QUERIES. */
const GUIDE_COUNT_KEYS = [
  'clients',
  'services',
  'jobs',
  'jobs_same_day',
  'subscriptions',
  'routes',
  'rounds',
  'completed_jobs',
  'invoices',
  'invoices_sent',
  'custom_groups',
  'cancellation_fee',
  'lead_form_enabled',
  'leads',
  'leads_handled',
  'offers_sent',
  'offers_accepted',
  'bookings_confirmed',
  'pro_access',
  'team_members',
  'team_assigned_jobs',
];

/** Pages whose first visit can complete a step. Mirrors VISIT_KEYS. */
const GUIDE_VISIT_KEYS = [
  'clients',
  'services',
  'jobs',
  'map',
  'invoices',
  'pipeline',
  'offers',
  'team',
  'invoice_settings',
  'notifications_settings',
];

const MEDIA_TYPES = ['none', 'image', 'video'];

/**
 * Validate a `doneTrigger`. Accepts `count_key>=N`, `visit:<page>` or
 * `event:<activity event>` (anything the activity tracker records, e.g.
 * `event:settings.lead_form_updated`). Returns the normalized string, or null
 * when the value is unusable.
 */
function normalizeDoneTrigger(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (raw.startsWith('event:')) {
    const name = raw.slice('event:'.length).trim();
    return /^[a-z0-9_]+\.[a-z0-9_]+$/.test(name) && name.length <= 80 ? `event:${name}` : null;
  }

  if (raw.startsWith('visit:')) {
    const page = raw.slice('visit:'.length).trim();
    return GUIDE_VISIT_KEYS.includes(page) ? `visit:${page}` : null;
  }

  const match = raw.match(/^([a-z_]+)\s*>=\s*(\d+)$/);
  if (!match) return null;
  const [, key, target] = match;
  if (!GUIDE_COUNT_KEYS.includes(key)) return null;
  const n = Math.max(1, Math.min(999, Number(target) || 1));
  return `${key}>=${n}`;
}

/**
 * Tables behind the in-app guides. Guides and their steps are platform content
 * managed in the admin panel; progress is per user per company so each
 * teammate sees their own place in the guide.
 */
async function ensureGuidesSchema(pool) {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guides (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(80) NOT NULL UNIQUE,
        title VARCHAR(160) NOT NULL,
        description TEXT,
        icon VARCHAR(16) NOT NULL DEFAULT '',
        language_code VARCHAR(10) NOT NULL DEFAULT 'en',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS guide_steps (
        id SERIAL PRIMARY KEY,
        guide_id INTEGER NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        media_type VARCHAR(10) NOT NULL DEFAULT 'none',
        media_path TEXT,
        cta_label VARCHAR(80),
        cta_href TEXT,
        done_trigger VARCHAR(60),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS guide_steps_guide_idx ON guide_steps (guide_id, sort_order)`
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_guide_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        active_guide_id INTEGER,
        done_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        seen_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        banner_minimized BOOLEAN NOT NULL DEFAULT FALSE,
        banner_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, company_id)
      )
    `);

    await seedDefaultGuides(pool);
  })().catch((err) => {
    // Let the next request retry rather than caching a failed migration.
    schemaReady = null;
    throw err;
  });

  return schemaReady;
}

/** Writes the starter guides once, on a database that has none. */
async function seedDefaultGuides(pool) {
  const existing = await pool.query(`SELECT COUNT(*)::int AS n FROM guides`);
  if ((existing.rows[0]?.n || 0) > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let gi = 0; gi < GUIDE_SEED.length; gi += 1) {
      const guide = GUIDE_SEED[gi];
      const inserted = await client.query(
        `INSERT INTO guides (slug, title, description, icon, sort_order, is_published)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [guide.slug, guide.title, guide.description || null, guide.icon || '', gi]
      );
      const guideId = inserted.rows[0]?.id;
      if (!guideId) continue;

      for (let si = 0; si < guide.steps.length; si += 1) {
        const step = guide.steps[si];
        await client.query(
          `INSERT INTO guide_steps
             (guide_id, sort_order, title, body, media_type, cta_label, cta_href, done_trigger)
           VALUES ($1, $2, $3, $4, 'none', $5, $6, $7)`,
          [
            guideId,
            si,
            step.title,
            step.body || '',
            step.ctaLabel || null,
            step.ctaHref || null,
            normalizeDoneTrigger(step.doneTrigger),
          ]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.warn('[guidesSchema] seed failed:', e?.message || e);
  } finally {
    client.release();
  }
}

module.exports = {
  ensureGuidesSchema,
  normalizeDoneTrigger,
  GUIDE_COUNT_KEYS,
  GUIDE_VISIT_KEYS,
  MEDIA_TYPES,
};
