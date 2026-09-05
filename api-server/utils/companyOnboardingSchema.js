let migrationDone = false;

/**
 * Columns captured by the company onboarding steps: the industry/usage answers
 * shown in superadmin, plus the dismiss flag for the dashboard checklist.
 */
async function ensureCompanyOnboardingSchema(pool) {
  if (migrationDone) return;
  migrationDone = true;

  const stmts = [
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry VARCHAR(64)`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS usage_goals JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS getting_started_dismissed BOOLEAN NOT NULL DEFAULT FALSE`,
  ];

  for (const sql of stmts) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('[companyOnboardingSchema]', e?.message || e);
    }
  }
}

module.exports = { ensureCompanyOnboardingSchema };
