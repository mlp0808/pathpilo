const { solveOpenTsp, pathCost } = require('../tspSolver');

describe('tspSolver', () => {
  const matrix = [
    [0, 600, 400, 500],
    [600, 0, 200, 300],
    [400, 200, 0, 100],
    [500, 300, 100, 0],
  ];

  test('optimizes three-stop open tour from depot', () => {
    const tour = solveOpenTsp(matrix, 0, 3, [1, 2]);
    expect(tour).toHaveLength(2);
    expect(new Set(tour)).toEqual(new Set([1, 2]));
    const cost = pathCost(matrix, 0, 3, tour);
    expect(cost).toBeLessThanOrEqual(pathCost(matrix, 0, 3, [1, 2]));
    expect(cost).toBeLessThanOrEqual(pathCost(matrix, 0, 3, [2, 1]));
  });

  test('respects locked stop order', () => {
    const tour = solveOpenTsp(matrix, 0, 3, [1, 2], new Set([1]));
    expect(tour.indexOf(1)).toBeLessThan(tour.indexOf(2));
  });

  test('returns single job unchanged', () => {
    expect(solveOpenTsp(matrix, 0, 3, [2])).toEqual([2]);
  });
});
