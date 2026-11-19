const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureGuidesSchema } = require('../services/guidesSchema');
const { loadOnboardingCounts, parseVisits, VISIT_KEYS } = require('../utils/onboardingCounts');
const { ensureCompanyOnboardingSchema } = require('../utils/companyOnboardingSchema');
const { ensureActivityEventsSchema, queuedEventNames } = require('../utils/activityEvents');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

const GUIDE_MEDIA_DIR = path.resolve(__dirname, '..', 'uploads', 'guides');
try { fs.mkdirSync(GUIDE_MEDIA_DIR, { recursive: true }); } catch (_) { /* exists */ }

const MEDIA_CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// GET /api/guides/media/:filename — serve an uploaded guide image or video.
// Public (no token) so <img>/<video> tags work without custom headers.
router.get('/media/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(GUIDE_MEDIA_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

  const type = MEDIA_CONTENT_TYPES[path.extname(filename).toLowerCase()];
  if (type) res.setHeader('Content-Type', type);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  // sendFile handles Range requests, which videos need in order to seek.
  res.sendFile(filePath);
});

router.use(authenticateToken);

function activeCompanyId(req) {
  const id = req.user?.activeCompanyId ?? req.user?.companyId;
  return Number.isFinite(Number(id)) ? Number(id) : null;
}

function userId(req) {
  const id = req.user?.userId ?? req.user?.id;
  return Number.isFinite(Number(id)) ? Number(id) : null;
}

function serializeStep(row) {
  return {
    id: row.id,
    guideId: row.guide_id,
    sortOrder: row.sort_order,
    title: row.title,
    body: row.body || '',
    mediaType: row.media_type || 'none',
    mediaUrl: row.media_path ? `/api/guides/media/${row.media_path}` : null,
    ctaLabel: row.cta_label || null,
    ctaHref: row.cta_href || null,
    doneTrigger: row.done_trigger || null,
  };
}

function idList(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

/** Reads (creating if needed) this user's progress row for the company. */
async function loadProgress(uid, companyId) {
  const existing = await pool.query(
    `SELECT active_guide_id, done_step_ids, seen_step_ids, banner_minimized, banner_dismissed
     FROM user_guide_progress WHERE user_id = $1 AND company_id = $2`,
    [uid, companyId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO user_guide_progress (user_id, company_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, company_id) DO UPDATE SET updated_at = NOW()
     RETURNING active_guide_id, done_step_ids, seen_step_ids, banner_minimized, banner_dismissed`,
    [uid, companyId]
  );
  return created.rows[0];
}

function serializeProgress(row) {
  return {
    activeGuideId: row?.active_guide_id ?? null,
    doneStepIds: idList(row?.done_step_ids),
    seenStepIds: idList(row?.seen_step_ids),
    bannerMinimized: row?.banner_minimized === true,
    bannerDismissed: row?.banner_dismissed === true,
  };
}

/**
 * Which `event:` triggers used by published steps this company has fired.
 * Impersonation (overwatch) never completes a customer's steps.
 */
async function loadTriggerEvents(companyId, stepRows) {
  const wanted = [
    ...new Set(
      stepRows
        .map((r) => r.done_trigger || '')
        .filter((t) => t.startsWith('event:'))
        .map((t) => t.slice(6))
    ),
  ];
  if (wanted.length === 0) return {};

  const fired = queuedEventNames(companyId);
  try {
    await ensureActivityEventsSchema();
    const result = await pool.query(
      `SELECT DISTINCT event FROM activity_events
       WHERE company_id = $1 AND event = ANY($2::text[]) AND source <> 'overwatch'`,
      [companyId, wanted]
    );
    for (const row of result.rows) fired.add(row.event);
  } catch (e) {
    console.warn('[guides] event triggers unavailable:', e?.message || e);
  }

  const out = {};
  for (const name of wanted) if (fired.has(name)) out[name] = true;
  return out;
}

// GET /api/guides — published guides with their steps, plus this user's
// progress and the live counters that auto-complete steps.
router.get('/', async (req, res) => {
  try {
    const companyId = activeCompanyId(req);
    const uid = userId(req);
    if (!companyId || !uid) return res.status(404).json({ error: 'Company not found' });

    await ensureGuidesSchema(pool);
    await ensureCompanyOnboardingSchema(pool);

    const [guidesRes, stepsRes, progressRow, counts, visitsRow] = await Promise.all([
      pool.query(
        `SELECT id, slug, title, description, icon, sort_order
         FROM guides WHERE is_published = TRUE
         ORDER BY sort_order ASC, id ASC`
      ),
      pool.query(
        `SELECT s.* FROM guide_steps s
         JOIN guides g ON g.id = s.guide_id
         WHERE g.is_published = TRUE
         ORDER BY s.sort_order ASC, s.id ASC`
      ),
      loadProgress(uid, companyId),
      loadOnboardingCounts(pool, companyId),
      pool.query(`SELECT getting_started_visits FROM companies WHERE id = $1`, [companyId]),
    ]);

    const events = await loadTriggerEvents(companyId, stepsRes.rows);

    const stepsByGuide = new Map();
    for (const row of stepsRes.rows) {
      const list = stepsByGuide.get(row.guide_id) || [];
      list.push(serializeStep(row));
      stepsByGuide.set(row.guide_id, list);
    }

    res.json({
      guides: guidesRes.rows.map((g) => ({
        id: g.id,
        slug: g.slug,
        title: g.title,
        description: g.description || '',
        icon: g.icon || '',
        steps: stepsByGuide.get(g.id) || [],
      })),
      progress: serializeProgress(progressRow),
      counts,
      visits: parseVisits(visitsRow.rows[0]?.getting_started_visits),
      events,
    });
  } catch (error) {
    console.error('GET /guides', error);
    res.status(500).json({ error: 'Failed to load guides' });
  }
});

// PUT /api/guides/progress — switch guide, minimize or dismiss the banner.
router.put('/progress', async (req, res) => {
  try {
    const companyId = activeCompanyId(req);
    const uid = userId(req);
    if (!companyId || !uid) return res.status(404).json({ error: 'Company not found' });

    await ensureGuidesSchema(pool);
    await loadProgress(uid, companyId);

    const sets = [];
    const params = [uid, companyId];

    if ('activeGuideId' in req.body) {
      const raw = req.body.activeGuideId;
      const next = raw == null || raw === '' ? null : Number(raw);
      if (next != null && !Number.isFinite(next)) {
        return res.status(400).json({ error: 'Invalid guide' });
      }
      if (next != null) {
        const exists = await pool.query(
          `SELECT 1 FROM guides WHERE id = $1 AND is_published = TRUE`,
          [next]
        );
        if (exists.rows.length === 0) return res.status(404).json({ error: 'Guide not found' });
      }
      params.push(next);
      sets.push(`active_guide_id = $${params.length}`);
    }

    if ('bannerMinimized' in req.body) {
      params.push(req.body.bannerMinimized === true);
      sets.push(`banner_minimized = $${params.length}`);
    }

    if ('bannerDismissed' in req.body) {
      params.push(req.body.bannerDismissed === true);
      sets.push(`banner_dismissed = $${params.length}`);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const updated = await pool.query(
      `UPDATE user_guide_progress SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $1 AND company_id = $2
       RETURNING active_guide_id, done_step_ids, seen_step_ids, banner_minimized, banner_dismissed`,
      params
    );
    res.json({ progress: serializeProgress(updated.rows[0]) });
  } catch (error) {
    console.error('PUT /guides/progress', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

/** Adds or removes a step id inside one of the jsonb id arrays. */
async function toggleStepId(uid, companyId, column, stepId, include) {
  const current = await loadProgress(uid, companyId);
  const list = new Set(idList(current[column]));
  if (include) list.add(stepId);
  else list.delete(stepId);

  const updated = await pool.query(
    `UPDATE user_guide_progress SET ${column} = $3::jsonb, updated_at = NOW()
     WHERE user_id = $1 AND company_id = $2
     RETURNING active_guide_id, done_step_ids, seen_step_ids, banner_minimized, banner_dismissed`,
    [uid, companyId, JSON.stringify([...list])]
  );
  return updated.rows[0];
}

// PUT /api/guides/steps/:stepId/done — manual tick (steps without a trigger,
// or a user who wants to move past one).
router.put('/steps/:stepId/done', async (req, res) => {
  try {
    const companyId = activeCompanyId(req);
    const uid = userId(req);
    if (!companyId || !uid) return res.status(404).json({ error: 'Company not found' });

    const stepId = Number(req.params.stepId);
    if (!Number.isFinite(stepId)) return res.status(400).json({ error: 'Invalid step' });

    await ensureGuidesSchema(pool);
    const row = await toggleStepId(uid, companyId, 'done_step_ids', stepId, req.body?.done !== false);
    res.json({ progress: serializeProgress(row) });
  } catch (error) {
    console.error('PUT /guides/steps/:stepId/done', error);
    res.status(500).json({ error: 'Failed to update step' });
  }
});

// PUT /api/guides/steps/:stepId/seen — opening a step counts as reading it.
router.put('/steps/:stepId/seen', async (req, res) => {
  try {
    const companyId = activeCompanyId(req);
    const uid = userId(req);
    if (!companyId || !uid) return res.status(404).json({ error: 'Company not found' });

    const stepId = Number(req.params.stepId);
    if (!Number.isFinite(stepId)) return res.status(400).json({ error: 'Invalid step' });

    await ensureGuidesSchema(pool);
    const row = await toggleStepId(uid, companyId, 'seen_step_ids', stepId, true);
    res.json({ progress: serializeProgress(row) });
  } catch (error) {
    console.error('PUT /guides/steps/:stepId/seen', error);
    res.status(500).json({ error: 'Failed to update step' });
  }
});

module.exports = router;
module.exports.GUIDE_MEDIA_DIR = GUIDE_MEDIA_DIR;
module.exports.VISIT_KEYS = VISIT_KEYS;
