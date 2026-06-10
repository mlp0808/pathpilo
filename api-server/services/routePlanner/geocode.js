const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  '';

async function mapboxGeocode(address, countryCode) {
  if (!address?.trim() || !MAPBOX_TOKEN) return null;
  try {
    const cc = String(countryCode || '').trim().toLowerCase();
    const countryParam = cc.length === 2 ? `&country=${encodeURIComponent(cc)}` : '';
    const encoded = encodeURIComponent(address.trim());
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
      `?limit=1&access_token=${MAPBOX_TOKEN}${countryParam}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const body = await r.json();
    const coords = body?.features?.[0]?.geometry?.coordinates;
    if (coords?.length === 2) return { lat: coords[1], lng: coords[0] };
  } catch (e) {
    console.warn('[routePlanner] geocode failed', e?.message || e);
  }
  return null;
}

function coordOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveJobCoords(job) {
  const lat = coordOrNull(job.lat) ?? coordOrNull(job.client_lat);
  const lng = coordOrNull(job.lng) ?? coordOrNull(job.client_lng);
  return lat != null && lng != null ? { lat, lng } : null;
}

async function ensureJobCoords(job, countryCode) {
  const existing = resolveJobCoords(job);
  if (existing) return { ...existing, geocoded: false };

  const street = (job.address || '').trim();
  const locality = [job.zip_code, job.city].filter(Boolean).join(' ').trim();
  const query = [street, locality].filter(Boolean).join(', ');
  if (!query) return null;

  const geo = await mapboxGeocode(query, countryCode);
  if (!geo) return null;
  return { ...geo, geocoded: true };
}

module.exports = {
  MAPBOX_TOKEN,
  mapboxGeocode,
  coordOrNull,
  resolveJobCoords,
  ensureJobCoords,
};
