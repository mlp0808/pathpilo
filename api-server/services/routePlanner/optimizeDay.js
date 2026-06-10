const { MAPBOX_TOKEN } = require('./geocode');
const { buildDriveMatrix, tourDriveSeconds } = require('./matrix');
const { solveOpenTsp, pathCost } = require('./tspSolver');
const {
  loadDayJobs,
  hydrateJobCoordinates,
  loadDepotForUser,
  loadCompanyCountry,
} = require('./loadDayData');

async function fetchRouteGeometry(orderedCoords) {
  if (!MAPBOX_TOKEN || orderedCoords.length < 2) return null;
  const slice = orderedCoords.slice(0, 25);
  const coordStr = slice.map(c => `${c.lng},${c.lat}`).join(';');
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
      `?geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const route = data.routes?.[0];
    if (!route) return null;
    return {
      totalDriveMinutes: Math.round((route.duration / 60) * 10) / 10,
      totalKm: Math.round((route.distance / 1000) * 10) / 10,
      routeGeometry: route.geometry,
      legMinutes: (route.legs || []).map(leg => Math.round((leg.duration / 60) * 10) / 10),
    };
  } catch (e) {
    console.warn('[routePlanner] directions failed', e?.message || e);
    return null;
  }
}

function buildCurrentTourIndices(routableJobs, startIdx, endIdx, matrix) {
  const jobIndexById = new Map(routableJobs.map((j, i) => [j.id, i + 1]));
  const tour = routableJobs
    .map(j => jobIndexById.get(j.id))
    .filter(idx => idx != null);
  return { tour, driveSeconds: pathCost(matrix, startIdx, endIdx, tour) };
}

/**
 * @param {object} opts
 * @param {number} opts.companyId
 * @param {number} opts.userId
 * @param {string} opts.date - YYYY-MM-DD
 * @param {number[]|null} opts.jobIds
 * @param {number[]|null} opts.lockedJobIds
 */
async function optimizeDay(opts) {
  const { companyId, userId, date, jobIds = null, lockedJobIds = null } = opts;
  const notes = [];

  const countryCode = await loadCompanyCountry(companyId);
  const rawJobs = await loadDayJobs(companyId, userId, date, jobIds);
  if (rawJobs.length === 0) {
    return { ok: false, error: 'No jobs found for this day and employee' };
  }

  const { jobs, notes: geoNotes } = await hydrateJobCoordinates(rawJobs, countryCode);
  notes.push(...geoNotes);

  const routable = jobs.filter(j => j.routable);
  const skipped = jobs.filter(j => !j.routable);

  if (routable.length === 0) {
    return {
      ok: false,
      error: 'No jobs with coordinates — geocode addresses first',
      notes,
    };
  }

  const depot = await loadDepotForUser(companyId, userId, date);
  const coords = [];
  let startIdx = 0;
  let endIdx;

  if (depot.start) {
    coords.push({ lat: depot.start.lat, lng: depot.start.lng, kind: 'start' });
  }

  for (const job of routable) {
    coords.push({ lat: job.lat, lng: job.lng, kind: 'job', jobId: job.id });
  }

  if (depot.end) {
    coords.push({
      lat: depot.end.lat,
      lng: depot.end.lng,
      kind: 'end',
    });
    endIdx = coords.length - 1;
  } else if (depot.start) {
    endIdx = 0;
  } else {
    startIdx = 0;
    endIdx = 0;
    notes.push('No home start/end configured — optimizing stops only');
  }

  const matrix = await buildDriveMatrix(coords);
  const jobMatrixIndices = routable.map((_, i) => (depot.start ? i + 1 : i));

  const lockedSet = new Set(
    (lockedJobIds || [])
      .map(Number)
      .filter(id => routable.some(j => j.id === id))
      .map(id => {
        const idx = routable.findIndex(j => j.id === id);
        return depot.start ? idx + 1 : idx;
      }),
  );

  const current = buildCurrentTourIndices(routable, startIdx, endIdx, matrix);

  const optimizedTour = solveOpenTsp(
    matrix,
    startIdx,
    endIdx,
    jobMatrixIndices,
    lockedSet.size > 0 ? lockedSet : null,
  );

  const optimizedDriveSeconds = pathCost(matrix, startIdx, endIdx, optimizedTour);
  const optimizedJobs = optimizedTour.map(matrixIdx => {
    const coordIdx = matrixIdx - (depot.start ? 1 : 0);
    return routable[coordIdx];
  });

  const orderedJobIds = [
    ...optimizedJobs.map(j => j.id),
    ...skipped.map(j => j.id),
  ];

  const orderedCoords = [];
  if (depot.start) orderedCoords.push(depot.start);
  for (const j of optimizedJobs) orderedCoords.push({ lat: j.lat, lng: j.lng });
  if (depot.end && depot.end !== depot.start) orderedCoords.push(depot.end);
  else if (depot.end && orderedCoords.length > 0) {
    const last = orderedCoords[orderedCoords.length - 1];
    if (last.lat !== depot.end.lat || last.lng !== depot.end.lng) {
      orderedCoords.push(depot.end);
    }
  }

  const directions = await fetchRouteGeometry(orderedCoords);
  const totalJobMinutes = optimizedJobs.reduce((s, j) => s + (j.serviceMinutes || 0), 0);

  const legMinutes = [];
  if (directions?.legMinutes) {
    const jobLegs = directions.legMinutes.slice(
      depot.start ? 1 : 0,
      depot.start ? 1 + optimizedJobs.length : optimizedJobs.length,
    );
    legMinutes.push(...jobLegs);
  }

  return {
    ok: true,
    userId,
    date,
    orderedJobIds,
    legMinutes,
    totalDriveMinutes: directions?.totalDriveMinutes ?? Math.round(optimizedDriveSeconds / 60),
    totalKm: directions?.totalKm ?? null,
    totalJobMinutes,
    routeGeometry: directions?.routeGeometry ?? null,
    comparison: {
      previousDriveMinutes: Math.round(current.driveSeconds / 60),
      optimizedDriveMinutes: directions?.totalDriveMinutes ?? Math.round(optimizedDriveSeconds / 60),
      savedMinutes: Math.max(
        0,
        Math.round(current.driveSeconds / 60) -
          (directions?.totalDriveMinutes ?? Math.round(optimizedDriveSeconds / 60)),
      ),
    },
    depot: depot.start
      ? { startAddress: depot.startAddress, endAddress: depot.endAddress }
      : null,
    notes,
    skippedJobIds: skipped.map(j => j.id),
  };
}

module.exports = {
  optimizeDay,
  fetchRouteGeometry,
};
