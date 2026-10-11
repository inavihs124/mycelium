/**
 * engine.test.mjs - Node --test suite for the pure-JS engine
 *
 * Run: node --test dev/tests/engine/engine.test.mjs
 *
 * Tests:
 *  1. Bond exactness (closed form matches spec)
 *  2. Disjoint bonds commute (order doesn't matter)
 *  3. Adjacent bonds don't commute (order matters)
 *  4. First-order Trotter error scaling (~-1 slope)
 *  5. Second-order Trotter error scaling (~-2 slope)
 *  6. Second-order reduces error vs first-order
 *  7. Noise: trace preserved, real diagonal
 *  8. Entropy: 0 for product state, 1 bit for Bell pair
 *  9. Codec round-trip
 * 10. Golden file comparison (< 1e-10)
 * 11. Unitarity of bond operator
 * 12. Ghost vs golden (< 1e-10)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

// ── Import engine modules ──────────────────────────────────────────
const { N, DIM, BONDS, DELTA, bondsAdjacent } =
  await import(`file://${repoRoot}/qollab/engine/constants.js`);

const { applyBondOperator, sliceTheta } =
  await import(`file://${repoRoot}/qollab/engine/bond.js`);

const {
  singleFlipState, neelState, fidelity, stateError, norm2, copyState,
  computeP1, populations,
} = await import(`file://${repoRoot}/qollab/engine/state.js`);

const { exactEvolution } =
  await import(`file://${repoRoot}/qollab/engine/ghost.js`);

const {
  executeSchedule, executeScheduleFinal, countCost, countDepth,
  firstOrderSchedule, secondOrderSchedule, expandMacros,
} = await import(`file://${repoRoot}/qollab/engine/schedule.js`);

const { computeScores } =
  await import(`file://${repoRoot}/qollab/engine/score.js`);

const {
  pureStateToDensity, applyDephasing, densityTrace,
  densityFidelity, densityReducedDM1,
} = await import(`file://${repoRoot}/qollab/engine/density.js`);

const { cutEntropy, allCutEntropies } =
  await import(`file://${repoRoot}/qollab/engine/entropy.js`);

const { encodeSchedule, decodeSchedule, verifyRoundTrip } =
  await import(`file://${repoRoot}/qollab/engine/codec.js`);

const { createRNG } =
  await import(`file://${repoRoot}/qollab/engine/rng.js`);

// ── Helpers ────────────────────────────────────────────────────────
function maxDiff(a, b) {
  let max = 0;
  for (let i = 0; i < a.re.length; i++) {
    const dr = Math.abs(a.re[i] - b.re[i]);
    const di = Math.abs(a.im[i] - b.im[i]);
    if (dr > max) max = dr;
    if (di > max) max = di;
  }
  return max;
}

function applyBond(state, bi, theta) {
  const [qi, qj] = BONDS[bi];
  const s = copyState(state);
  applyBondOperator(s.re, s.im, qi, qj, theta);
  return s;
}

// ── Tests ──────────────────────────────────────────────────────────

test('1. Bond operator is unitary (preserves norm)', () => {
  const psi = singleFlipState(3);
  for (let bi = 0; bi < BONDS.length; bi++) {
    const [qi, qj, J] = BONDS[bi];
    const theta = 0.37;
    const psi2 = applyBond(psi, bi, theta);
    const n = norm2(psi2);
    assert.ok(Math.abs(n - 1) < 1e-12,
      `Bond ${bi}: norm after operator = ${n}, expected 1`);
  }
});

test('2. Bond exactness: closed form matches expm (via golden data)', async () => {
  // Load goldens
  const { GOLDENS } = await import(`file://${repoRoot}/qollab/data/goldens.js`);
  const bondGoldens = GOLDENS.filter(g => g.type === 'bond_exact');
  assert.ok(bondGoldens.length > 0, 'No bond_exact goldens found');

  for (const g of bondGoldens) {
    const bi = g.bondIndex;
    const [qi, qj, J] = BONDS[bi];
    const psi0 = singleFlipState(3);
    const theta = g.theta;
    applyBondOperator(psi0.re, psi0.im, qi, qj, theta);

    const expected = { re: new Float64Array(g.psiOut.re), im: new Float64Array(g.psiOut.im) };
    const diff = maxDiff(psi0, expected);
    assert.ok(diff < 1e-10,
      `Golden ${g.id}: max diff = ${diff}, expected < 1e-10`);
  }
});

test('3. Disjoint bonds commute (order-independent)', () => {
  // Bonds 0 (0-1) and 3 (3-4) share no qubit
  const bi1 = 0, bi2 = 3;
  assert.ok(!bondsAdjacent(bi1, bi2), 'Bonds 0 and 3 should be disjoint');

  const psi = singleFlipState(3);
  const theta1 = 0.3, theta2 = 0.5;

  // Order A: bi1 then bi2
  let sA = copyState(psi);
  applyBondOperator(sA.re, sA.im, ...BONDS[bi1].slice(0,2), theta1);
  applyBondOperator(sA.re, sA.im, ...BONDS[bi2].slice(0,2), theta2);

  // Order B: bi2 then bi1
  let sB = copyState(psi);
  applyBondOperator(sB.re, sB.im, ...BONDS[bi2].slice(0,2), theta2);
  applyBondOperator(sB.re, sB.im, ...BONDS[bi1].slice(0,2), theta1);

  const diff = maxDiff(sA, sB);
  assert.ok(diff < 1e-14,
    `Disjoint bonds (0,3): order should not matter, diff = ${diff}`);
});

test('4. Adjacent bonds do NOT commute (order matters)', () => {
  // Bonds 0 (0-1) and 1 (1-2) share qubit 1
  const bi1 = 0, bi2 = 1;
  assert.ok(bondsAdjacent(bi1, bi2), 'Bonds 0 and 1 should be adjacent');

  const psi = neelState();
  const theta1 = 0.4, theta2 = 0.6;

  let sA = copyState(psi);
  applyBondOperator(sA.re, sA.im, BONDS[bi1][0], BONDS[bi1][1], theta1);
  applyBondOperator(sA.re, sA.im, BONDS[bi2][0], BONDS[bi2][1], theta2);

  let sB = copyState(psi);
  applyBondOperator(sB.re, sB.im, BONDS[bi2][0], BONDS[bi2][1], theta2);
  applyBondOperator(sB.re, sB.im, BONDS[bi1][0], BONDS[bi1][1], theta1);

  const diff = maxDiff(sA, sB);
  assert.ok(diff > 1e-6,
    `Adjacent bonds (0,1): order SHOULD matter, diff = ${diff} (expected > 1e-6)`);
});

test('5. First-order Trotter error slope ≈ -1 (log-log)', () => {
  const T = 1.0;
  const psi0 = singleFlipState(3);
  const psiExact = exactEvolution(psi0, T);
  const order = [0,1,2,3,4,5];

  const stepCounts = [4, 8, 16, 32];
  const errors = [];

  for (const steps of stepCounts) {
    const sched = firstOrderSchedule(order, steps);
    const final = executeScheduleFinal(psi0, sched, T, steps);
    errors.push(stateError(final, psiExact));
  }

  // Log-log slope between last two points
  const slope = Math.log(errors[3]/errors[2]) / Math.log(32/16);
  assert.ok(Math.abs(slope - (-1.0)) < 0.15,
    `1st order slope = ${slope.toFixed(3)}, expected ≈ -1.0`);
});

test('6. Second-order Trotter error slope ≈ -2 (log-log)', () => {
  const T = 1.0;
  const psi0 = singleFlipState(3);
  const psiExact = exactEvolution(psi0, T);
  const order = [0,1,2,3,4,5];

  const stepCounts = [4, 8, 16, 32];
  const errors = [];

  for (const steps of stepCounts) {
    const sched = secondOrderSchedule(order, steps);
    const final = executeScheduleFinal(psi0, sched, T, steps);
    errors.push(stateError(final, psiExact));
  }

  const slope = Math.log(errors[3]/errors[2]) / Math.log(32/16);
  assert.ok(Math.abs(slope - (-2.0)) < 0.2,
    `2nd order slope = ${slope.toFixed(3)}, expected ≈ -2.0`);
});

test('7. Second-order reduces error vs first-order (8 steps, T=1)', () => {
  const T = 1.0, steps = 8;
  const psi0 = singleFlipState(3);
  const psiExact = exactEvolution(psi0, T);
  const order = [0,1,2,3,4,5];

  const err1 = stateError(
    executeScheduleFinal(psi0, firstOrderSchedule(order, steps), T, steps),
    psiExact
  );
  const err2 = stateError(
    executeScheduleFinal(psi0, secondOrderSchedule(order, steps), T, steps),
    psiExact
  );

  assert.ok(err2 < err1,
    `2nd order (${err2.toFixed(4)}) should be less than 1st order (${err1.toFixed(4)})`);
  // Expected: err2 ≈ 0.0317
  assert.ok(Math.abs(err2 - 0.0317) < 0.005,
    `2nd order error at 8 steps = ${err2.toFixed(4)}, expected ≈ 0.0317`);
});

test('8. Ghost matches golden to < 1e-10', async () => {
  const { GOLDENS } = await import(`file://${repoRoot}/qollab/data/goldens.js`);
  const ghostGoldens = GOLDENS.filter(g => g.type === 'ghost');
  assert.ok(ghostGoldens.length > 0, 'No ghost goldens found');

  for (const g of ghostGoldens) {
    const psi0 = g.start.kind === 'single' ? singleFlipState(3) : neelState();
    const psiGhost = exactEvolution(psi0, g.T);
    const expected = { re: new Float64Array(g.psiExact.re), im: new Float64Array(g.psiExact.im) };
    const diff = maxDiff(psiGhost, expected);
    assert.ok(diff < 1e-10,
      `Ghost ${g.id}: max diff = ${diff.toExponential(2)}, expected < 1e-10`);
  }
});

test('9. Trotter goldens match engine to < 1e-10', async () => {
  const { GOLDENS } = await import(`file://${repoRoot}/qollab/data/goldens.js`);
  const trotterGoldens = GOLDENS.filter(g => g.type === 'trotter1' || g.type === 'trotter2');

  for (const g of trotterGoldens) {
    const psi0 = g.start.kind === 'single' ? singleFlipState(3) : neelState();
    const result = executeSchedule(psi0, g.schedule, g.T, g.E);
    const expected = { re: new Float64Array(g.psiOut.re), im: new Float64Array(g.psiOut.im) };
    const diff = maxDiff(result.finalState, expected);
    assert.ok(diff < 1e-10,
      `Golden ${g.id}: max diff = ${diff.toExponential(2)}, expected < 1e-10`);
  }
});

test('10. Noise: dephasing preserves trace', () => {
  const psi = singleFlipState(3);
  const rho = pureStateToDensity(psi);

  const traceBefore = densityTrace(rho);
  assert.ok(Math.abs(traceBefore - 1) < 1e-12,
    `Trace before dephasing = ${traceBefore}`);

  applyDephasing(rho.re, rho.im, 0.1);

  const traceAfter = densityTrace(rho);
  assert.ok(Math.abs(traceAfter - 1) < 1e-12,
    `Trace after dephasing = ${traceAfter}`);
});

test('11. Entropy: 0 bits for product state (single flip)', () => {
  const psi = singleFlipState(3);
  const entropies = allCutEntropies(psi);
  for (const e of entropies) {
    assert.ok(e.entropy < 1e-10,
      `Product state entropy at bond ${e.bondIndex} = ${e.entropy.toExponential(2)}, expected 0`);
  }
});

test('12. Entropy: 1 bit for Bell pair (if available)', () => {
  // Create a Bell state |00⟩ + |11⟩ / √2 on qubits 0 and 1 of a 7-qubit system
  const psi = { re: new Float64Array(DIM), im: new Float64Array(DIM) };
  // |0000000⟩ (index 0) and |1100000⟩ (index = bit6 + bit5 = 64+32 = 96)
  // Actually qubit 0 at bit N-1=6, qubit 1 at bit N-2=5
  psi.re[0] = 1/Math.SQRT2;          // |0000000⟩
  psi.re[(1<<6)|(1<<5)] = 1/Math.SQRT2; // |1100000⟩ (qubits 0 and 1 flipped)

  // Entropy across the 0-1 bond (bond index 0)
  const { entropy, bound } = cutEntropy(psi, 0);
  assert.ok(Math.abs(entropy - 1.0) < 1e-6,
    `Bell pair entropy at bond 0 = ${entropy.toFixed(6)}, expected 1.0`);
});

test('13. Entropy bound never exceeded (neel at T=1)', () => {
  const psi0 = neelState();
  const psiT = exactEvolution(psi0, 1.0);
  const entropies = allCutEntropies(psiT);
  for (const e of entropies) {
    assert.ok(e.entropy <= e.bound + 1e-10,
      `Neel T=1 entropy ${e.entropy.toFixed(4)} exceeds bound ${e.bound} at bond ${e.bondIndex}`);
  }
});

test('14. Codec round-trip', () => {
  // Epoch 2 must exist as a placeholder (macro-linked to epoch 1)
  const schedule = {
    epochs: [
      { layers: [
        { slices: [{ bondIndex: 0, fraction: 0.5 }, { bondIndex: 3, fraction: 1 }] },
        { slices: [{ bondIndex: 1, fraction: 0.25 }] },
      ]},
      { layers: [
        { slices: [{ bondIndex: 2, fraction: 0.125 }] },
      ]},
      { layers: [] }, // placeholder for macro-linked epoch 2
    ],
    macroLinks: { 2: 1 }, // epoch 2 is a copy of epoch 1
  };
  
  const ok = verifyRoundTrip('1-1', schedule);
  assert.ok(ok, 'Codec round-trip failed');
});

test('15. Codec: invalid checksum detected', () => {
  const schedule = {
    epochs: [{ layers: [{ slices: [{ bondIndex: 0, fraction: 1 }] }] }],
  };
  const code = encodeSchedule('test', schedule);
  // Corrupt the last 2 chars (checksum)
  const corrupted = code.slice(0, -2) + 'xx';
  const result = decodeSchedule(corrupted);
  assert.ok(result.error, `Should have reported error but got: ${JSON.stringify(result)}`);
});

test('16. Cost and Depth counting with macros', () => {
  const schedule = {
    epochs: [
      { layers: [
        { slices: [{ bondIndex: 0, fraction: 1 }] },
        { slices: [{ bondIndex: 1, fraction: 1 }] },
      ]},
    ],
    macroLinks: { 1: 0, 2: 0 }, // epochs 1 and 2 are copies of epoch 0
  };
  // We need to fill in the actual epoch placeholders
  schedule.epochs.push({ layers: [] });
  schedule.epochs.push({ layers: [] });

  const cost = countCost(schedule);   // Only epoch 0 counted: 2 slices
  const depth = countDepth(schedule); // 3 epochs × 2 layers = 6

  assert.equal(cost, 2, `Cost = ${cost}, expected 2`);
  assert.equal(depth, 6, `Depth = ${depth}, expected 6`);
});

test('17. P1 values: single flip at site 3 has P1[3]=1, rest=0', () => {
  const psi = singleFlipState(3);
  const p1 = computeP1(psi);
  for (let q = 0; q < N; q++) {
    const expected = q === 3 ? 1 : 0;
    assert.ok(Math.abs(p1[q] - expected) < 1e-12,
      `P1[${q}] = ${p1[q]}, expected ${expected}`);
  }
});

test('18. Neel state P1: nodes 1,4,5 have P1=1, rest=0', () => {
  const psi = neelState();
  const p1 = computeP1(psi);
  const flipped = new Set([1, 4, 5]);
  for (let q = 0; q < N; q++) {
    const expected = flipped.has(q) ? 1 : 0;
    assert.ok(Math.abs(p1[q] - expected) < 1e-12,
      `Neel P1[${q}] = ${p1[q]}, expected ${expected}`);
  }
});
