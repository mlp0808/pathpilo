// Encrypt job-level notes (jobs.note) and timeline notes (job_logs) using the
// shared secure_notes store. API responses still expose `note` / timeline text
// as plain strings — encryption is at rest on the server.

const { pool } = require('./database');
const secureNotes = require('./secureNotes');

const ENTITY_JOB = 'job';
const ENTITY_JOB_LOG = 'job_log';

let migrationDone = false;

function legacyText(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

function secureNoteUserId(req) {
  return req.user?.id || req.user?.userId || null;
}

async function getJobNoteText(companyId, jobId, legacyNote, userId) {
  const id = parseInt(String(jobId), 10);
  if (!Number.isFinite(id)) return legacyText(legacyNote);
  const map = await secureNotes.batchDecryptFirstNoteByEntityIds({
    companyId,
    entityType: ENTITY_JOB,
    entityIds: [id],
  });
  if (map.has(id)) return map.get(id);
  return legacyText(legacyNote);
}

async function setJobNoteText({ companyId, jobId, plainText, userId, dbClient }) {
  const id = parseInt(String(jobId), 10);
  if (!Number.isFinite(id)) return null;

  await secureNotes.setSingleNoteForEntity({
    companyId,
    entityType: ENTITY_JOB,
    entityId: id,
    plainText,
    userId,
    dbClient,
  });

  const db = dbClient || pool;
  await db.query(
    'UPDATE jobs SET note = NULL WHERE id = $1 AND company_id = $2',
    [id, companyId],
  );

  const trimmed = String(plainText ?? '').trim();
  return trimmed || null;
}

async function attachJobNotesToRows(jobs, companyId) {
  if (!jobs?.length) return jobs;
  const ids = jobs
    .map((j) => parseInt(String(j.id), 10))
    .filter(Number.isFinite);
  const map = await secureNotes.batchDecryptFirstNoteByEntityIds({
    companyId,
    entityType: ENTITY_JOB,
    entityIds: ids,
  });
  for (const job of jobs) {
    const id = parseInt(String(job.id), 10);
    if (!Number.isFinite(id)) continue;
    if (map.has(id)) {
      job.note = map.get(id);
    } else {
      job.note = legacyText(job.note);
    }
  }
  return jobs;
}

async function hydrateJobRecord(job, companyId) {
  if (!job) return job;
  const id = parseInt(String(job.id), 10);
  if (!Number.isFinite(id)) return job;
  job.note = await getJobNoteText(companyId, id, job.note, null);
  return job;
}

async function hydrateTimelineEntries(timeline, companyId) {
  if (!timeline?.length) return timeline;
  const logIds = timeline
    .map((e) => parseInt(String(e.id), 10))
    .filter(Number.isFinite);
  const map = await secureNotes.batchDecryptFirstNoteByEntityIds({
    companyId,
    entityType: ENTITY_JOB_LOG,
    entityIds: logIds,
  });
  return timeline.map((log) => {
    const id = parseInt(String(log.id), 10);
    const fromSecure = Number.isFinite(id) ? map.get(id) : null;
    const text =
      fromSecure != null
        ? fromSecure
        : legacyText(log.description || log.note_content || log.message);
    return {
      ...log,
      description: text || '',
      message: text || '',
    };
  });
}

async function hydrateJobLogRows(logs, companyId) {
  if (!logs?.length) return logs;
  const logIds = logs
    .map((r) => parseInt(String(r.id), 10))
    .filter(Number.isFinite);
  const map = await secureNotes.batchDecryptFirstNoteByEntityIds({
    companyId,
    entityType: ENTITY_JOB_LOG,
    entityIds: logIds,
  });
  return logs.map((row) => {
    const id = parseInt(String(row.id), 10);
    const fromSecure = Number.isFinite(id) ? map.get(id) : null;
    const text =
      fromSecure != null ? fromSecure : legacyText(row.note_content || row.description);
    return {
      ...row,
      note_content: text,
      description: row.action === 'note' ? text || '' : row.description,
    };
  });
}

async function createEncryptedTimelineNote({ companyId, jobId, content, userId }) {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) {
    const err = new Error('Note content is required');
    err.code = 'EMPTY_NOTE';
    throw err;
  }

  const ins = await pool.query(
    `INSERT INTO job_logs (job_id, user_id, action, description, note_content, created_at)
     VALUES ($1, $2, 'note', '', NULL, NOW())
     RETURNING *`,
    [jobId, userId],
  );
  const logRow = ins.rows[0];
  await secureNotes.createNote({
    companyId,
    entityType: ENTITY_JOB_LOG,
    entityId: logRow.id,
    plainText: trimmed,
    userId,
  });
  return {
    ...logRow,
    note_content: trimmed,
    description: trimmed,
  };
}

async function deleteEncryptedTimelineNote({
  companyId,
  jobId,
  noteId,
  userId,
}) {
  await secureNotes.deleteAllNotesForEntity({
    companyId,
    entityType: ENTITY_JOB_LOG,
    entityId: noteId,
    userId,
  });

  const deleteResult = await pool.query(
    `DELETE FROM job_logs
      WHERE id = $1 AND job_id = $2 AND user_id = $3 AND action = 'note'
      RETURNING *`,
    [noteId, jobId, userId],
  );
  return deleteResult.rows[0] || null;
}

async function deleteJobEncryptedNotes(companyId, jobId, userId) {
  const id = parseInt(String(jobId), 10);
  if (!Number.isFinite(id)) return;
  await secureNotes.deleteAllNotesForEntity({
    companyId,
    entityType: ENTITY_JOB,
    entityId: id,
    userId,
  });
}

/**
 * One-shot: move plaintext jobs.note and job_logs.note_content into secure_notes.
 */
async function migrateLegacyJobNotes(db = pool) {
  if (migrationDone) return;
  migrationDone = true;

  try {
    const jobsRes = await db.query(
      `SELECT id, company_id, note FROM jobs
        WHERE note IS NOT NULL AND BTRIM(note) <> ''`,
    );
    for (const row of jobsRes.rows) {
      const existing = await db.query(
        `SELECT 1 FROM secure_notes
          WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
          LIMIT 1`,
        [row.company_id, ENTITY_JOB, row.id],
      );
      if (existing.rows.length === 0) {
        await secureNotes.createNote({
          companyId: row.company_id,
          entityType: ENTITY_JOB,
          entityId: row.id,
          plainText: row.note,
          userId: null,
        });
      }
      await db.query('UPDATE jobs SET note = NULL WHERE id = $1', [row.id]);
    }

    const logsRes = await db.query(
      `SELECT jl.id, j.company_id, jl.note_content
         FROM job_logs jl
         INNER JOIN jobs j ON j.id = jl.job_id
        WHERE jl.action = 'note'
          AND jl.note_content IS NOT NULL
          AND BTRIM(jl.note_content) <> ''`,
    );
    for (const row of logsRes.rows) {
      const existing = await db.query(
        `SELECT 1 FROM secure_notes
          WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
          LIMIT 1`,
        [row.company_id, ENTITY_JOB_LOG, row.id],
      );
      if (existing.rows.length === 0) {
        await secureNotes.createNote({
          companyId: row.company_id,
          entityType: ENTITY_JOB_LOG,
          entityId: row.id,
          plainText: row.note_content,
          userId: null,
        });
      }
      await db.query(
        `UPDATE job_logs SET note_content = NULL, description = ''
          WHERE id = $1`,
        [row.id],
      );
    }

    const nJobs = jobsRes.rows.length;
    const nLogs = logsRes.rows.length;
    if (nJobs > 0 || nLogs > 0) {
      console.log(
        `[jobEncryptedNotes] migrated ${nJobs} job note(s), ${nLogs} timeline note(s) to secure_notes`,
      );
    }
  } catch (err) {
    console.warn(
      '[jobEncryptedNotes] legacy migration failed:',
      err.message || err,
    );
  }
}

module.exports = {
  ENTITY_JOB,
  ENTITY_JOB_LOG,
  secureNoteUserId,
  getJobNoteText,
  setJobNoteText,
  attachJobNotesToRows,
  hydrateJobRecord,
  hydrateTimelineEntries,
  hydrateJobLogRows,
  createEncryptedTimelineNote,
  deleteEncryptedTimelineNote,
  deleteJobEncryptedNotes,
  migrateLegacyJobNotes,
};
