const crypto = require('crypto');
const { MAPBOX_TOKEN } = require('./geocode');

/** @type {Map<string, { expires: number, durations: number[][] }>} */
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(coords) {
  const payload = coords.map(c => `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`).join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.durations;
}

function setCached(key, durations) {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, durations });
}

/**
 * Build N×N drive-time matrix (seconds). coords[i] = { lat, lng }
 */
async function buildDriveMatrix(coords, { annotate = 'duration' } = {}) {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [[0]];

  const key = cacheKey(coords);
  const cached = getCached(key);
  if (cached) return cached;

  let durations = null;
  let source = 'mapbox';

  if (MAPBOX_TOKEN && coords.length <= 25) {
    durations = await fetchMapboxMatrix(coords);
  }

  if (!durations) {
    durations = await fetchOsrmTable(coords);
    source = 'osrm';
  }

  if (!durations) {
    durations = haversineFallbackMatrix(coords);
    source = 'haversine';
  }

  setCached(key, durations);
  return durations;
}

async function fetchMapboxMatrix(coords) {
  try {
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}` +
      `?annotations=duration&access_token=${MAPBOX_TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.code !== 'Ok' || !Array.isArray(data.durations)) return null;
    return data.durations.map(row => row.map(v => (v == null ? 1e9 : v)));
  } catch (e) {
    console.warn('[routePlanner] Mapbox matrix failed', e?.message || e);
    return null;
  }
}

async function fetchOsrmTable(coords) {
  try {
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=duration`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.code !== 'Ok' || !Array.isArray(data.durations)) return null;
    return data.durations.map(row => row.map(v => (v == null ? 1e9 : v)));
  } catch (e) {
    console.warn('[routePlanner] OSRM table failed', e?.message || e);
    return null;
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Rough drive seconds from straight-line distance (50 km/h average). */
function haversineFallbackMatrix(coords) {
  const n = coords.length;
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const km = haversineKm(coords[i], coords[j]);
      m[i][j] = Math.round((km / 50) * 3600);
    }
  }
  return m;
}

function tourDriveSeconds(matrix, tour) {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += matrix[tour[i]][tour[i + 1]] || 0;
  }
  return total;
}

module.exports = {
  buildDriveMatrix,
  tourDriveSeconds,
  clearMatrixCache: () => cache.clear(),
};
