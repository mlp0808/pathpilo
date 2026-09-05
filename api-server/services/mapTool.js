/**
 * Map multitool engine.
 *
 * Answers the questions the /[company]/map tool asks:
 *   - which route-days (employee + date) exist in a window, with stop coords
 *   - which routes pass closest to a target location, and how much time
 *     inserting a new stop would add (cheapest-insertion detour)
 *   - which clients are within a radius of a location
 *   - which routes/days a specific client's location is part of
 *
 * Projected subscription occurrences are included (same virtual-id scheme as
 * GET /api/jobs: subscription-{id}-{occ}) so "soonest" suggestions also see
 * recurring work that has not been materialized yet.
 *
 * Distance model: haversine at ~45 km/h average driving speed. This is a
 * pre-filter/estimate — the UI refines the top suggestions with Mapbox
 * directions when the user opens a route. Keeping the engine Mapbox-free makes
 * it fast and free to call on every search.
 */

const { pool } = require('../utils/database');
const { computeSubscriptionOccurrenceDate } = require('../utils/subscriptionVirtualJob');

const AVG_SPEED_KMH = 45;
const MAX_OCCURRENCE_ITERATIONS = 400;

// ── Small in-memory snapshot cache ──────────────────────────────────────────
// Route-day stops for (company, window) are reused across nearest-routes and
// employee-days calls for ~60s so repeated searches feel instant.
const snapshotCache = new Map(); // key -> { expires:number, value:any }
const SNAPSHOT_TTL_MS = 60 * 1000;

function cacheGet(key) {
  const hit = snapshotCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { snapshotCache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  // Bound memory: drop oldest entries beyond 200 keys.
  if (snapshotCache.size > 200) {
    const firstKey = snapshotCache.keys().next().value;
    if (firstKey) snapshotCache.delete(firstKey);
  }
  snapshotCache.set(key, { expires: Date.now() + SNAPSHOT_TTL_MS, value });
}

/** Invalidate all snapshots for a company (call after job/subscription writes). */
function invalidateCompany(companyId) {
  for (const key of snapshotCache.keys()) {
    if (key.startsWith(`${companyId}:`)) snapshotCache.delete(key);
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function kmToMinutes(km) {
  return (km / AVG_SPEED_KMH) * 60;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Data assembly ───────────────────────────────────────────────────────────

/** Company employees (id -> name). */
async function getCompanyUsers(companyId) {
  const res = await pool.query(
    `SELECT u.id, u.first_name, u.last_name
     FROM users u
     JOIN user_companies uc ON uc.user_id = u.id
     WHERE uc.company_id = $1`,
    [companyId]
  );
  const map = new Map();
  for (const row of res.rows) {
    map.set(Number(row.id), `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User ${row.id}`);
  }
  return map;
}

/** Real active jobs in [from,to] with coords + per-job duration.
 *  Cancelled / deleted jobs are not a route — exclude them so nearest-routes
 *  never ranks empty or cancelled-only employee-days.
 */
async function getRealStops(companyId, from, to) {
  const res = await pool.query(
    `SELECT
       j.id,
       j.scheduled_date AS date,
       j.assigned_user_id,
       j.client_id,
       j.status,
       j.scheduled_time_from,
       j.scheduled_time_to,
       j.title,
       COALESCE(j.lat, c.lat) AS lat,
       COALESCE(j.lng, c.lng) AS lng,
       c.name AS client_name,
       c.last_name AS client_last_name,
       c.address, c.zip_code, c.city,
       COALESCE(d.mins, 0) AS duration_minutes
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN LATERAL (
       SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) AS mins
       FROM job_services js
       LEFT JOIN services s ON s.id = js.service_id
       WHERE js.job_id = j.id
     ) d ON true
     WHERE j.company_id = $1
       AND j.scheduled_date BETWEEN $2 AND $3
       AND j.assigned_user_id IS NOT NULL
       AND j.status NOT IN ('cancelled', 'deleted')`,
    [companyId, from, to]
  );
  return res.rows.map((r) => ({
    id: r.id,
    date: String(r.date).slice(0, 10),
    userId: r.assigned_user_id != null ? Number(r.assigned_user_id) : null,
    clientId: r.client_id != null ? Number(r.client_id) : null,
    lat: num(r.lat),
    lng: num(r.lng),
    label: r.client_name
      ? `${r.client_name}${r.client_last_name ? ' ' + r.client_last_name : ''}`
      : (r.title || 'Job'),
    address: [r.address, r.zip_code, r.city].filter(Boolean).join(', '),
    timeFrom: r.scheduled_time_from,
    timeTo: r.scheduled_time_to,
    durationMinutes: Number(r.duration_minutes) || 0,
    isProjected: false,
    status: String(r.status || 'scheduled'),
  }));
}

/**
 * Projected subscription occurrences in [from,to] that have NOT been
 * materialized. Uses the canonical occurrence-date math shared with the
 * subscriptions materialize endpoint.
 */
async function getProjectedStops(companyId, from, to) {
  let subs = [];
  try {
    const res = await pool.query(
      `SELECT rj.*, c.lat AS client_lat, c.lng AS client_lng,
              c.name AS client_name, c.last_name AS client_last_name,
              c.address, c.zip_code, c.city,
              COALESCE(d.mins, 0) AS duration_minutes
       FROM recurring_jobs rj
       LEFT JOIN clients c ON c.id = rj.client_id
       LEFT JOIN LATERAL (
         SELECT SUM(COALESCE(rjs.custom_duration_minutes, s.duration_minutes, 0)) AS mins
         FROM recurring_job_services rjs
         LEFT JOIN services s ON s.id = rjs.service_id
         WHERE rjs.recurring_job_id = rj.id
       ) d ON true
       WHERE rj.company_id = $1 AND rj.is_active = true`,
      [companyId]
    );
    subs = res.rows;
  } catch (err) {
    if (err && (err.code === '42P01' || String(err.message || '').includes('recurring_jobs'))) {
      return []; // demo DBs without subscriptions
    }
    throw err;
  }
  if (subs.length === 0) return [];

  // Materialized (sub, occ) pairs — never show these as projected.
  const subIds = subs.map((s) => s.id);
  const matRes = await pool.query(
    `SELECT recurring_job_id, recurring_occurrence, scheduled_date AS date
     FROM jobs
     WHERE company_id = $1 AND recurring_job_id = ANY($2::int[])`,
    [companyId, subIds]
  );
  const materializedOcc = new Set(
    matRes.rows
      .filter((r) => r.recurring_occurrence != null)
      .map((r) => `${r.recurring_job_id}:${r.recurring_occurrence}`)
  );
  const materializedDate = new Set(
    matRes.rows.map((r) => `${r.recurring_job_id}:${String(r.date).slice(0, 10)}`)
  );

  const stops = [];
  for (const sub of subs) {
    let pausedAtStr = null;
    if (sub.paused_at) {
      const p = sub.paused_at;
      pausedAtStr = p instanceof Date
        ? p.toISOString().split('T')[0]
        : String(p).split('T')[0];
    }
    for (let occ = 1; occ <= MAX_OCCURRENCE_ITERATIONS; occ++) {
      const dateStr = computeSubscriptionOccurrenceDate(sub, occ);
      if (!dateStr) break;
      if (dateStr > to) break;
      if (dateStr < from) continue;
      if (pausedAtStr && dateStr >= pausedAtStr) break;
      if (materializedOcc.has(`${sub.id}:${occ}`)) continue;
      if (materializedDate.has(`${sub.id}:${dateStr}`)) continue;
      stops.push({
        id: `subscription-${sub.id}-${occ}`,
        date: dateStr,
        userId: sub.assigned_user_id != null ? Number(sub.assigned_user_id) : null,
        clientId: sub.client_id != null ? Number(sub.client_id) : null,
        subscriptionId: sub.id,
        occurrence: occ,
        lat: num(sub.client_lat),
        lng: num(sub.client_lng),
        label: sub.client_name
          ? `${sub.client_name}${sub.client_last_name ? ' ' + sub.client_last_name : ''}`
          : (sub.title || 'Subscription'),
        address: [sub.address, sub.zip_code, sub.city].filter(Boolean).join(', '),
        timeFrom: sub.scheduled_time_from,
        timeTo: sub.scheduled_time_to,
        durationMinutes: Number(sub.duration_minutes) || 0,
        isProjected: true,
        status: 'scheduled',
      });
    }
  }
  return stops;
}

/** All stops (real + projected) in the window, cached ~60s per company+window. */
async function getStopsSnapshot(companyId, from, to) {
  const key = `${companyId}:${from}:${to}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const [real, projected] = await Promise.all([
    getRealStops(companyId, from, to),
    getProjectedStops(companyId, from, to),
  ]);
  const value = [...real, ...projected];
  cacheSet(key, value);
  return value;
}

/** Saved daily_routes totals for the window: `${userId}:${date}` -> row. */
async function getSavedRouteTotals(companyId, from, to) {
  const map = new Map();
  try {
    const res = await pool.query(
      `SELECT user_id, to_char(scheduled_date,'YYYY-MM-DD') AS date,
              total_minutes, total_km, total_job_minutes
       FROM daily_routes
       WHERE company_id = $1 AND scheduled_date BETWEEN $2 AND $3`,
      [companyId, from, to]
    );
    for (const r of res.rows) {
      map.set(`${Number(r.user_id)}:${r.date}`, r);
    }
  } catch { /* table may be missing in demo setups */ }
  return map;
}

/** Group stops into route-days keyed `${date}:${userId}`. */
function groupRouteDays(stops) {
  const days = new Map();
  for (const s of stops) {
    if (s.userId == null) continue;
    const key = `${s.date}:${s.userId}`;
    if (!days.has(key)) days.set(key, { date: s.date, userId: s.userId, stops: [] });
    days.get(key).stops.push(s);
  }
  return [...days.values()];
}

/** Estimated route drive minutes: haversine legs between located stops. */
function estimateDriveMinutes(stops) {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  let km = 0;
  for (let i = 0; i < located.length - 1; i++) {
    km += haversineKm(located[i].lat, located[i].lng, located[i + 1].lat, located[i + 1].lng);
  }
  return kmToMinutes(km);
}

/** Cheapest-insertion detour (minutes) for a new point into an ordered stop list. */
function cheapestInsertionMinutes(stops, lat, lng) {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  if (located.length === 0) return null;
  if (located.length === 1) {
    return kmToMinutes(2 * haversineKm(located[0].lat, located[0].lng, lat, lng));
  }
  let best = Infinity;
  for (let i = 0; i < located.length - 1; i++) {
    const a = located[i];
    const b = located[i + 1];
    const detourKm =
      haversineKm(a.lat, a.lng, lat, lng) +
      haversineKm(lat, lng, b.lat, b.lng) -
      haversineKm(a.lat, a.lng, b.lat, b.lng);
    if (detourKm < best) best = detourKm;
  }
  // Also consider prepend/append (before first / after last stop).
  const first = located[0];
  const last = located[located.length - 1];
  best = Math.min(
    best,
    haversineKm(first.lat, first.lng, lat, lng),
    haversineKm(last.lat, last.lng, lat, lng)
  );
  return kmToMinutes(Math.max(0, best));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Ranked route-day suggestions near a location.
 * opts: { lat, lng, from, to, radiusKm=15, limit=10, sort='closest'|'soonest' }
 */
async function nearestRoutes(companyId, opts) {
  const {
    lat, lng, from, to,
    radiusKm = 15,
    limit = 10,
    sort = 'closest',
  } = opts;

  const [stops, userNames, savedTotals] = await Promise.all([
    getStopsSnapshot(companyId, from, to),
    getCompanyUsers(companyId),
    getSavedRouteTotals(companyId, from, to),
  ]);

  const routeDays = groupRouteDays(stops);
  const candidates = [];
  for (const day of routeDays) {
    // Only real routes: at least one located active stop (cancelled/deleted already excluded).
    const located = day.stops.filter((s) => s.lat != null && s.lng != null);
    if (located.length === 0) continue;
    let nearestKm = Infinity;
    for (const s of located) {
      const d = haversineKm(s.lat, s.lng, lat, lng);
      if (d < nearestKm) nearestKm = d;
    }
    if (nearestKm > radiusKm) continue;

    const detour = cheapestInsertionMinutes(day.stops, lat, lng);
    const saved = savedTotals.get(`${day.userId}:${day.date}`);
    const jobMinutes = day.stops.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const driveMinutes = saved && saved.total_minutes != null
      ? Number(saved.total_minutes)
      : Math.round(estimateDriveMinutes(day.stops));
    candidates.push({
      date: day.date,
      user_id: day.userId,
      user_name: userNames.get(day.userId) || `User ${day.userId}`,
      stop_count: day.stops.length,
      nearest_km: Math.round(nearestKm * 10) / 10,
      current_drive_minutes: driveMinutes,
      current_job_minutes: saved && saved.total_job_minutes != null
        ? Number(saved.total_job_minutes)
        : jobMinutes,
      // Pure added drive time for this stop — no assumed job/service duration baked in.
      added_minutes: detour != null ? Math.round(detour) : null,
      has_saved_route: !!saved,
    });
  }

  candidates.sort((a, b) => {
    if (sort === 'soonest') {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.nearest_km - b.nearest_km;
    }
    if (a.nearest_km !== b.nearest_km) return a.nearest_km - b.nearest_km;
    return a.date < b.date ? -1 : 1;
  });

  return candidates.slice(0, limit);
}

/** Clients within radiusKm of a location (requires cached client coords). */
async function nearestClients(companyId, { lat, lng, radiusKm = 10, limit = 20 }) {
  // Bounding box pre-filter keeps the haversine expression cheap.
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  const res = await pool.query(
    `SELECT id, name, last_name, address, zip_code, city, lat, lng, client_type,
       (6371 * 2 * asin(sqrt(
         power(sin(radians(lat - $2) / 2), 2) +
         cos(radians($2)) * cos(radians(lat)) *
         power(sin(radians(lng - $3) / 2), 2)
       ))) AS distance_km
     FROM clients
     WHERE company_id = $1
       AND deleted_at IS NULL
       AND lat IS NOT NULL AND lng IS NOT NULL
       AND lat BETWEEN $2 - $4 AND $2 + $4
       AND lng BETWEEN $3 - $5 AND $3 + $5
     ORDER BY distance_km ASC
     LIMIT $6`,
    [companyId, lat, lng, latDelta, lngDelta, limit]
  );
  return res.rows
    .filter((r) => Number(r.distance_km) <= radiusKm)
    .map((r) => ({
      id: r.id,
      name: `${r.name || ''}${r.last_name ? ' ' + r.last_name : ''}`.trim(),
      address: [r.address, r.zip_code, r.city].filter(Boolean).join(', '),
      lat: num(r.lat),
      lng: num(r.lng),
      distance_km: Math.round(Number(r.distance_km) * 10) / 10,
      client_type: r.client_type === 'company' ? 'company' : 'person',
    }));
}

/** All route memberships (real + projected + cancelled) for one client in [from,to]. */
async function clientRoutes(companyId, clientId, from, to) {
  const [stops, userNames, cancelledRes] = await Promise.all([
    getStopsSnapshot(companyId, from, to),
    getCompanyUsers(companyId),
    pool.query(
      `SELECT
         j.id,
         j.scheduled_date AS date,
         j.assigned_user_id,
         j.scheduled_time_from,
         j.scheduled_time_to,
         COALESCE(d.mins, 0) AS duration_minutes
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) AS mins
         FROM job_services js
         LEFT JOIN services s ON s.id = js.service_id
         WHERE js.job_id = j.id
       ) d ON true
       WHERE j.company_id = $1
         AND j.client_id = $2
         AND j.scheduled_date BETWEEN $3 AND $4
         AND j.status = 'cancelled'`,
      [companyId, clientId, from, to]
    ),
  ]);

  const rows = stops
    .filter((s) => s.clientId === Number(clientId))
    .map((s) => ({
      job_id: s.id,
      date: String(s.date).slice(0, 10),
      user_id: s.userId,
      user_name: s.userId != null ? (userNames.get(s.userId) || `User ${s.userId}`) : null,
      time_from: s.timeFrom,
      time_to: s.timeTo,
      is_projected: s.isProjected,
      duration_minutes: s.durationMinutes,
      status: s.status || 'scheduled',
    }))

  for (const r of cancelledRes.rows) {
    rows.push({
      job_id: r.id,
      date: String(r.date).slice(0, 10),
      user_id: r.assigned_user_id != null ? Number(r.assigned_user_id) : null,
      user_name: r.assigned_user_id != null
        ? (userNames.get(Number(r.assigned_user_id)) || `User ${r.assigned_user_id}`)
        : null,
      time_from: r.scheduled_time_from,
      time_to: r.scheduled_time_to,
      is_projected: false,
      duration_minutes: Number(r.duration_minutes) || 0,
      status: 'cancelled',
    })
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}

/** Per-day summaries for one employee in [from,to]. */
async function employeeDays(companyId, userId, from, to) {
  const [stops, savedTotals] = await Promise.all([
    getStopsSnapshot(companyId, from, to),
    getSavedRouteTotals(companyId, from, to),
  ]);
  const byDate = new Map();
  for (const s of stops) {
    if (s.userId !== Number(userId)) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }
  const days = [];
  for (const [date, dayStops] of byDate) {
    const saved = savedTotals.get(`${Number(userId)}:${date}`);
    days.push({
      date,
      stop_count: dayStops.length,
      projected_count: dayStops.filter((s) => s.isProjected).length,
      job_minutes: saved && saved.total_job_minutes != null
        ? Number(saved.total_job_minutes)
        : dayStops.reduce((sum, s) => sum + (s.durationMinutes || 0), 0),
      drive_minutes: saved && saved.total_minutes != null
        ? Number(saved.total_minutes)
        : Math.round(estimateDriveMinutes(dayStops)),
      has_saved_route: !!saved,
    });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return days;
}

module.exports = {
  nearestRoutes,
  nearestClients,
  clientRoutes,
  employeeDays,
  invalidateCompany,
  // exported for tests
  haversineKm,
  cheapestInsertionMinutes,
};
