const { mean, sd, median, rank, spearman, partialSpearman, thirdsCutoffs } = require('../src/stats');

describe('descriptive statistics', () => {
  test('mean, sample SD and median leave missing values out', () => {
    expect(mean([2, 4, null, 6])).toBe(4);
    expect(sd([2, 4, 6])).toBe(2);
    expect(median([5, 1, 3, undefined])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('ranks', () => {
  test('tied values share the average of their ranks', () => {
    expect(rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
});

describe('Spearman correlation', () => {
  test('is 1 for any rising relationship, straight or not', () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]).rho).toBeCloseTo(1);
  });

  test('is -1 for any falling relationship', () => {
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]).rho).toBeCloseTo(-1);
  });

  test('matches a worked example', () => {
    // Ranks 1..5 against 2,1,4,3,5: d = (-1, 1, -1, 1, 0), sum d^2 = 4,
    // rho = 1 - 6*4 / (5*24) = 0.8.
    expect(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]).rho).toBeCloseTo(0.8);
  });

  test('drops pairs with a missing value and reports how many were used', () => {
    const result = spearman([1, 2, 3, 4, null], [1, 2, 3, null, 5]);
    expect(result.n).toBe(3);
    expect(result.rho).toBeCloseTo(1);
  });
});

describe('partial Spearman correlation', () => {
  // Reference values computed independently with SciPy (scipy.stats.spearmanr),
  // including ties, and the first-order partial correlation formula.
  const x = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
  const y = [2, 7, 1, 8, 2, 8, 1, 8, 2, 8];
  const z = [1, 4, 1, 4, 2, 1, 3, 5, 6, 2];

  test('Spearman matches SciPy on data with ties', () => {
    expect(spearman(x, y).rho).toBeCloseTo(0.1347, 4);
  });

  test('partial correlation matches SciPy with the third measure held constant', () => {
    expect(partialSpearman(x, y, z).rho).toBeCloseTo(0.1683, 4);
  });
});

describe('thirds', () => {
  test('cut-offs split the values into three groups of similar size', () => {
    const { low, high } = thirdsCutoffs([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(low).toBe(4);
    expect(high).toBe(7);
  });
});
