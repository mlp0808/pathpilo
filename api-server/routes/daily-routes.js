const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { upsertPlacedRound } = require('../services/roundSync');
const { repairLibraryRoundPackagesInRange } = require('../services/roundPackages');

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

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) return { error: 'No active company found in token', status: 400 };
  return { companyId: activeCompanyId };
};

router.use(authenticateToken);

// Idempotently add the "planned package" (round) columns. A saved day route is
// elevated into a movable unit: status 'planned' means the admin finished this
// day and the UI renders one connected container for it.
let plannedColumnsEnsured = false;
async function ensurePlannedColumns() {
  if (plannedColumnsEnsured) return;
  try {
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS name TEXT`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS status VARCHAR(12) DEFAULT 'draft'`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_template_id INTEGER`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS is_occurrence_override BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_id INTEGER`);
    // Jobs that belong to the library round at place-time (detect later mixes).
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`);
    plannedColumnsEnsured = true;
  } catch (e) {
    console.warn('ensurePlannedColumns failed', e?.message || e);
  }
}

// GET /api/daily-routes?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// Returns all saved route data (order, drive times, leg times) for the date range.
router.get('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date query params required' });
    }

    await ensurePlannedColumns();
    // Round-owned subscription jobs must appear as one planned package on the
    // jobs board — re-bind any day in this window that drifted into loose stops.
    try {
      await repairLibraryRoundPackagesInRange(pool, companyId, start_date, end_date);
    } catch (repairErr) {
      console.warn('[daily-routes] package repair skipped:', repairErr?.message || repairErr);
    }
    const result = await pool.query(
      `SELECT id, user_id,
              to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              total_minutes, total_km, total_job_minutes,
              job_ids, round_job_ids, leg_minutes,
              name, status, round_template_id, is_occurrence_override, round_id
       FROM daily_routes
       WHERE company_id = $1 AND scheduled_date BETWEEN $2 AND $3
       ORDER BY scheduled_date ASC, user_id ASC`,
      [companyId, start_date, end_date]
    );

    res.json({ routes: result.rows });
  } catch (error) {
    console.error('Error fetching daily routes:', error);
    res.status(500).json({ error: 'Failed to fetch daily routes' });
  }
});

// Idempotently ensure daily_routes has the route_geometry column we need for
// storing the road-following GeoJSON coordinates from the Directions API.
let routeGeometryColumnEnsured = false;
async function ensureRouteGeometryColumn() {
  if (routeGeometryColumnEnsured) return;
  try {
    await pool.query('ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS route_geometry TEXT');
    routeGeometryColumnEnsured = true;
  } catch (e) {
    console.warn('ensureRouteGeometryColumn failed', e?.message || e);
  }
}

// PUT /api/daily-routes — upsert one day's complete route log
// Body: { user_id, scheduled_date, total_minutes, total_km, total_job_minutes,
//         job_ids, leg_minutes, route_geometry? }
//   route_geometry — optional JSON string: [[lng,lat],[lng,lat],...] GeoJSON coordinates
//                    of the road-following polyline computed by the Directions API.
//                    When present it is used by the mobile today-summary endpoint to
//                    draw an accurate route on the static map image.
router.put('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { user_id, scheduled_date, total_minutes, total_km, total_job_minutes,
            job_ids, leg_minutes, route_geometry, name, status, round_template_id } = req.body;
    if (!user_id || !scheduled_date) {
      return res.status(400).json({ error: 'user_id and scheduled_date are required' });
    }

    // Ensure the route_geometry + planned columns exist (idempotent, one-time cost).
    await ensureRouteGeometryColumn();
    await ensurePlannedColumns();

    const jobIdsArr = Array.isArray(job_ids)
      ? job_ids.map(n => parseInt(n, 10)).filter(n => !isNaN(n))
      : [];
    const jobIdsClause = jobIdsArr.length > 0 ? `ARRAY[${jobIdsArr.join(',')}]` : 'NULL';

    const legMinsArr = Array.isArray(leg_minutes) ? leg_minutes : [];
    const legMinsClause = legMinsArr.length > 0
      ? `ARRAY[${legMinsArr.map(v => (v == null || isNaN(v)) ? 'NULL' : parseFloat(v)).join(',')}]::real[]`
      : 'NULL';

    // route_geometry is a JSON-serialised [[lng,lat]] array from the web app.
    // Store as TEXT; null clears any previously cached geometry so the
    // today-summary endpoint knows to re-fetch.
    const geomValue = route_geometry != null ? String(route_geometry) : null;

    // status: only 'draft'/'planned' are valid; anything else keeps the current value.
    const statusValue = status === 'planned' || status === 'draft' ? status : null;
    const templateIdValue = Number.isInteger(Number(round_template_id)) && Number(round_template_id) > 0
      ? Number(round_template_id)
      : null;

    const requestedName = name != null && String(name).trim() !== '' ? String(name).trim() : null;

    // If this day is template-linked and job_ids change, keep the template but mark
    // the occurrence overridden and rename the day unit to "{name} (modified)".
    // Library round placements: round_job_ids are the package core; extra jobs on
    // save are fillers joining the day unit (modified) — library round stays intact.
    const existing = await pool.query(
      `SELECT id, name, round_template_id, job_ids, round_job_ids, is_occurrence_override, round_id
       FROM daily_routes
       WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3`,
      [companyId, user_id, scheduled_date]
    );
    const existingRow = existing.rows[0] || null;
    const existingIds = Array.isArray(existingRow?.job_ids)
      ? existingRow.job_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
    const roundCoreIds = Array.isArray(existingRow?.round_job_ids)
      ? existingRow.round_job_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const idsChanged =
      existingIds.length !== jobIdsArr.length
      || existingIds.some((id, i) => id !== jobIdsArr[i]);
    const hasTemplate = !!(existingRow?.round_template_id || templateIdValue);

    const coreSet = new Set(roundCoreIds);
    const packageRoundId = existingRow?.round_id != null ? Number(existingRow.round_id) : null;
    const libraryMix =
      packageRoundId != null
      && roundCoreIds.length > 0
      && (
        jobIdsArr.some((id) => !coreSet.has(id))
        || roundCoreIds.some((id) => !jobIdsArr.includes(id))
      );

    let resolvedName = requestedName;
    if (!resolvedName && ((hasTemplate && idsChanged) || libraryMix)) {
      const base = (existingRow?.name && String(existingRow.name).trim()) || 'Round';
      resolvedName = /\(modified\)\s*$/i.test(base) ? base : `${base} (modified)`;
    }

    const result = await pool.query(
      `INSERT INTO daily_routes
         (company_id, user_id, scheduled_date,
          total_minutes, total_km, total_job_minutes,
          job_ids, leg_minutes, route_geometry,
          name, status, round_template_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${jobIdsClause}, ${legMinsClause}, $7,
               $8, COALESCE($9, 'draft'), $10, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         total_minutes     = EXCLUDED.total_minutes,
         total_km          = EXCLUDED.total_km,
         total_job_minutes = EXCLUDED.total_job_minutes,
         -- A re-save of a template-linked day with a different order marks the
         -- occurrence as overridden — the template stays untouched.
         is_occurrence_override = CASE
           WHEN COALESCE(daily_routes.round_template_id, EXCLUDED.round_template_id) IS NOT NULL
                AND daily_routes.job_ids IS DISTINCT FROM ${jobIdsClause}
           THEN TRUE
           ELSE daily_routes.is_occurrence_override
         END,
         job_ids           = ${jobIdsClause},
         leg_minutes       = ${legMinsClause},
         route_geometry    = EXCLUDED.route_geometry,
         name              = COALESCE($8, daily_routes.name),
         -- Once a day is a planned package, keep it planned (don't drop back to draft).
         status            = CASE
           WHEN daily_routes.status = 'planned' OR daily_routes.round_id IS NOT NULL THEN 'planned'
           ELSE COALESCE($9, daily_routes.status)
         END,
         round_template_id = COALESCE($10, daily_routes.round_template_id),
         -- round_job_ids stays as place-time core (fillers join via job_ids only).
         updated_at        = NOW()
       RETURNING id, status, name, round_template_id, is_occurrence_override, round_id`,
      [
        companyId, user_id, scheduled_date,
        total_minutes ?? null, total_km ?? null, total_job_minutes ?? null,
        geomValue,
        resolvedName,
        statusValue,
        templateIdValue,
      ]
    );

    const row = result.rows[0] || null;

    // Never replace an existing package link with a day-sync Round.
    // That was breaking library placements: round calendar + jobs unit lost the link,
    // and stops looked like loose jobs again.
    const existingRoundId = existingRow?.round_id != null ? Number(existingRow.round_id) : null;
    let syncedRoundId = existingRoundId || row?.round_id || null;

    if (existingRoundId != null && row) {
      await pool.query(
        `UPDATE daily_routes SET round_id = $2, status = 'planned' WHERE id = $1`,
        [row.id, existingRoundId]
      );
      syncedRoundId = existingRoundId;
    } else if (row && (statusValue === 'planned' || row.status === 'planned')) {
      try {
        syncedRoundId = await upsertPlacedRound(pool, {
          companyId,
          userId: user_id,
          scheduledDate: scheduled_date,
          name: name != null && String(name).trim() !== '' ? String(name).trim() : row.name,
          totalMinutes: total_minutes,
          totalKm: total_km,
          legMinutes: legMinsArr,
          jobIds: jobIdsArr,
          roundTemplateId: row.round_template_id || templateIdValue,
          dailyRouteId: row.id,
        });
        if (syncedRoundId != null) {
          await pool.query(
            `UPDATE daily_routes SET round_id = $2 WHERE id = $1`,
            [row.id, syncedRoundId]
          );
          console.log('[daily-routes] synced round', { dailyRouteId: row.id, roundId: syncedRoundId });
        }
      } catch (syncErr) {
        console.error('[daily-routes] round sync failed:', syncErr?.message || syncErr, syncErr?.stack);
      }
    }

    res.json({
      ok: true,
      route: row,
      planned: row?.status === 'planned',
      round_id: syncedRoundId,
    });
  } catch (error) {
    console.error('[daily-routes PUT] FAILED:', error?.message, error?.detail);
    res.status(500).json({ error: 'Failed to save daily route', detail: error?.message ?? String(error) });
  }
});

// Idempotently add the geocoded-coordinate cache columns on the companies
// table. We lazy-create them from the today-summary endpoint so no dedicated
// migration is required and cost stays at "one geocode per company ever".
let companiesGeoColumnsEnsured = false;
async function ensureCompanyGeoColumns() {
  if (companiesGeoColumnsEnsured) return;
  try {
    await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_lat DOUBLE PRECISION');
    await pool.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_lng DOUBLE PRECISION');
    companiesGeoColumnsEnsured = true;
  } catch (e) {
    console.warn('ensureCompanyGeoColumns failed', e?.message || e);
  }
}

// One-shot geocode with Mapbox → returns { lat, lng } or null.
async function mapboxGeocode(address, mapboxToken) {
  if (!address || !mapboxToken) return null;
  try {
    const encoded = encodeURIComponent(address);
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
      `?limit=1&access_token=${mapboxToken}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const body = await r.json();
    const coords = body?.features?.[0]?.geometry?.coordinates;
    if (coords && coords.length === 2) return { lat: coords[1], lng: coords[0] };
  } catch (e) {
    console.warn('Mapbox geocoding failed', e?.message || e);
  }
  return null;
}

// Resolve the company's address to coords, caching the result on the
// companies row so we pay at most one geocode per company per lifetime.
async function resolveCompanyCoords(companyId, mapboxToken) {
  await ensureCompanyGeoColumns();
  const r = await pool.query(
    `SELECT address_lat, address_lng, address, zip_code, city, country
       FROM companies
      WHERE id = $1
      LIMIT 1`,
    [companyId]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];

  if (row.address_lat != null && row.address_lng != null) {
    return { lat: Number(row.address_lat), lng: Number(row.address_lng) };
  }

  const addressParts = [row.address, row.zip_code, row.city, row.country].filter(Boolean);
  if (addressParts.length === 0 || !mapboxToken) return null;
  const query = addressParts.join(', ');
  const geo = await mapboxGeocode(query, mapboxToken);
  if (!geo) return null;

  try {
    await pool.query(
      'UPDATE companies SET address_lat = $1, address_lng = $2 WHERE id = $3',
      [geo.lat, geo.lng, companyId]
    );
  } catch (e) {
    // Non-fatal; worst case we re-geocode next time.
    console.warn('Failed to cache company coords', e?.message || e);
  }
  return geo;
}

// GET /api/daily-routes/today-summary?date=YYYY-MM-DD
//
// Lightweight endpoint purpose-built for the mobile Overview screen:
// returns a one-shot summary of the caller's saved route for the given
// date (defaulting to today) plus a ready-to-render Mapbox static image
// URL of the stops. If no route has been saved, we still return
// `hasRoute: false` plus a `fallbackImageUrl` centered on the company
// address so the UI always has a map to display.
router.get('/today-summary', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const userId = req.user.userId;

    // Accept an explicit date (client sends their local date) or fall back to UTC today.
    let dateStr = String(req.query.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    }

    await ensureRouteGeometryColumn();
    const routeResult = await pool.query(
      `SELECT total_minutes, total_km, total_job_minutes, job_ids, route_geometry
         FROM daily_routes
        WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3
        LIMIT 1`,
      [companyId, userId, dateStr]
    );

    const hasRouteRow = routeResult.rows.length > 0;
    const routeRow = hasRouteRow ? routeResult.rows[0] : null;
    const orderedJobIds = Array.isArray(routeRow?.job_ids) ? routeRow.job_ids : [];

    // Always also look up the day's jobs for this user so we can report
    // a meaningful stop count even when no route has been saved yet.
    const jobsResult = await pool.query(
      `SELECT j.id,
              j.lat  AS j_lat, j.lng AS j_lng,
              c.lat  AS c_lat, c.lng AS c_lng,
              c.address AS c_address, c.zip_code AS c_zip, c.city AS c_city
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id
        WHERE j.company_id = $1
          AND j.scheduled_date = $2
          AND j.assigned_user_id = $3
          AND COALESCE(j.status, 'scheduled') NOT IN ('cancelled')`,
      [companyId, dateStr, userId]
    );

    const jobRowById = new Map(jobsResult.rows.map(r => [r.id, r]));
    const resolveCoords = (r) => {
      if (!r) return null;
      const lat = r.j_lat != null ? Number(r.j_lat) : (r.c_lat != null ? Number(r.c_lat) : null);
      const lng = r.j_lng != null ? Number(r.j_lng) : (r.c_lng != null ? Number(r.c_lng) : null);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };

    // Prefer the saved ordering if we have one; otherwise fall back to
    // whatever job order the DB gave us so "stops" still reflects reality.
    const orderedRows = orderedJobIds.length > 0
      ? orderedJobIds.map(id => jobRowById.get(id)).filter(Boolean)
      : jobsResult.rows;

    const coordList = orderedRows
      .map(resolveCoords)
      .filter(Boolean);

    const stopCount = orderedRows.length;

    // ── Map data for the interactive Mapbox GL JS map in the mobile app ──
    const mapboxToken =
      process.env.MAPBOX_TOKEN ||
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
      '';

    // Ordered stop coordinates for placing markers on the map.
    const routeStops = coordList.map(p => ({ lat: p.lat, lng: p.lng }));

    // Road-following geometry saved by the web app when the admin clicks
    // "Save & Apply". Parsed here so the mobile can use it directly with
    // Mapbox GL JS as a GeoJSON LineString coordinates array.
    let routeGeometry = null;
    const storedGeom = routeRow?.route_geometry || null;
    if (storedGeom) {
      try {
        const parsed = JSON.parse(storedGeom);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          routeGeometry = parsed; // [[lng, lat], [lng, lat], ...]
        }
      } catch (e) {
        console.warn('[today-summary] failed to parse route_geometry:', e?.message);
      }
    }

    // Company coordinates for centering the map when there's no planned route.
    let companyCoords = null;
    if (mapboxToken) {
      companyCoords = await resolveCompanyCoords(companyId, mapboxToken);
    }

    console.log('[today-summary]', {
      companyId, userId, dateStr,
      hasRoute: hasRouteRow && orderedJobIds.length > 0,
      stopCount, stops: routeStops.length,
      hasGeometry: !!routeGeometry,
      hasCompanyCoords: !!companyCoords,
      tokenPresent: !!mapboxToken,
    });

    res.json({
      date: dateStr,
      hasRoute: hasRouteRow && orderedJobIds.length > 0,
      stopCount,
      totalMinutes: routeRow?.total_minutes == null ? null : Number(routeRow.total_minutes),
      totalKm: routeRow?.total_km == null ? null : Number(routeRow.total_km),
      totalJobMinutes: routeRow?.total_job_minutes == null ? null : Number(routeRow.total_job_minutes),
      // Interactive map data — used by the mobile WebView (Mapbox GL JS).
      mapboxToken,
      routeStops,
      routeGeometry,
      companyCoords,
    });
  } catch (error) {
    console.error('Error building today-summary:', error);
    res.status(500).json({ error: 'Failed to build route summary' });
  }
});

// PATCH /api/daily-routes/meta — set only the planned-package metadata
// (name/status) for one day+user without touching totals, order or geometry.
// Used by "Save as Round → This day only" to name an already-saved route.
router.patch('/meta', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { user_id, scheduled_date, name, status } = req.body || {};
    if (!user_id || !scheduled_date) {
      return res.status(400).json({ error: 'user_id and scheduled_date are required' });
    }
    const statusValue = status === 'planned' || status === 'draft' ? status : null;
    const nameValue = name != null && String(name).trim() !== '' ? String(name).trim() : null;
    if (!statusValue && !nameValue) return res.status(400).json({ error: 'name or status required' });

    await ensurePlannedColumns();
    const result = await pool.query(
      `INSERT INTO daily_routes (company_id, user_id, scheduled_date, name, status, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'draft'), NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         name       = COALESCE($4, daily_routes.name),
         status     = COALESCE($5, daily_routes.status),
         updated_at = NOW()
       RETURNING id, name, status, round_template_id, is_occurrence_override, job_ids, total_minutes, total_km, leg_minutes, round_id`,
      [companyId, user_id, scheduled_date, nameValue, statusValue]
    );
    const row = result.rows[0] || null;
    // Library round placements must keep pointing at the library package.
    // Ad-hoc planned days still sync a day-instance Round for move/package UI.
    let syncedRoundId = row?.round_id || null;
    if (row && row.status === 'planned') {
      try {
        if (row.round_id != null) {
          const lib = await pool.query(
            `SELECT id FROM rounds
             WHERE id = $1 AND company_id = $2 AND COALESCE(in_library, FALSE) = TRUE
             LIMIT 1`,
            [row.round_id, companyId]
          );
          if (lib.rows[0]) {
            syncedRoundId = Number(lib.rows[0].id);
            return res.json({ ok: true, route: row, round_id: syncedRoundId });
          }
        }
        syncedRoundId = await upsertPlacedRound(pool, {
          companyId,
          userId: user_id,
          scheduledDate: scheduled_date,
          name: row.name,
          totalMinutes: row.total_minutes,
          totalKm: row.total_km,
          legMinutes: row.leg_minutes,
          jobIds: row.job_ids || [],
          roundTemplateId: row.round_template_id,
          dailyRouteId: row.id,
        });
        if (syncedRoundId != null) {
          await pool.query(`UPDATE daily_routes SET round_id = $2 WHERE id = $1`, [row.id, syncedRoundId]);
        }
      } catch (syncErr) {
        console.warn('[daily-routes meta] round sync failed:', syncErr?.message || syncErr);
      }
    }
    res.json({ ok: true, route: row, round_id: syncedRoundId });
  } catch (error) {
    console.error('[daily-routes PATCH meta] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to update route metadata' });
  }
});

// POST /api/daily-routes/:id/move — move a whole planned package (every job in
// job_ids plus the route row itself) to a new date and/or employee in one go.
// Body: { to_date?: 'YYYY-MM-DD', to_user_id?: number }
router.post('/:id/move', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const routeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(routeId)) return res.status(400).json({ error: 'Invalid route id' });

    const { to_date, to_user_id } = req.body || {};
    const toDate = typeof to_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to_date) ? to_date : null;
    const toUserId = Number.isInteger(Number(to_user_id)) && Number(to_user_id) > 0 ? Number(to_user_id) : null;
    if (!toDate && !toUserId) {
      return res.status(400).json({ error: 'to_date or to_user_id required' });
    }

    await ensurePlannedColumns();
    const routeResult = await dbClient.query(
      `SELECT id, user_id, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date, job_ids
         FROM daily_routes
        WHERE id = $1 AND company_id = $2
        LIMIT 1`,
      [routeId, companyId]
    );
    if (routeResult.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    const route = routeResult.rows[0];

    const targetDate = toDate || route.scheduled_date;
    const targetUserId = toUserId || route.user_id;
    if (targetDate === route.scheduled_date && targetUserId === route.user_id) {
      return res.json({ ok: true, moved: 0 });
    }

    // Refuse to overwrite an existing package on the target day/employee.
    const clash = await dbClient.query(
      `SELECT id FROM daily_routes
        WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3 AND id <> $4
        LIMIT 1`,
      [companyId, targetUserId, targetDate, routeId]
    );
    if (clash.rows.length > 0) {
      return res.status(409).json({ error: 'A saved route already exists for that employee and day' });
    }

    const jobIds = Array.isArray(route.job_ids) ? route.job_ids.filter(n => Number.isInteger(Number(n))) : [];

    await dbClient.query('BEGIN');

    if (jobIds.length > 0) {
      await dbClient.query(
        `UPDATE jobs
            SET scheduled_date   = $1,
                assigned_user_id = $2,
                updated_at       = NOW()
          WHERE company_id = $3 AND id = ANY($4::int[])`,
        [targetDate, targetUserId, companyId, jobIds]
      );
    }

    // Geometry/legs were computed from the old employee's home base; clear them
    // when the employee changes so the next load re-fetches directions.
    const clearGeometry = targetUserId !== route.user_id;
    await dbClient.query(
      `UPDATE daily_routes
          SET scheduled_date = $1,
              user_id        = $2,
              route_geometry = CASE WHEN $3 THEN NULL ELSE route_geometry END,
              updated_at     = NOW()
        WHERE id = $4 AND company_id = $5`,
      [targetDate, targetUserId, clearGeometry, routeId, companyId]
    );

    await dbClient.query('COMMIT');
    res.json({ ok: true, moved: jobIds.length, to_date: targetDate, to_user_id: targetUserId });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch { /* not in a tx */ }
    console.error('[daily-routes move] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to move route', detail: error?.message ?? String(error) });
  } finally {
    dbClient.release();
  }
});

module.exports = router;
