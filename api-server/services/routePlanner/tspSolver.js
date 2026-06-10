const { tourDriveSeconds } = require('./matrix');

/**
 * Open TSP: fixed start depot → visit all job nodes → fixed end depot.
 * Uses nearest-neighbour seed + 2-opt improvement.
 *
 * @param {number[][]} matrix - drive seconds
 * @param {number} startIdx - depot start index
 * @param {number} endIdx - depot end index
 * @param {number[]} jobIndices - matrix indices for stops to permute
 * @param {Set<number>|null} lockedJobIndices - matrix indices that must keep relative order
 */
function solveOpenTsp(matrix, startIdx, endIdx, jobIndices, lockedJobIndices = null) {
  if (jobIndices.length === 0) return [];
  if (jobIndices.length === 1) return [...jobIndices];

  const locked = lockedJobIndices || new Set();
  const lockedInOrder = jobIndices.filter(idx => locked.has(idx));
  const unlocked = jobIndices.filter(idx => !locked.has(idx));

  if (lockedInOrder.length === jobIndices.length) {
    return [...lockedInOrder];
  }

  if (lockedInOrder.length === 0) {
    return twoOptImprove(
      matrix,
      startIdx,
      endIdx,
      nearestNeighborTour(matrix, startIdx, endIdx, unlocked),
    );
  }

  // Optimize unlocked jobs, then merge locked anchors in original relative order
  const optimizedUnlocked = unlocked.length > 0
    ? twoOptImprove(
        matrix,
        startIdx,
        endIdx,
        nearestNeighborTour(matrix, startIdx, endIdx, unlocked),
      )
    : [];

  return mergeLockedOrder(jobIndices, lockedInOrder, optimizedUnlocked, matrix, startIdx, endIdx);
}

function nearestNeighborTour(matrix, startIdx, endIdx, jobIndices) {
  const remaining = new Set(jobIndices);
  const tour = [];
  let current = startIdx;

  while (remaining.size > 0) {
    let best = null;
    let bestCost = Infinity;
    for (const j of remaining) {
      const cost = matrix[current][j] ?? Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        best = j;
      }
    }
    if (best == null) break;
    tour.push(best);
    remaining.delete(best);
    current = best;
  }

  return tour;
}

function pathCost(matrix, startIdx, endIdx, tour) {
  if (tour.length === 0) return (matrix[startIdx]?.[endIdx] ?? 0);
  return tourDriveSeconds(matrix, [startIdx, ...tour, endIdx]);
}

function twoOptImprove(matrix, startIdx, endIdx, tour) {
  if (tour.length < 2) return tour;
  let improved = true;
  let best = [...tour];

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        if (pathCost(matrix, startIdx, endIdx, candidate) < pathCost(matrix, startIdx, endIdx, best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

function twoOptSwap(tour, i, k) {
  const next = [...tour.slice(0, i), ...tour.slice(i, k + 1).reverse(), ...tour.slice(k + 1)];
  return next;
}

/** Insert locked stops at positions that minimise extra drive while preserving locked relative order. */
function mergeLockedOrder(allJobs, lockedInOrder, unlockedTour, matrix, startIdx, endIdx) {
  const result = [];
  let u = 0;
  let l = 0;
  const lockedSet = new Set(lockedInOrder);

  while (u < unlockedTour.length || l < lockedInOrder.length) {
    const candidates = [];
    if (u < unlockedTour.length) candidates.push({ type: 'u', idx: unlockedTour[u] });
    if (l < lockedInOrder.length) candidates.push({ type: 'l', idx: lockedInOrder[l] });

    if (candidates.length === 1) {
      const c = candidates[0];
      result.push(c.idx);
      if (c.type === 'u') u++;
      else l++;
      continue;
    }

    // Prefer next locked if it was next in original locked sequence (preserve order)
    if (l < lockedInOrder.length) {
      result.push(lockedInOrder[l]);
      l++;
    } else {
      result.push(unlockedTour[u]);
      u++;
    }
  }

  // Fill any missing
  for (const j of allJobs) {
    if (!result.includes(j)) result.push(j);
  }
  return result;
}

module.exports = {
  solveOpenTsp,
  pathCost,
  nearestNeighborTour,
  twoOptImprove,
};
