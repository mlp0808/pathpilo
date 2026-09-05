/**
 * One-off/maintenance script: geocode clients that are missing lat/lng so the
 * map multitool's radius queries (nearest clients / nearest routes) see every
 * client. Safe to re-run — only touches rows where lat or lng IS NULL.
 *
 * Usage (from api-server/):  node scripts/backfill-client-coords.js
 * Requires MAPBOX_TOKEN (or NEXT_PUBLIC_MAPBOX_TOKEN) in the environment.
 */

require('dotenv').config();
const { pool } = require('../utils/database');
const { mapboxGeocode, MAPBOX_TOKEN } = require('../services/routePlanner/geocode');

const SLEEP_MS = 150; // stay well under Mapbox rate limits

async function main() {
  if (!MAPBOX_TOKEN) {
    console.error('MAPBOX_TOKEN is not set — aborting.');
    process.exit(1);
  }

  const { rows } = await pool.query(`
    SELECT c.id, c.address, c.zip_code, c.city, co.country_code
    FROM clients c
    JOIN companies co ON co.id = c.company_id
    WHERE c.deleted_at IS NULL
      AND (c.lat IS NULL OR c.lng IS NULL)
      AND COALESCE(TRIM(c.address), '') != ''
    ORDER BY c.id
  `);

  console.log(`Found ${rows.length} clients missing coordinates.`);
  let ok = 0;
  let failed = 0;

  for (const client of rows) {
    const query = [client.address, [client.zip_code, client.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
    const geo = await mapboxGeocode(query, client.country_code);
    if (geo) {
      await pool.query('UPDATE clients SET lat = $1, lng = $2 WHERE id = $3', [
        geo.lat, geo.lng, client.id,
      ]);
      ok++;
    } else {
      failed++;
      console.warn(`  no result for client ${client.id}: ${query}`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`Done. Geocoded ${ok}, failed ${failed}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
