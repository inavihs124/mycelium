/**
 * state.js - Statevector creation and measurement for the 7-qubit spin network
 * 
 * Convention: big-endian. Qubit q contributes bit at position (N-1-q) in the
 * basis state index. E.g., |0001000⟩ (site 3 flipped) = index 2^(7-1-3) = 2^3 = 8.
 */

import { N, DIM, BIPARTITE_CLASS_1 } from './constants.js';

/**
 * Create a zero statevector.
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function zeroState() {
  return { re: new Float64Array(DIM), im: new Float64Array(DIM) };
}

/**
 * Create the all-zero basis state |0000000⟩.
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function groundState() {
  const s = zeroState();
  s.re[0] = 1;
  return s;
}

/**
 * Create a single-flip state: one spin flipped at the given site.
 * |000...1...000⟩ with the 1 at position `site`.
 * @param {number} site - Qubit index to flip (0..N-1)
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function singleFlipState(site) {
  const s = zeroState();
  const bit = N - 1 - site;
  s.re[1 << bit] = 1;
  return s;
}

/**
 * Create the Neel state: flip all qubits in the bipartite class of node 1.
 * Flips nodes {1, 4, 5}. Bitstring (q0..q6): 0100110, index 38.
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function neelState() {
  const s = zeroState();
  let idx = 0;
  for (const q of BIPARTITE_CLASS_1) {
    idx |= 1 << (N - 1 - q);
  }
  s.re[idx] = 1;
  return s;
}

/**
 * Create a start state from a level spec.
 * @param {{kind: string, site?: number}} spec
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function createStartState(spec) {
  if (spec.kind === 'single') {
    return singleFlipState(spec.site !== undefined ? spec.site : 3);
  } else if (spec.kind === 'neel') {
    return neelState();
  }
  throw new Error(`Unknown start state kind: ${spec.kind}`);
}

/**
 * Get the basis state index for a start state spec.
 * @param {{kind: string, site?: number}} spec
 * @returns {number}
 */
export function startStateIndex(spec) {
  if (spec.kind === 'single') {
    const site = spec.site !== undefined ? spec.site : 3;
    return 1 << (N - 1 - site);
  } else if (spec.kind === 'neel') {
    let idx = 0;
    for (const q of BIPARTITE_CLASS_1) {
      idx |= 1 << (N - 1 - q);
    }
    return idx;
  }
  throw new Error(`Unknown start state kind: ${spec.kind}`);
}

/**
 * Copy a statevector.
 * @param {{re: Float64Array, im: Float64Array}} s
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function copyState(s) {
  return { re: new Float64Array(s.re), im: new Float64Array(s.im) };
}

/**
 * Compute fidelity F = |⟨a|b⟩|² between two pure states.
 * @param {{re: Float64Array, im: Float64Array}} a
 * @param {{re: Float64Array, im: Float64Array}} b
 * @returns {number}
 */
export function fidelity(a, b) {
  let dotR = 0, dotI = 0;
  for (let i = 0; i < DIM; i++) {
    // ⟨a|b⟩ = Σ conj(a[i]) * b[i]
    dotR += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    dotI += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return dotR * dotR + dotI * dotI;
}

/**
 * Compute error = sqrt(1 - F).
 * @param {{re: Float64Array, im: Float64Array}} a
 * @param {{re: Float64Array, im: Float64Array}} b
 * @returns {number}
 */
export function stateError(a, b) {
  const F = fidelity(a, b);
  return Math.sqrt(Math.max(0, 1 - F));
}

/**
 * Compute squared norm ||ψ||².
 * @param {{re: Float64Array, im: Float64Array}} s
 * @returns {number}
 */
export function norm2(s) {
  let n = 0;
  for (let i = 0; i < DIM; i++) {
    n += s.re[i] * s.re[i] + s.im[i] * s.im[i];
  }
  return n;
}

/**
 * Compute probability of each qubit being |1⟩: P1_q = (1 - ⟨Z_q⟩)/2.
 * @param {{re: Float64Array, im: Float64Array}} s - Pure statevector
 * @returns {Float64Array} P1 for each qubit (length N)
 */
export function computeP1(s) {
  const p1 = new Float64Array(N);
  for (let idx = 0; idx < DIM; idx++) {
    const prob = s.re[idx] * s.re[idx] + s.im[idx] * s.im[idx];
    for (let q = 0; q < N; q++) {
      const bit = N - 1 - q;
      if ((idx >> bit) & 1) {
        p1[q] += prob;
      }
    }
  }
  return p1;
}

/**
 * Compute the reduced density matrix for a single qubit.
 * Returns the 2×2 density matrix as {r00, r01_re, r01_im, r11}.
 * @param {{re: Float64Array, im: Float64Array}} s - Pure statevector
 * @param {number} q - Qubit index
 * @returns {{r00: number, r01_re: number, r01_im: number, r11: number}}
 */
export function reducedDensityMatrix1(s, q) {
  const bit = N - 1 - q;
  const mask = 1 << bit;
  let r00 = 0, r11 = 0, r01_re = 0, r01_im = 0;
  
  for (let base = 0; base < DIM; base++) {
    if (base & mask) continue; // Process only states with qubit q = 0
    
    const i0 = base;         // qubit q = 0
    const i1 = base | mask;  // qubit q = 1
    
    const a0r = s.re[i0], a0i = s.im[i0];
    const a1r = s.re[i1], a1i = s.im[i1];
    
    r00 += a0r * a0r + a0i * a0i;
    r11 += a1r * a1r + a1i * a1i;
    // r01 = Σ_env a(0,env) * conj(a(1,env))
    r01_re += a0r * a1r + a0i * a1i;
    r01_im += a0i * a1r - a0r * a1i;
  }
  
  return { r00, r01_re, r01_im, r11 };
}

/**
 * Compute Bloch vector for a single qubit from its reduced density matrix.
 * (x, y, z) = (2 Re r01, -2 Im r01, r00 - r11)
 * @param {{r00: number, r01_re: number, r01_im: number, r11: number}} rho
 * @returns {{x: number, y: number, z: number, length: number, phase: number, purity: number}}
 */
export function blochVector(rho) {
  const x = 2 * rho.r01_re;
  const y = -2 * rho.r01_im;
  const z = rho.r00 - rho.r11;
  const length = Math.sqrt(x * x + y * y + z * z);
  const phase = Math.atan2(y, x);
  const purity = (1 + length * length) / 2;
  return { x, y, z, length, phase, purity };
}

/**
 * Compute all per-qubit observables for a pure state.
 * @param {{re: Float64Array, im: Float64Array}} s
 * @returns {Array<{p1: number, bloch: {x,y,z,length,phase,purity}}>}
 */
export function perQubitObservables(s) {
  const obs = [];
  for (let q = 0; q < N; q++) {
    const rho = reducedDensityMatrix1(s, q);
    const bloch = blochVector(rho);
    obs.push({ p1: rho.r11, bloch });
  }
  return obs;
}

/**
 * Compute populations (probabilities) for all basis states.
 * @param {{re: Float64Array, im: Float64Array}} s
 * @returns {Float64Array}
 */
export function populations(s) {
  const p = new Float64Array(DIM);
  for (let i = 0; i < DIM; i++) {
    p[i] = s.re[i] * s.re[i] + s.im[i] * s.im[i];
  }
  return p;
}

/**
 * Convert a JS engine basis state index to Qiskit (little-endian) index.
 * Reverses the N-bit binary representation.
 * @param {number} idx - Big-endian index
 * @returns {number} Little-endian index
 */
export function toQiskitIndex(idx) {
  let result = 0;
  for (let b = 0; b < N; b++) {
    if ((idx >> b) & 1) {
      result |= 1 << (N - 1 - b);
    }
  }
  return result;
}

/**
 * Convert a Qiskit (little-endian) basis state index to JS engine (big-endian).
 * Same operation as toQiskitIndex (reversal is its own inverse).
 * @param {number} idx - Little-endian index
 * @returns {number} Big-endian index
 */
export function fromQiskitIndex(idx) {
  return toQiskitIndex(idx);
}

/**
 * Get the bitstring for a basis state index (big-endian, q0 leftmost).
 * @param {number} idx
 * @returns {string}
 */
export function basisBitstring(idx) {
  return idx.toString(2).padStart(N, '0');
}
