// Centralized idempotent schema migrations for the work hours / appointments
// feature:
//   1. Extend user_company_work_hours with a mode (fixed|flexible) + per-weekday
//      start/end/break-minutes columns.
//   2. Create company_default_work_hours (template for new employee invites).
//   3. Create employee_appointments (unified table replacing employee_leave).
//   4. One-time copy of employee_leave rows into employee_appointments.
//
// Follows the same pattern as utils/invoiceSnapshot.js — called at server
// startup, guarded by an in-memory flag, each statement wrapped in try/catch
// so a single failure does not block the rest.

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// EU-standard 37-hour work week defaults (Mon-Thu 7.5h, Fri 7h, weekend off),
// shared between the CREATE TABLE defaults and the API fallback object.
const DAY_DEFAULTS = {
  monday:    { start: '08:00', end: '16:00', breakMin: 30, hours: 7.5 },
  tuesday:   { start: '08:00', end: '16:00', breakMin: 30, hours: 7.5 },
  wednesday: { start: '08:00', end: '16:00', breakMin: 30, hours: 7.5 },
  thursday:  { start: '08:00', end: '16:00', breakMin: 30, hours: 7.5 },
  friday:    { start: '08:00', end: '15:30', breakMin: 30, hours: 7.0 },
  saturday:  { start: null,    end: null,    breakMin: 0,  hours: 0.0 },
  sunday:    { start: null,    end: null,    breakMin: 0,  hours: 0.0 },
};

let migrationDone = false;

async function ensureWorkHoursSchema(pool) {
  if (migrationDone) return;
  migrationDone = true;

  const alterStmts = [
    `ALTER TABLE user_company_work_hours
       ADD COLUMN IF NOT EXISTS work_hours_mode VARCHAR(10) NOT NULL DEFAULT 'flexible'`,
    // NOTE: we intentionally do not add a CHECK constraint here because the
    // table may have been created before CHECK constraint support in older
    // environments; the API layer validates the value.
  ];

  // Run after employee_appointments CREATE so it applies on existing
  // installs without logging a "relation does not exist" error on fresh ones.
  // `kind` lets the admin classify each appointment as productive work time
  // (meetings, errands) or actual time off (sick, vacation). Both still
  // subtract from daily capacity today; the split is for future reporting.
  const postCreateAlterStmts = [
    `ALTER TABLE employee_appointments
       ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'work'`,
  ];
  for (const day of DAYS) {
    alterStmts.push(`ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS ${day}_start TIME`);
    alterStmts.push(`ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS ${day}_end TIME`);
    alterStmts.push(
      `ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS ${day}_break_minutes INTEGER NOT NULL DEFAULT 0`,
    );
  }

  // Company-level default template used when a new employee is invited.
  // Uses the EU 37-hour work week defined at module scope (DAY_DEFAULTS).
  const dayDefaults = DAYS.map((d) => {
    const cfg = DAY_DEFAULTS[d];
    const startSql = cfg.start ? `DEFAULT '${cfg.start}'` : '';
    const endSql = cfg.end ? `DEFAULT '${cfg.end}'` : '';
    return `${d}_start TIME ${startSql},
            ${d}_end TIME ${endSql},
            ${d}_break_minutes INTEGER NOT NULL DEFAULT ${cfg.breakMin},
            ${d}_hours DECIMAL(3,1) NOT NULL DEFAULT ${cfg.hours.toFixed(1)}`;
  }).join(',\n      ');

  const createCompanyDefaults = `
    CREATE TABLE IF NOT EXISTS company_default_work_hours (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      work_hours_mode VARCHAR(10) NOT NULL DEFAULT 'fixed',
      ${dayDefaults},
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const createAppointments = `
    CREATE TABLE IF NOT EXISTS employee_appointments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(20) NOT NULL DEFAULT 'other',
      notes TEXT,
      appointment_date DATE NOT NULL,
      time_mode VARCHAR(10) NOT NULL,
      start_time TIME,
      end_time TIME,
      hours_off DECIMAL(4,1),
      kind VARCHAR(10) NOT NULL DEFAULT 'work',
      status VARCHAR(10) NOT NULL DEFAULT 'approved',
      requested_by INTEGER REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const createApptIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_emp_appts_company_date ON employee_appointments (company_id, appointment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_appts_user_date ON employee_appointments (user_id, appointment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_appts_status ON employee_appointments (status)`,
  ];

  // One-time copy of employee_leave → employee_appointments. The NOT EXISTS
  // guard makes this safe to re-run (only rows without a matching
  // (user_id, company_id, appointment_date) get copied) so a second deploy
  // won't duplicate data, but we still only attempt it inside a try/catch
  // in case the legacy table has been removed on some environments.
  const migrateLegacyLeave = `
    INSERT INTO employee_appointments (
      user_id, company_id, title, category, notes, appointment_date,
      time_mode, hours_off, kind, status, created_at, updated_at
    )
    SELECT
      el.user_id,
      el.company_id,
      CASE el.category
        WHEN 'holiday' THEN 'Holiday'
        WHEN 'sick' THEN 'Sick day'
        WHEN 'personal' THEN 'Personal'
        WHEN 'public_holiday' THEN 'Public holiday'
        ELSE 'Time off'
      END
      || CASE el.leave_type
        WHEN 'half_day_morning' THEN ' (morning)'
        WHEN 'half_day_afternoon' THEN ' (afternoon)'
        ELSE ''
      END                                                             AS title,
      CASE el.category
        WHEN 'holiday' THEN 'vacation'
        WHEN 'sick' THEN 'sick'
        WHEN 'personal' THEN 'personal'
        WHEN 'public_holiday' THEN 'other'
        ELSE 'other'
      END                                                             AS category,
      el.note                                                         AS notes,
      el.leave_date                                                   AS appointment_date,
      CASE el.leave_type
        WHEN 'full_day' THEN 'all_day'
        ELSE 'hours'
      END                                                             AS time_mode,
      CASE el.leave_type
        WHEN 'full_day' THEN NULL
        WHEN 'half_day_morning' THEN 4.0
        WHEN 'half_day_afternoon' THEN 4.0
        WHEN 'custom_hours' THEN el.hours_off
        ELSE el.hours_off
      END                                                             AS hours_off,
      'time_off'                                                      AS kind,
      'approved'                                                      AS status,
      COALESCE(el.created_at, NOW())                                  AS created_at,
      COALESCE(el.updated_at, NOW())                                  AS updated_at
    FROM employee_leave el
    WHERE NOT EXISTS (
      SELECT 1
      FROM employee_appointments ea
      WHERE ea.user_id = el.user_id
        AND ea.company_id = el.company_id
        AND ea.appointment_date = el.leave_date
    )
  `;

  const allStmts = [
    ...alterStmts,
    createCompanyDefaults,
    createAppointments,
    ...postCreateAlterStmts,
    ...createApptIndexes,
  ];

  for (const stmt of allStmts) {
    try {
      await pool.query(stmt);
    } catch (err) {
      console.error('[workHoursSchema] statement failed:', err.message || err);
    }
  }

  try {
    await pool.query(migrateLegacyLeave);
  } catch (err) {
    // Tolerated: on fresh installs employee_leave may not exist yet.
    if (err.code !== '42P01') {
      console.warn('[workHoursSchema] legacy leave migration:', err.message || err);
    }
  }
}

function companyDefaultRowOrFallback(row) {
  if (row) return row;
  // Mirrors the SQL defaults above so callers always receive a usable shape
  // even before the template row has been explicitly saved.
  const base = {
    work_hours_mode: 'fixed',
    created_at: null,
    updated_at: null,
  };
  for (const d of DAYS) {
    const cfg = DAY_DEFAULTS[d];
    base[`${d}_start`] = cfg.start;
    base[`${d}_end`] = cfg.end;
    base[`${d}_break_minutes`] = cfg.breakMin;
    base[`${d}_hours`] = cfg.hours;
  }
  return base;
}

module.exports = {
  ensureWorkHoursSchema,
  companyDefaultRowOrFallback,
  DAYS,
  DAY_DEFAULTS,
};
