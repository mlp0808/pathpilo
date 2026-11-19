/**
 * Admin CRUD for the in-app guides shown in the user banner.
 * Mounted at /api/admin/guides, before the general /api/admin router.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { pool } = require('../utils/database');
const {
  ensureGuidesSchema,
  normalizeDoneTrigger,
  GUIDE_COUNT_KEYS,
  GUIDE_VISIT_KEYS,
  MEDIA_TYPES,
} = require('../services/guidesSchema');
const { describe, EXCLUDED, WRITE_METHODS } = require('../middleware/activityTracker');
const { ensureActivityEventsSchema } = require('../utils/activityEvents');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const GUIDE_MEDIA_DIR = path.resolve(__dirname, '..', 'uploads', 'guides');
try { fs.mkdirSync(GUIDE_MEDIA_DIR, { recursive: true }); } catch (_) { /* exists */ }

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

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(authenticateToken);
router.use(requireAdmin);
router.use(async (_req, _res, next) => {
  try {
    await ensureGuidesSchema(pool);
    next();
  } catch (e) {
    next(e);
  }
});

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const VIDEO_MIMES = ['video/mp4', 'video/webm'];

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, GUIDE_MEDIA_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '.bin').toLowerCase().slice(0, 8);
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  // Short screen recordings only — anything bigger belongs on a video host.
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (![...IMAGE_MIMES, ...VIDEO_MIMES].includes(file.mimetype)) {
      return cb(new Error('Use MP4/WebM video or PNG, JPG, WEBP, GIF images'));
    }
    cb(null, true);
  },
});

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function serializeGuide(row, stepCount) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    icon: row.icon || '',
    sortOrder: row.sort_order,
    isPublished: row.is_published !== false,
    stepCount: stepCount ?? Number(row.step_count) ?? 0,
    updatedAt: row.updated_at,
  };
}

function serializeStep(row) {
  return {
    id: row.id,
    guideId: row.guide_id,
    sortOrder: row.sort_order,
    title: row.title,
    body: row.body || '',
    mediaType: row.media_type || 'none',
    mediaPath: row.media_path || null,
    mediaUrl: row.media_path ? `/api/guides/media/${row.media_path}` : null,
    ctaLabel: row.cta_label || null,
    ctaHref: row.cta_href || null,
    doneTrigger: row.done_trigger || null,
  };
}

/** Deletes an uploaded file that is no longer referenced by any step. */
async function deleteOrphanMedia(mediaPath) {
  if (!mediaPath) return;
  const stillUsed = await pool.query(
    `SELECT 1 FROM guide_steps WHERE media_path = $1 LIMIT 1`,
    [mediaPath]
  );
  if (stillUsed.rows.length > 0) return;
  try {
    fs.unlinkSync(path.join(GUIDE_MEDIA_DIR, path.basename(mediaPath)));
  } catch (_) { /* already gone */ }
}

/** "/api/jobs" from an Express 4 mount regexp like /^\/api\/jobs\/?(?=\/|$)/i. */
function mountPathOf(layer) {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  const path = layer.regexp.source
    .replace(/^\^/, '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')
    .replace(/\\\//g, '/');
  return /[()[\]*+?$^|\\]/.test(path) ? null : path;
}

/** Every write route the API exposes, as ["PUT", "/api/jobs/:id"] pairs. */
function listWriteRoutes(stack, prefix = '', out = []) {
  for (const layer of stack || []) {
    if (layer.route && typeof layer.route.path === 'string') {
      for (const method of Object.keys(layer.route.methods || {})) {
        const upper = method.toUpperCase();
        if (WRITE_METHODS.has(upper)) out.push([upper, `${prefix}${layer.route.path}`.replace(/\/+$/, '') || '/']);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mount = mountPathOf(layer);
      if (mount !== null) listWriteRoutes(layer.handle.stack, `${prefix}${mount}`, out);
    }
  }
  return out;
}

/**
 * Every action a user can take that the activity tracker records, named the
 * way the tracker names it — so whatever is picked here is exactly what fires.
 * Built from the live route table, so new endpoints show up by themselves.
 */
async function actionCatalog(app) {
  const byEvent = new Map();
  const add = (event, route) => {
    const entry = byEvent.get(event) || { event, routes: [], companies: 0 };
    if (route && !entry.routes.includes(route)) entry.routes.push(route);
    byEvent.set(event, entry);
  };

  for (const [method, routePath] of listWriteRoutes(app?._router?.stack)) {
    if (!routePath.startsWith('/api/')) continue;
    // Params become a numeric id so the tracker normalizes them like real requests.
    const concrete = routePath.replace(/:[A-Za-z0-9_]+\??/g, '1');
    if (EXCLUDED.some((rx) => rx.test(concrete))) continue;
    add(describe(method, concrete).event, `${method} ${routePath}`);
  }

  try {
    await ensureActivityEventsSchema();
    const seen = await pool.query(
      `SELECT event, COUNT(DISTINCT company_id)::int AS companies
       FROM activity_events
       WHERE source IN ('app', 'backfill') AND company_id IS NOT NULL
       GROUP BY event`
    );
    for (const row of seen.rows) {
      if (/^(session|auth|page|signup|system)\./.test(row.event)) continue;
      add(row.event, null);
      byEvent.get(row.event).companies = row.companies;
    }
  } catch (e) {
    console.warn('[admin-guides] event usage unavailable:', e?.message || e);
  }

  return [...byEvent.values()]
    .filter((a) => !/^(guides|getting_started)\./.test(a.event))
    .sort((a, b) => a.event.localeCompare(b.event));
}

// GET /api/admin/guides/triggers — everything a step can be completed by.
router.get('/triggers', async (req, res) => {
  try {
    res.json({
      countKeys: GUIDE_COUNT_KEYS,
      visitKeys: GUIDE_VISIT_KEYS,
      mediaTypes: MEDIA_TYPES,
      actions: await actionCatalog(req.app),
    });
  } catch (error) {
    console.error('GET /admin/guides/triggers', error);
    res.status(500).json({ error: 'Failed to load triggers' });
  }
});

// POST /api/admin/guides/media — upload one image or video, return its filename.
router.post('/media', (req, res) => {
  mediaUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const mediaType = VIDEO_MIMES.includes(req.file.mimetype) ? 'video' : 'image';
    res.json({
      mediaPath: req.file.filename,
      mediaType,
      mediaUrl: `/api/guides/media/${req.file.filename}`,
    });
  });
});

// GET /api/admin/guides — list for the overview table.
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, (SELECT COUNT(*) FROM guide_steps s WHERE s.guide_id = g.id)::int AS step_count
       FROM guides g
       ORDER BY g.sort_order ASC, g.id ASC`
    );
    res.json({ guides: result.rows.map((r) => serializeGuide(r)) });
  } catch (error) {
    console.error('GET /admin/guides', error);
    res.status(500).json({ error: 'Failed to load guides' });
  }
});

// PUT /api/admin/guides/reorder — body { ids: [3, 1, 2] }
router.put('/reorder', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'No order provided' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i += 1) {
        await client.query(`UPDATE guides SET sort_order = $1, updated_at = NOW() WHERE id = $2`, [i, ids[i]]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('PUT /admin/guides/reorder', error);
    res.status(500).json({ error: 'Failed to reorder guides' });
  }
});

// POST /api/admin/guides — create an empty guide.
router.post('/', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const base = slugify(req.body?.slug || title, `guide-${Date.now()}`);
    // Keep slugs unique without asking the admin to care about them.
    const taken = await pool.query(`SELECT slug FROM guides WHERE slug LIKE $1`, [`${base}%`]);
    const existing = new Set(taken.rows.map((r) => r.slug));
    let slug = base;
    let n = 2;
    while (existing.has(slug)) slug = `${base}-${n++}`;

    const next = await pool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM guides`);
    const result = await pool.query(
      `INSERT INTO guides (slug, title, description, icon, sort_order, is_published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        slug,
        title.slice(0, 160),
        String(req.body?.description || '').trim() || null,
        String(req.body?.icon || '').trim().slice(0, 16),
        Number(next.rows[0]?.n) || 0,
        req.body?.isPublished !== false,
      ]
    );
    res.status(201).json({ guide: serializeGuide(result.rows[0], 0) });
  } catch (error) {
    console.error('POST /admin/guides', error);
    res.status(500).json({ error: 'Failed to create guide' });
  }
});

// GET /api/admin/guides/:id — guide with all of its steps.
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid guide' });

    const [guideRes, stepsRes] = await Promise.all([
      pool.query(`SELECT * FROM guides WHERE id = $1`, [id]),
      pool.query(
        `SELECT * FROM guide_steps WHERE guide_id = $1 ORDER BY sort_order ASC, id ASC`,
        [id]
      ),
    ]);
    if (!guideRes.rows[0]) return res.status(404).json({ error: 'Guide not found' });

    res.json({
      guide: serializeGuide(guideRes.rows[0], stepsRes.rows.length),
      steps: stepsRes.rows.map(serializeStep),
    });
  } catch (error) {
    console.error('GET /admin/guides/:id', error);
    res.status(500).json({ error: 'Failed to load guide' });
  }
});

// PUT /api/admin/guides/:id — rename, re-describe, publish or unpublish.
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid guide' });

    const sets = [];
    const params = [id];
    const push = (sql, value) => {
      params.push(value);
      sets.push(`${sql} = $${params.length}`);
    };

    if ('title' in req.body) {
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Title is required' });
      push('title', title.slice(0, 160));
    }
    if ('description' in req.body) push('description', String(req.body.description || '').trim() || null);
    if ('icon' in req.body) push('icon', String(req.body.icon || '').trim().slice(0, 16));
    if ('isPublished' in req.body) push('is_published', req.body.isPublished !== false);

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const result = await pool.query(
      `UPDATE guides SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Guide not found' });
    res.json({ guide: serializeGuide(result.rows[0]) });
  } catch (error) {
    console.error('PUT /admin/guides/:id', error);
    res.status(500).json({ error: 'Failed to save guide' });
  }
});

// DELETE /api/admin/guides/:id — removes the guide and its steps.
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid guide' });

    const media = await pool.query(
      `SELECT media_path FROM guide_steps WHERE guide_id = $1 AND media_path IS NOT NULL`,
      [id]
    );
    await pool.query(`DELETE FROM guides WHERE id = $1`, [id]);
    for (const row of media.rows) await deleteOrphanMedia(row.media_path);

    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /admin/guides/:id', error);
    res.status(500).json({ error: 'Failed to delete guide' });
  }
});

/** Shared field handling for creating and updating a step. */
function stepFieldsFromBody(body) {
  const mediaType = MEDIA_TYPES.includes(body?.mediaType) ? body.mediaType : 'none';
  const mediaPath = mediaType === 'none' ? null : (String(body?.mediaPath || '').trim() || null);
  return {
    title: String(body?.title || '').trim().slice(0, 200),
    body: String(body?.body || ''),
    mediaType: mediaPath ? mediaType : 'none',
    mediaPath,
    ctaLabel: String(body?.ctaLabel || '').trim().slice(0, 80) || null,
    ctaHref: String(body?.ctaHref || '').trim() || null,
    doneTrigger: normalizeDoneTrigger(body?.doneTrigger),
  };
}

// POST /api/admin/guides/:id/steps — append a step.
router.post('/:id/steps', async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    if (!Number.isFinite(guideId)) return res.status(400).json({ error: 'Invalid guide' });

    const fields = stepFieldsFromBody(req.body);
    if (!fields.title) return res.status(400).json({ error: 'Title is required' });

    const next = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM guide_steps WHERE guide_id = $1`,
      [guideId]
    );
    const result = await pool.query(
      `INSERT INTO guide_steps
         (guide_id, sort_order, title, body, media_type, media_path, cta_label, cta_href, done_trigger)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        guideId,
        Number(next.rows[0]?.n) || 0,
        fields.title,
        fields.body,
        fields.mediaType,
        fields.mediaPath,
        fields.ctaLabel,
        fields.ctaHref,
        fields.doneTrigger,
      ]
    );
    res.status(201).json({ step: serializeStep(result.rows[0]) });
  } catch (error) {
    if (error?.code === '23503') return res.status(404).json({ error: 'Guide not found' });
    console.error('POST /admin/guides/:id/steps', error);
    res.status(500).json({ error: 'Failed to create step' });
  }
});

// PUT /api/admin/guides/:id/steps/reorder — body { ids: [5, 4, 6] }
router.put('/:id/steps/reorder', async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (!Number.isFinite(guideId) || ids.length === 0) {
      return res.status(400).json({ error: 'No order provided' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i += 1) {
        await client.query(
          `UPDATE guide_steps SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND guide_id = $3`,
          [i, ids[i], guideId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('PUT /admin/guides/:id/steps/reorder', error);
    res.status(500).json({ error: 'Failed to reorder steps' });
  }
});

// PUT /api/admin/guides/:id/steps/:stepId — save one step.
router.put('/:id/steps/:stepId', async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (!Number.isFinite(guideId) || !Number.isFinite(stepId)) {
      return res.status(400).json({ error: 'Invalid step' });
    }

    const fields = stepFieldsFromBody(req.body);
    if (!fields.title) return res.status(400).json({ error: 'Title is required' });

    const before = await pool.query(
      `SELECT media_path FROM guide_steps WHERE id = $1 AND guide_id = $2`,
      [stepId, guideId]
    );
    if (!before.rows[0]) return res.status(404).json({ error: 'Step not found' });

    const result = await pool.query(
      `UPDATE guide_steps
       SET title = $3, body = $4, media_type = $5, media_path = $6,
           cta_label = $7, cta_href = $8, done_trigger = $9, updated_at = NOW()
       WHERE id = $1 AND guide_id = $2
       RETURNING *`,
      [
        stepId,
        guideId,
        fields.title,
        fields.body,
        fields.mediaType,
        fields.mediaPath,
        fields.ctaLabel,
        fields.ctaHref,
        fields.doneTrigger,
      ]
    );

    const oldMedia = before.rows[0].media_path;
    if (oldMedia && oldMedia !== fields.mediaPath) await deleteOrphanMedia(oldMedia);

    res.json({ step: serializeStep(result.rows[0]) });
  } catch (error) {
    console.error('PUT /admin/guides/:id/steps/:stepId', error);
    res.status(500).json({ error: 'Failed to save step' });
  }
});

// DELETE /api/admin/guides/:id/steps/:stepId
router.delete('/:id/steps/:stepId', async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    if (!Number.isFinite(guideId) || !Number.isFinite(stepId)) {
      return res.status(400).json({ error: 'Invalid step' });
    }

    const removed = await pool.query(
      `DELETE FROM guide_steps WHERE id = $1 AND guide_id = $2 RETURNING media_path`,
      [stepId, guideId]
    );
    if (!removed.rows[0]) return res.status(404).json({ error: 'Step not found' });
    await deleteOrphanMedia(removed.rows[0].media_path);

    res.json({ success: true });
  } catch (error) {
    console.error('DELETE /admin/guides/:id/steps/:stepId', error);
    res.status(500).json({ error: 'Failed to delete step' });
  }
});

module.exports = router;
