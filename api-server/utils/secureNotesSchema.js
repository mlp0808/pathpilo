// Idempotent schema migrations for the encrypted "secure notes" feature.
//
// Tables created:
//   1. company_encryption_keys   — per-company DEK (Data Encryption Key) wrapped
//                                  by SECURE_NOTES_MASTER_KEY (env). One row
//                                  per company. The plaintext DEK never lives
//                                  on disk.
//   2. secure_notes              — generic encrypted blob keyed on
//                                  (company_id, entity_type, entity_id). v1
//                                  uses entity_type='client'; the table is
//                                  designed so future entity types (jobs,
//                                  users, ...) can plug in without schema
//                                  changes.
//   3. secure_notes_audit        — append-only log of who read/wrote/deleted
//                                  which note. Lightweight; one row per
//                                  successful access.
//
// Follows the same boot pattern as utils/workHoursSchema.js — called once at
// server startup, guarded by an in-memory flag, every statement wrapped in
// try/catch so a single failure does not block the rest.

let migrationDone = false;

async function ensureSecureNotesSchema(pool) {
  if (migrationDone) return;

  const stmts = [
    `CREATE TABLE IF NOT EXISTS company_encryption_keys (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      wrapped_dek BYTEA NOT NULL,
      iv BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at TIMESTAMPTZ
    )`,

    `CREATE TABLE IF NOT EXISTS secure_notes (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type VARCHAR(32) NOT NULL,
      entity_id BIGINT NOT NULL,
      ciphertext BYTEA NOT NULL,
      iv BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      key_version INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS idx_secure_notes_entity
       ON secure_notes (company_id, entity_type, entity_id)`,

    `CREATE TABLE IF NOT EXISTS secure_notes_audit (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      entity_type VARCHAR(32) NOT NULL,
      entity_id BIGINT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(10) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_secure_notes_audit_entity
       ON secure_notes_audit (company_id, entity_type, entity_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_secure_notes_audit_user
       ON secure_notes_audit (user_id, created_at DESC)`,
  ];

  for (const stmt of stmts) {
    try {
      await pool.query(stmt);
    } catch (err) {
      console.error('[secureNotesSchema] statement failed:', err.message || err);
      throw err;
    }
  }
  migrationDone = true;
}

// Allow multiple encrypted notes per (company, entity): drop the legacy unique
// index and add a non-unique list index. Runs every boot (idempotent) so
// existing deployments pick this up even when ensureSecureNotesSchema is
// skipped due to migrationDone.
async function ensureSecureNotesMultiNoteSupport(pool) {
  const steps = [
    `DROP INDEX IF EXISTS idx_secure_notes_entity`,
    `CREATE INDEX IF NOT EXISTS idx_secure_notes_entity_list
       ON secure_notes (company_id, entity_type, entity_id)`,
    `ALTER TABLE secure_notes_audit ADD COLUMN IF NOT EXISTS secure_note_id BIGINT`,
  ];
  for (const sql of steps) {
    await pool.query(sql);
  }
}

module.exports = {
  ensureSecureNotesSchema,
  ensureSecureNotesMultiNoteSupport,
};
