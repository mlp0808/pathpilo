const { pool } = require('../../utils/database');

let ensured = false;

async function ensureSchedulingSchema() {
  if (ensured) return;
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_flexibility VARCHAR(24) DEFAULT 'fixed_date';
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS allowed_weekdays INTEGER[];
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_window_hard BOOLEAN DEFAULT FALSE;
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS scheduling_flexibility VARCHAR(24);
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS allowed_weekdays INTEGER[];
  `).catch(() => {});
  ensured = true;
}

module.exports = { ensureSchedulingSchema };
