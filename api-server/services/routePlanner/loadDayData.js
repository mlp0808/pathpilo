const { pool } = require('../../utils/database');
const { ensureJobCoords, mapboxGeocode } = require('./geocode');

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function weekdayIndexFromDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return (d.getDay() + 6) % 7; // Mon=0
}

async function loadCompanyCountry(companyId) {
  const r = await pool.query(
    'SELECT country_code FROM companies WHERE id = $1 LIMIT 1',
    [companyId],
  );
  return r.rows[0]?.country_code || 'DK';
}

async function loadDepotForUser(companyId, userId, dateStr) {
  const dayIdx = weekdayIndexFromDate(dateStr);
  const dayName = DAY_NAMES[dayIdx];

  const companyRes = await pool.query(
    `SELECT default_start_address, default_end_address FROM companies WHERE id = $1`,
    [companyId],
  );
  const company = companyRes.rows[0] || {};
  const defaultStart = (company.default_start_address || '').trim();
  const defaultEnd = (company.default_end_address || defaultStart).trim();

  let startAddr = defaultStart;
  let endAddr = defaultEnd;

  try {
    const whRes = await pool.query(
      `SELECT start_address, end_address, use_company_default_location
       FROM user_company_work_hours
       WHERE company_id = $1 AND user_id = $2
       LIMIT 1`,
      [companyId, userId],
    );
    if (whRes.rows.length > 0) {
      const wh = whRes.rows[0];
      const useDefault = wh.use_company_default_location !== false;
      if (!useDefault) {
        startAddr = (wh.start_address || '').trim();
        endAddr = (wh.end_address || wh.start_address || '').trim();
        if (!endAddr && startAddr) endAddr = startAddr;
      }
    }
  } catch {
    /* table may not exist in older DBs */
  }

  if (!startAddr) return { start: null, end: null };

  const countryCode = await loadCompanyCountry(companyId);
  const startGeo = await mapboxGeocode(startAddr, countryCode);
  const endGeo =
    endAddr && endAddr !== startAddr
      ? await mapboxGeocode(endAddr, countryCode)
      : startGeo;

  return {
    start: startGeo,
    end: endGeo || startGeo,
    startAddress: startAddr,
    endAddress: endAddr || startAddr,
  };
}

async function loadDayJobs(companyId, userId, dateStr, jobIdsFilter = null) {
  const params = [companyId, userId, dateStr];
  let jobIdClause = '';
  if (Array.isArray(jobIdsFilter) && jobIdsFilter.length > 0) {
    const ids = jobIdsFilter.map(Number).filter(n => Number.isInteger(n));
    if (ids.length > 0) {
      jobIdClause = ` AND j.id = ANY($4::int[])`;
      params.push(ids);
    }
  }

  const q = `
    SELECT
      j.id,
      j.scheduled_date,
      j.scheduled_time_from,
      j.scheduled_time_to,
      j.status,
      j.route_order,
      j.sort_order,
      j.lat,
      j.lng,
      j.scheduling_flexibility,
      j.allowed_weekdays,
      c.address,
      c.zip_code,
      c.city,
      c.lat AS client_lat,
      c.lng AS client_lng,
      COALESCE(js.estimated_duration, 0) AS estimated_duration
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN (
      SELECT job_id,
             SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) AS estimated_duration
      FROM job_services js
      LEFT JOIN services s ON js.service_id = s.id
      GROUP BY job_id
    ) js ON j.id = js.job_id
    WHERE j.company_id = $1
      AND j.assigned_user_id = $2
      AND j.scheduled_date = $3::date
      AND j.status != 'cancelled'
      ${jobIdClause}
    ORDER BY COALESCE(j.route_order, j.sort_order, 999999) ASC, j.id ASC
  `;

  const r = await pool.query(q, params);
  return r.rows;
}

async function hydrateJobCoordinates(jobs, countryCode) {
  const notes = [];
  const hydrated = [];

  for (const job of jobs) {
    const coords = await ensureJobCoords(job, countryCode);
    if (!coords) {
      notes.push(`Job #${job.id} has no coordinates — skipped from optimization`);
      hydrated.push({ ...job, lat: null, lng: null, routable: false });
      continue;
    }
    if (coords.geocoded) {
      notes.push(`Job #${job.id} was geocoded for this optimization`);
    }
    hydrated.push({
      ...job,
      lat: coords.lat,
      lng: coords.lng,
      routable: true,
      serviceMinutes: Math.max(0, Math.round(Number(job.estimated_duration) || 0)),
    });
  }
  return { jobs: hydrated, notes };
}

module.exports = {
  weekdayIndexFromDate,
  loadCompanyCountry,
  loadDepotForUser,
  loadDayJobs,
  hydrateJobCoordinates,
  DAY_NAMES,
};
