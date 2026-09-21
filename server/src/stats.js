// Descriptive statistics for the report. Everything here is written out rather
// than taken from a library, so each figure in Chapter 4 can be traced to a few
// lines of code.

function present(values) {
  return values.filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
}

function mean(values) {
  const v = present(values);
  return v.length ? v.reduce((sum, x) => sum + x, 0) / v.length : null;
}

// Sample standard deviation (n - 1).
function sd(values) {
  const v = present(values);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((sum, x) => sum + (x - m) ** 2, 0) / (v.length - 1));
}

function median(values) {
  const v = present(values).sort((a, b) => a - b);
  if (!v.length) return null;
  const middle = Math.floor(v.length / 2);
  return v.length % 2 ? v[middle] : (v[middle - 1] + v[middle]) / 2;
}

// Ranks from 1, with tied values sharing the average of the ranks they span.
function rank(values) {
  const order = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) ranks[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return ranks;
}

function pearson(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// Spearman's rank correlation: Pearson's correlation of the ranks, which is
// the form that stays correct when there are ties. Pairs with a missing value
// are left out, and the number of pairs used is returned with the coefficient.
function spearman(x, y) {
  const pairs = x.map((value, i) => [value, y[i]])
    .filter(([a, b]) => present([a]).length && present([b]).length);
  if (pairs.length < 3) return { rho: null, n: pairs.length };
  return {
    rho: pearson(rank(pairs.map((p) => p[0])), rank(pairs.map((p) => p[1]))),
    n: pairs.length,
  };
}

// First-order partial rank correlation of x and y with z held constant: the
// usual partial correlation formula applied to the three Spearman
// coefficients. Only days with all three values are used.
function partialSpearman(x, y, z) {
  const rows = x.map((value, i) => [value, y[i], z[i]])
    .filter((row) => present(row).length === 3);
  if (rows.length < 4) return { rho: null, n: rows.length };
  const [a, b, c] = [0, 1, 2].map((k) => rows.map((row) => row[k]));
  const rxy = spearman(a, b).rho;
  const rxz = spearman(a, c).rho;
  const ryz = spearman(b, c).rho;
  return {
    rho: (rxy - rxz * ryz) / Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2)),
    n: rows.length,
  };
}

// Cut-offs that split a set of values into thirds of roughly equal size.
function thirdsCutoffs(values) {
  const v = present(values).sort((a, b) => a - b);
  return {
    low: v[Math.floor(v.length / 3)],
    high: v[Math.floor((2 * v.length) / 3)],
  };
}

module.exports = { mean, sd, median, rank, pearson, spearman, partialSpearman, thirdsCutoffs };
