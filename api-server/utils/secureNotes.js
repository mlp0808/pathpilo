// Reusable secure-notes module.
//
// Exposes encrypt/decrypt primitives and high-level read/write/delete helpers
// for the `secure_notes` table. Keyed on (company_id, entity_type, entity_id)
// so v1 (entity_type='client') and any future entity type share the same code
// path.
//
// Encryption model (v1, server-side):
//   - One AES-256 Data Encryption Key (DEK) per company, generated lazily on
//     first write, stored *wrapped* in `company_encryption_keys`. The wrap key
//     is the master key (32 bytes) sourced from env.
//   - Each note row gets its own random 12-byte IV. We use AES-256-GCM, so
//     the auth tag is stored alongside the ciphertext and verified on
//     decrypt — any tampering throws.
//   - The plaintext DEK is never logged, returned to clients, or persisted in
//     plaintext. It exists only in process memory for the duration of an
//     encrypt/decrypt call (and a short in-memory cache to avoid hammering
//     the DB on every read).
//
// Master key:
//   - Required env var: SECURE_NOTES_MASTER_KEY
//   - Format: 32 bytes encoded as base64 (44 chars). Generate once with:
//       node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//   - Required at startup (see assertMasterKeyConfigured) — without it any
//     read/write throws so missing config can never silently corrupt data.

const crypto = require('crypto');
const { pool } = require('./database');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM-recommended
const KEY_LEN = 32; // AES-256
const TAG_LEN = 16;

// In-memory unwrapped DEK cache: keyed by company_id, value is a Buffer.
// Cleared on process exit; intentionally simple (no TTL) because the unwrapped
// DEK derives entirely from `MASTER_KEY` + the per-company wrapped row, so
// it's fine to keep it for the life of the process.
const dekCache = new Map();

function getMasterKey() {
  let raw = (process.env.SECURE_NOTES_MASTER_KEY || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  if (!raw) {
    throw new Error(
      'SECURE_NOTES_MASTER_KEY env var is missing. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"\n' +
        'and set it in your environment before starting the API.',
    );
  }
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (err) {
    throw new Error('SECURE_NOTES_MASTER_KEY must be valid base64.');
  }
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `SECURE_NOTES_MASTER_KEY must decode to ${KEY_LEN} bytes (got ${buf.length}).`,
    );
  }
  return buf;
}

// Validates the env var is present and well-formed. Call once at boot so the
// server fails fast if the operator forgot to set it.
function assertMasterKeyConfigured() {
  getMasterKey();
}

function encryptWithKey(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: ct, iv, authTag };
}

function decryptWithKey({ ciphertext, iv, authTag }, key) {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return pt.toString('utf8');
}

// Loads (or creates) the per-company DEK and returns the unwrapped Buffer.
// Wrapped storage: `company_encryption_keys` holds AES-GCM ciphertext of a
// random 32-byte DEK using `MASTER_KEY`. We unwrap it here and cache the
// plaintext DEK in memory.
async function getOrCreateCompanyDEK(companyId) {
  const cached = dekCache.get(companyId);
  if (cached) return cached;

  const masterKey = getMasterKey();

  const existing = await pool.query(
    'SELECT wrapped_dek, iv, auth_tag FROM company_encryption_keys WHERE company_id = $1',
    [companyId],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // We stored the DEK as base64 before encrypting because raw binary cannot
    // survive a utf8 round-trip; reverse that here to recover the 32-byte key.
    const dekB64 = decryptWithKey(
      {
        ciphertext: row.wrapped_dek,
        iv: row.iv,
        authTag: row.auth_tag,
      },
      masterKey,
    );
    const dek = Buffer.from(dekB64, 'base64');
    dekCache.set(companyId, dek);
    return dek;
  }

  // First use for this company: generate a random 32-byte DEK, wrap with
  // master key, persist. Race-safe via ON CONFLICT: if two requests arrive at
  // once, the loser drops its DEK and re-reads.
  const dek = crypto.randomBytes(KEY_LEN);
  const dekB64 = dek.toString('base64');
  const wrap = encryptWithKey(dekB64, masterKey);
  await pool.query(
    `INSERT INTO company_encryption_keys (company_id, wrapped_dek, iv, auth_tag, version)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, wrap.ciphertext, wrap.iv, wrap.authTag],
  );

  // Re-read so we're sure to use the persisted version (handles the race).
  const refetched = await pool.query(
    'SELECT wrapped_dek, iv, auth_tag FROM company_encryption_keys WHERE company_id = $1',
    [companyId],
  );
  const row = refetched.rows[0];
  const dekB64Final = decryptWithKey(
    {
      ciphertext: row.wrapped_dek,
      iv: row.iv,
      authTag: row.auth_tag,
    },
    masterKey,
  );
  const dekFinal = Buffer.from(dekB64Final, 'base64');
  dekCache.set(companyId, dekFinal);
  return dekFinal;
}

async function logAudit({
  companyId,
  entityType,
  entityId,
  userId,
  action,
  secureNoteId = null,
}) {
  try {
    await pool.query(
      `INSERT INTO secure_notes_audit
         (company_id, entity_type, entity_id, user_id, action, secure_note_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        companyId,
        entityType,
        entityId,
        userId || null,
        action,
        secureNoteId,
      ],
    );
  } catch (err) {
    console.warn('[secureNotes] audit insert failed:', err.message || err);
  }
}

function decryptNoteRow(row, dek) {
  return decryptWithKey(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
    },
    dek,
  );
}

// All encrypted notes for one entity, oldest first. One audit row per list view.
async function listNotesForEntity({
  companyId,
  entityType,
  entityId,
  userId,
}) {
  const res = await pool.query(
    `SELECT id, ciphertext, iv, auth_tag, updated_at, updated_by, created_at
       FROM secure_notes
      WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY created_at ASC, id ASC`,
    [companyId, entityType, entityId],
  );
  if (res.rows.length === 0) {
    await logAudit({
      companyId,
      entityType,
      entityId,
      userId,
      action: 'list',
    });
    return [];
  }
  const dek = await getOrCreateCompanyDEK(companyId);
  const notes = res.rows.map((row) => ({
    id: Number(row.id),
    note: decryptNoteRow(row, dek),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  }));
  await logAudit({
    companyId,
    entityType,
    entityId,
    userId,
    action: 'list',
  });
  return notes;
}

async function createNote({ companyId, entityType, entityId, plainText, userId }) {
  const trimmed = String(plainText ?? '').trim();
  if (!trimmed) {
    const err = new Error('Note text is required');
    err.code = 'EMPTY_NOTE';
    throw err;
  }
  const dek = await getOrCreateCompanyDEK(companyId);
  const { ciphertext, iv, authTag } = encryptWithKey(trimmed, dek);
  const ins = await pool.query(
    `INSERT INTO secure_notes
        (company_id, entity_type, entity_id, ciphertext, iv, auth_tag, key_version, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 1, $7, NOW())
      RETURNING id, updated_at, updated_by, created_at`,
    [companyId, entityType, entityId, ciphertext, iv, authTag, userId || null],
  );
  const row = ins.rows[0];
  const id = Number(row.id);
  await logAudit({
    companyId,
    entityType,
    entityId,
    userId,
    action: 'write',
    secureNoteId: id,
  });
  return {
    id,
    note: trimmed,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  };
}

async function updateNoteById({
  companyId,
  entityType,
  entityId,
  noteId,
  plainText,
  userId,
}) {
  const trimmed = String(plainText ?? '').trim();
  if (!trimmed) {
    const err = new Error('Note text is required');
    err.code = 'EMPTY_NOTE';
    throw err;
  }
  const own = await pool.query(
    `SELECT id FROM secure_notes
      WHERE id = $1 AND company_id = $2 AND entity_type = $3 AND entity_id = $4`,
    [noteId, companyId, entityType, entityId],
  );
  if (own.rows.length === 0) return null;

  const dek = await getOrCreateCompanyDEK(companyId);
  const { ciphertext, iv, authTag } = encryptWithKey(trimmed, dek);
  const upd = await pool.query(
    `UPDATE secure_notes
        SET ciphertext = $1,
            iv = $2,
            auth_tag = $3,
            updated_by = $4,
            updated_at = NOW()
      WHERE id = $5 AND company_id = $6 AND entity_type = $7 AND entity_id = $8
      RETURNING id, updated_at, updated_by, created_at`,
    [ciphertext, iv, authTag, userId || null, noteId, companyId, entityType, entityId],
  );
  if (upd.rows.length === 0) return null;
  const row = upd.rows[0];
  await logAudit({
    companyId,
    entityType,
    entityId,
    userId,
    action: 'write',
    secureNoteId: Number(row.id),
  });
  return {
    id: Number(row.id),
    note: trimmed,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
  };
}

async function deleteNoteById({
  companyId,
  entityType,
  entityId,
  noteId,
  userId,
}) {
  const res = await pool.query(
    `DELETE FROM secure_notes
       WHERE id = $1 AND company_id = $2 AND entity_type = $3 AND entity_id = $4`,
    [noteId, companyId, entityType, entityId],
  );
  if (res.rowCount > 0) {
    await logAudit({
      companyId,
      entityType,
      entityId,
      userId,
      action: 'delete',
      secureNoteId: noteId,
    });
    return true;
  }
  return false;
}

/**
 * Remove every encrypted note row for an entity (e.g. all client secure notes).
 * Used when anonymizing or hard-deleting a client so no note ciphertext remains.
 *
 * @param {object} opts
 * @param {number} opts.companyId
 * @param {string} opts.entityType
 * @param {number|string} opts.entityId
 * @param {number|null|undefined} opts.userId
 * @param {object|null} [opts.dbClient] — optional pg client from pool.connect() when inside BEGIN/COMMIT
 * @returns {Promise<number>} number of rows deleted
 */
/**
 * Decrypt the oldest secure note per entity (batch). No per-row audit — used when
 * hydrating many jobs/logs in one API response.
 */
async function batchDecryptFirstNoteByEntityIds({
  companyId,
  entityType,
  entityIds,
}) {
  const ids = [
    ...new Set(
      entityIds
        .map((id) =>
          typeof id === 'number' ? id : parseInt(String(id ?? ''), 10),
        )
        .filter(Number.isFinite),
    ),
  ];
  if (ids.length === 0) return new Map();

  const res = await pool.query(
    `SELECT DISTINCT ON (entity_id)
            entity_id, ciphertext, iv, auth_tag
       FROM secure_notes
      WHERE company_id = $1 AND entity_type = $2 AND entity_id = ANY($3::bigint[])
      ORDER BY entity_id, created_at ASC, id ASC`,
    [companyId, entityType, ids],
  );
  if (res.rows.length === 0) return new Map();

  const dek = await getOrCreateCompanyDEK(companyId);
  const out = new Map();
  for (const row of res.rows) {
    out.set(Number(row.entity_id), decryptNoteRow(row, dek));
  }
  return out;
}

/**
 * Single-note semantics: create, update first row, or delete all when cleared.
 */
async function setSingleNoteForEntity({
  companyId,
  entityType,
  entityId,
  plainText,
  userId,
  dbClient = null,
}) {
  const db = dbClient || pool;
  const eId =
    typeof entityId === 'number' && Number.isFinite(entityId)
      ? entityId
      : parseInt(String(entityId ?? ''), 10);
  if (!Number.isFinite(eId)) {
    return null;
  }

  const trimmed = String(plainText ?? '').trim();
  const existing = await db.query(
    `SELECT id FROM secure_notes
      WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [companyId, entityType, eId],
  );

  if (!trimmed) {
    if (existing.rows.length > 0) {
      await deleteAllNotesForEntity({
        companyId,
        entityType,
        entityId: eId,
        userId,
        dbClient,
      });
    }
    return null;
  }

  if (existing.rows.length === 0) {
    return createNote({
      companyId,
      entityType,
      entityId: eId,
      plainText: trimmed,
      userId,
    });
  }

  return updateNoteById({
    companyId,
    entityType,
    entityId: eId,
    noteId: Number(existing.rows[0].id),
    plainText: trimmed,
    userId,
  });
}

async function deleteAllNotesForEntity({
  companyId,
  entityType,
  entityId,
  userId,
  dbClient = null,
}) {
  const db = dbClient || pool;
  const eId =
    typeof entityId === 'number' && Number.isFinite(entityId)
      ? entityId
      : parseInt(String(entityId ?? ''), 10);
  if (!Number.isFinite(eId)) {
    return 0;
  }
  const res = await db.query(
    `DELETE FROM secure_notes
      WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
      RETURNING id`,
    [companyId, entityType, eId],
  );
  const n = res.rowCount || 0;
  if (n > 0) {
    await logAudit({
      companyId,
      entityType,
      entityId: eId,
      userId,
      action: 'delete',
      secureNoteId: null,
    });
  }
  return n;
}

module.exports = {
  assertMasterKeyConfigured,
  getOrCreateCompanyDEK,
  encryptWithKey,
  decryptWithKey,
  listNotesForEntity,
  createNote,
  updateNoteById,
  deleteNoteById,
  deleteAllNotesForEntity,
  batchDecryptFirstNoteByEntityIds,
  setSingleNoteForEntity,
};
