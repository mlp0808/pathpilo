const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

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

    const result = await pool.query(
      `SELECT user_id,
              to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              total_minutes, total_km, total_job_minutes,
              job_ids, leg_minutes
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
            job_ids, leg_minutes, route_geometry } = req.body;
    if (!user_id || !scheduled_date) {
      return res.status(400).json({ error: 'user_id and scheduled_date are required' });
    }

    // Ensure the route_geometry column exists (idempotent, one-time cost).
    await ensureRouteGeometryColumn();

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

    await pool.query(
      `INSERT INTO daily_routes
         (company_id, user_id, scheduled_date,
          total_minutes, total_km, total_job_minutes,
          job_ids, leg_minutes, route_geometry, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${jobIdsClause}, ${legMinsClause}, $7, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         total_minutes     = EXCLUDED.total_minutes,
         total_km          = EXCLUDED.total_km,
         total_job_minutes = EXCLUDED.total_job_minutes,
         job_ids           = ${jobIdsClause},
         leg_minutes       = ${legMinsClause},
         route_geometry    = EXCLUDED.route_geometry,
         updated_at        = NOW()`,
      [
        companyId, user_id, scheduled_date,
        total_minutes ?? null, total_km ?? null, total_job_minutes ?? null,
        geomValue,
      ]
    );

    res.json({ ok: true });
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

module.exports = router;
