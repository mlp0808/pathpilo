// CRUD for employee appointments — the unified entity that covers both
// traditional time off (vacation, sick) and specific scheduled blocks
// (dentist, meeting, training, etc.).
//
// Access rules:
//   - Admins / owners of the active company can create, read, edit, delete,
//     approve, and decline appointments for any employee in that company.
//     Their created appointments default to status='approved'.
//   - Regular employees can create appointments only for themselves. Those
//     are always forced to status='requested' until an admin approves.
//     They can also read, edit, and delete their own requested
//     appointments (not approved ones — that would bypass the approval
//     workflow).
//
// Only approved appointments subtract from daily capacity on the frontend.

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureWorkHoursSchema } = require('../utils/workHoursSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const VALID_CATEGORIES = ['personal', 'meeting', 'sick', 'vacation', 'other'];
const VALID_TIME_MODES = ['span', 'hours', 'all_day'];
const VALID_KINDS = ['work', 'time_off'];
const VALID_STATUSES = ['requested', 'approved', 'declined'];
const ADMIN_ROLES = new Set(['owner', 'admin']);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function getActiveCompanyId(req) {
  const companyId = req.user?.activeCompanyId;
  if (!companyId) return { error: 'No active company found in token', status: 400 };
  return { companyId };
}

function isAdminRole(req) {
  return ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());
}

router.use(authenticateToken);

function normaliseDate(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normaliseTime(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function appointmentRowToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    title: row.title,
    category: row.category,
    notes: row.notes,
    appointment_date: row.appointment_date,
    end_date: row.end_date || null,
    time_mode: row.time_mode,
    start_time: row.start_time,
    end_time: row.end_time,
    hours_off: row.hours_off == null ? null : Number(row.hours_off),
    kind: row.kind || 'work',
    status: row.status,
    requested_by: row.requested_by,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    declined_by: row.declined_by ?? null,
    declined_at: row.declined_at ?? null,
    decline_reason: row.decline_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) errors.push('Title is required');
    if (title.length > 200) errors.push('Title too long (max 200 characters)');
    out.title = title;
  }
  if (!partial || body.category !== undefined) {
    const category = String(body.category || '').trim().toLowerCase();
    if (!VALID_CATEGORIES.includes(category)) {
      errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    out.category = category;
  }
  if (body.notes !== undefined) {
    out.notes = body.notes === null ? null : String(body.notes).trim() || null;
  }
  if (body.kind !== undefined) {
    const k = String(body.kind || '').trim().toLowerCase();
    if (!VALID_KINDS.includes(k)) {
      errors.push(`kind must be one of: ${VALID_KINDS.join(', ')}`);
    }
    out.kind = k;
  }
  if (!partial || body.appointment_date !== undefined) {
    const d = normaliseDate(body.appointment_date);
    if (!d) errors.push('appointment_date is required (YYYY-MM-DD)');
    out.appointment_date = d;
  }
  // Inclusive end date for multi-day all-day blocks; null = single day.
  if (!partial || body.end_date !== undefined) {
    if (partial && body.end_date === undefined) {
      // leave out of `out` — PATCH will not change end_date
    } else if (!partial && (body.end_date === undefined || body.end_date === null || body.end_date === '')) {
      out.end_date = null;
    } else {
      const raw = body.end_date;
      if (raw === null || raw === '') {
        out.end_date = null;
      } else {
        const ed = normaliseDate(raw);
        if (!ed) errors.push('end_date must be YYYY-MM-DD');
        else out.end_date = ed;
      }
    }
  }
  if (!partial || body.time_mode !== undefined) {
    const m = String(body.time_mode || '').trim().toLowerCase();
    if (!VALID_TIME_MODES.includes(m)) {
      errors.push(`time_mode must be one of: ${VALID_TIME_MODES.join(', ')}`);
    }
    out.time_mode = m;
  }

  const mode = out.time_mode;
  if (mode === 'span' || (partial && body.start_time !== undefined)) {
    const s = normaliseTime(body.start_time);
    if (mode === 'span' && !s) errors.push('start_time is required when time_mode is span (HH:MM)');
    out.start_time = s;
  }
  if (mode === 'span' || (partial && body.end_time !== undefined)) {
    const e = normaliseTime(body.end_time);
    if (mode === 'span' && !e) errors.push('end_time is required when time_mode is span (HH:MM)');
    out.end_time = e;
  }
  if (mode === 'span' && out.start_time && out.end_time && out.start_time >= out.end_time) {
    errors.push('end_time must be after start_time');
  }

  if (mode === 'hours' || (partial && body.hours_off !== undefined)) {
    const raw = body.hours_off;
    const h = raw == null || raw === '' ? null : Number(raw);
    if (mode === 'hours') {
      if (!Number.isFinite(h) || h <= 0 || h > 24) {
        errors.push('hours_off must be between 0 and 24 when time_mode is hours');
      }
    }
    out.hours_off = Number.isFinite(h) ? Math.round(h * 10) / 10 : null;
  }

  // For 'all_day' we intentionally null out start/end/hours_off so the
  // consumer knows to derive the day total from the employee's work hours.
  if (mode === 'all_day') {
    out.start_time = null;
    out.end_time = null;
    out.hours_off = null;
  }

  return { out, errors };
}

/** Rules for appointment_date + end_date + time_mode (single vs multi-day). */
function finalizeEndDate(appointmentDate, endDate, timeMode) {
  const errors = [];
  if (timeMode !== 'all_day') {
    return { errors, end_date: null };
  }
  let end = endDate == null || endDate === '' ? null : normaliseDate(endDate);
  if (end && !appointmentDate) {
    errors.push('appointment_date is required when setting end_date');
    return { errors, end_date: null };
  }
  if (end && appointmentDate && end < appointmentDate) {
    errors.push('end_date must be on or after appointment_date');
    return { errors, end_date: null };
  }
  if (end && appointmentDate && end === appointmentDate) {
    end = null;
  }
  return { errors, end_date: end };
}

async function userBelongsToCompany(userId, companyId) {
  const r = await pool.query(
    'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
    [userId, companyId],
  );
  return r.rows.length > 0;
}

// GET /api/appointments?from=&to=&user_id=&status=
router.get('/', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;
    const admin = isAdminRole(req);
    const currentUserId = req.user.userId;

    const { from, to, status } = req.query;
    const userIdParam = req.query.user_id;

    const where = ['company_id = $1'];
    const params = [companyId];

    if (!admin) {
      // Employees only see their own appointments.
      where.push(`user_id = $${params.length + 1}`);
      params.push(currentUserId);
    } else if (userIdParam && userIdParam !== 'all') {
      where.push(`user_id = $${params.length + 1}`);
      params.push(parseInt(userIdParam, 10));
    }

    if (from) {
      where.push(`COALESCE(end_date, appointment_date) >= $${params.length + 1}`);
      params.push(from);
    }
    if (to) {
      where.push(`appointment_date <= $${params.length + 1}`);
      params.push(to);
    }
    if (status && status !== 'all') {
      where.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    const q = `
      SELECT
        id, user_id, company_id, title, category, notes,
        to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
        to_char(end_date, 'YYYY-MM-DD') AS end_date,
        time_mode,
        to_char(start_time, 'HH24:MI') AS start_time,
        to_char(end_time, 'HH24:MI') AS end_time,
        hours_off, kind, status, requested_by, approved_by, approved_at,
        declined_by, declined_at, decline_reason,
        created_at, updated_at
      FROM employee_appointments
      WHERE ${where.join(' AND ')}
      ORDER BY appointment_date ASC, start_time ASC NULLS FIRST, id ASC
    `;
    const r = await pool.query(q, params);
    res.json({ appointments: r.rows.map(appointmentRowToJson) });
  } catch (err) {
    console.error('GET /appointments:', err);
    res.status(500).json({ error: 'Failed to load appointments' });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;
    const admin = isAdminRole(req);
    const currentUserId = req.user.userId;

    const r = await pool.query(
      `SELECT id, user_id, company_id, title, category, notes,
              to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date,
              time_mode,
              to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time,
              hours_off, kind, status, requested_by, approved_by, approved_at,
              declined_by, declined_at, decline_reason,
              created_at, updated_at
       FROM employee_appointments
       WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId],
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    const row = r.rows[0];
    if (!admin && row.user_id !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ appointment: appointmentRowToJson(row) });
  } catch (err) {
    console.error('GET /appointments/:id:', err);
    res.status(500).json({ error: 'Failed to load appointment' });
  }
});

// POST /api/appointments — create
router.post('/', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;
    const admin = isAdminRole(req);
    const currentUserId = req.user.userId;

    const body = req.body || {};
    const { out, errors } = validatePayload(body, { partial: false });
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const range = finalizeEndDate(out.appointment_date, out.end_date, out.time_mode);
    if (range.errors.length) {
      return res.status(400).json({ error: range.errors[0], details: range.errors });
    }
    out.end_date = range.end_date;

    // Admins can create on behalf of any employee in the company; everyone
    // else is forced to themselves. Either way, we verify membership.
    let targetUserId = admin
      ? parseInt(body.user_id ?? currentUserId, 10)
      : currentUserId;
    if (!Number.isFinite(targetUserId)) targetUserId = currentUserId;
    if (!(await userBelongsToCompany(targetUserId, companyId))) {
      return res.status(403).json({ error: 'User is not part of this company' });
    }

    // Admins default to 'approved', employees always submit as 'requested'.
    let status;
    if (admin) {
      status = body.status === 'requested' ? 'requested' : 'approved';
    } else {
      status = 'requested';
    }

    const approvedBy = status === 'approved' ? currentUserId : null;
    const approvedAt = status === 'approved' ? new Date() : null;

    // Employees can now flag their own appointments as `time_off` from the
    // mobile "Request time off" flow (everything else defaults to 'work').
    // Admins can set it to whatever they want; an admin can always
    // reclassify later via PATCH.
    let kind;
    if (admin) {
      kind = out.kind || 'work';
    } else {
      kind = out.kind === 'time_off' ? 'time_off' : 'work';
    }

    const insert = await pool.query(
      `INSERT INTO employee_appointments
        (user_id, company_id, title, category, notes,
         appointment_date, end_date, time_mode, start_time, end_time, hours_off,
         kind, status, requested_by, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        targetUserId,
        companyId,
        out.title,
        out.category,
        out.notes ?? null,
        out.appointment_date,
        out.end_date,
        out.time_mode,
        out.start_time,
        out.end_time,
        out.hours_off,
        kind,
        status,
        currentUserId,
        approvedBy,
        approvedAt,
      ],
    );

    const fetched = await pool.query(
      `SELECT id, user_id, company_id, title, category, notes,
              to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date,
              time_mode,
              to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time,
              hours_off, kind, status, requested_by, approved_by, approved_at,
              declined_by, declined_at, decline_reason,
              created_at, updated_at
       FROM employee_appointments WHERE id = $1`,
      [insert.rows[0].id],
    );
    res.status(201).json({ appointment: appointmentRowToJson(fetched.rows[0]) });
  } catch (err) {
    console.error('POST /appointments:', err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// PATCH /api/appointments/:id — update fields
router.patch('/:id', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;
    const admin = isAdminRole(req);
    const currentUserId = req.user.userId;

    const existing = await pool.query(
      `SELECT user_id, status,
              to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date,
              time_mode
       FROM employee_appointments WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId],
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    const row = existing.rows[0];

    if (!admin) {
      if (row.user_id !== currentUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (row.status !== 'requested') {
        return res.status(403).json({
          error: 'Only requested appointments can be edited by employees. Ask an admin.',
        });
      }
    }

    const body = req.body || {};
    const { out, errors } = validatePayload(body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const mergedDate = out.appointment_date !== undefined ? out.appointment_date : row.appointment_date;
    const mergedEnd =
      out.end_date !== undefined ? out.end_date : row.end_date;
    const mergedMode = out.time_mode !== undefined ? out.time_mode : row.time_mode;
    if (
      out.appointment_date !== undefined ||
      out.end_date !== undefined ||
      out.time_mode !== undefined
    ) {
      const range = finalizeEndDate(mergedDate, mergedEnd, mergedMode);
      if (range.errors.length) {
        return res.status(400).json({ error: range.errors[0], details: range.errors });
      }
      out.end_date = range.end_date;
    }

    // Build dynamic UPDATE. `kind` is admin-only — employees cannot
    // reclassify their own appointment from work to time off.
    const sets = [];
    const params = [];
    const updatableKeys = [
      'title',
      'category',
      'notes',
      'appointment_date',
      'end_date',
      'time_mode',
      'start_time',
      'end_time',
      'hours_off',
    ];
    if (admin) updatableKeys.push('kind');
    for (const key of updatableKeys) {
      if (out[key] !== undefined) {
        sets.push(`${key} = $${params.length + 1}`);
        params.push(out[key]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    params.push(companyId);

    await pool.query(
      `UPDATE employee_appointments SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND company_id = $${params.length}`,
      params,
    );

    const fetched = await pool.query(
      `SELECT id, user_id, company_id, title, category, notes,
              to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date,
              time_mode,
              to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time,
              hours_off, kind, status, requested_by, approved_by, approved_at,
              declined_by, declined_at, decline_reason,
              created_at, updated_at
       FROM employee_appointments WHERE id = $1`,
      [req.params.id],
    );
    res.json({ appointment: appointmentRowToJson(fetched.rows[0]) });
  } catch (err) {
    console.error('PATCH /appointments/:id:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// POST /api/appointments/:id/approve — admin only
router.post('/:id/approve', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    if (!isAdminRole(req)) {
      return res.status(403).json({ error: 'Only admins can approve appointments' });
    }
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    // Approving also clears any prior decline metadata so the employee's
    // status page shows a clean "Approved" state if a request was previously
    // declined and then re-approved by an admin.
    const r = await pool.query(
      `UPDATE employee_appointments
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           declined_by = NULL,
           declined_at = NULL,
           decline_reason = NULL,
           updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING id, user_id, company_id, title, category, notes,
                 to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
                 to_char(end_date, 'YYYY-MM-DD') AS end_date,
                 time_mode,
                 to_char(start_time, 'HH24:MI') AS start_time,
                 to_char(end_time, 'HH24:MI') AS end_time,
                 hours_off, kind, status, requested_by, approved_by, approved_at,
                 declined_by, declined_at, decline_reason,
                 created_at, updated_at`,
      [req.user.userId, req.params.id, access.companyId],
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ appointment: appointmentRowToJson(r.rows[0]) });
  } catch (err) {
    console.error('POST /appointments/:id/approve:', err);
    res.status(500).json({ error: 'Failed to approve appointment' });
  }
});

// POST /api/appointments/:id/decline — admin only.
// Unlike the old version (which DELETEd the row), we now keep the row and
// mark status='declined' so the employee can see the outcome of their
// request on the mobile status page. Accepts an optional { reason } body
// that's shown verbatim to the employee. Declined rows never count toward
// capacity (frontend already filters by status === 'approved').
router.post('/:id/decline', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    if (!isAdminRole(req)) {
      return res.status(403).json({ error: 'Only admins can decline appointments' });
    }
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const rawReason = req.body?.reason;
    const reason =
      rawReason == null || String(rawReason).trim() === ''
        ? null
        : String(rawReason).trim().slice(0, 500);

    const r = await pool.query(
      `UPDATE employee_appointments
       SET status = 'declined',
           declined_by = $1,
           declined_at = NOW(),
           decline_reason = $2,
           updated_at = NOW()
       WHERE id = $3 AND company_id = $4 AND status = 'requested'
       RETURNING id, user_id, company_id, title, category, notes,
                 to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date,
                 to_char(end_date, 'YYYY-MM-DD') AS end_date,
                 time_mode,
                 to_char(start_time, 'HH24:MI') AS start_time,
                 to_char(end_time, 'HH24:MI') AS end_time,
                 hours_off, kind, status, requested_by, approved_by, approved_at,
                 declined_by, declined_at, decline_reason,
                 created_at, updated_at`,
      [req.user.userId, reason, req.params.id, access.companyId],
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found or not in requested state' });
    }
    res.json({ appointment: appointmentRowToJson(r.rows[0]) });
  } catch (err) {
    console.error('POST /appointments/:id/decline:', err);
    res.status(500).json({ error: 'Failed to decline appointment' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;
    const admin = isAdminRole(req);
    const currentUserId = req.user.userId;

    const existing = await pool.query(
      `SELECT user_id, status FROM employee_appointments WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId],
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
    const row = existing.rows[0];

    if (!admin) {
      if (row.user_id !== currentUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Employees can cancel their own pending request, or dismiss a row
      // that the admin has declined so it stops cluttering their history.
      // They still can't remove approved rows — that would bypass the
      // approval workflow and silently unblock capacity.
      if (row.status !== 'requested' && row.status !== 'declined') {
        return res.status(403).json({
          error: 'Only pending or declined appointments can be removed by employees.',
        });
      }
    }

    await pool.query(
      `DELETE FROM employee_appointments WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /appointments/:id:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

module.exports = router;
