/**
 * density.js - Density matrix simulation for noisy evolution
 * 
 * When noise p > 0, the state is a 128×128 density matrix ρ (complex).
 * After each layer, each qubit independently dephases:
 *   ρ → (1-p) ρ + p Z_q ρ Z_q
 * 
 * Storage: paired Float64Arrays of length 128*128 = 16384.
 * Total memory: 2 × 16384 × 8 = 256 KB.
 */

import { N, DIM, BONDS, DELTA } from './constants.js';
import { applyBondOperator, sliceTheta } from './bond.js';
import { copyState } from './state.js';
import { expandMacros } from './schedule.js';

/**
 * Create a density matrix from a pure state: ρ = |ψ⟩⟨ψ|
 * @param {{re: Float64Array, im: Float64Array}} psi
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function pureStateToDensity(psi) {
  const n2 = DIM * DIM;
  const re = new Float64Array(n2);
  const im = new Float64Array(n2);
  
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      // ρ[i][j] = ψ[i] * conj(ψ[j])
      const idx = i * DIM + j;
      re[idx] = psi.re[i] * psi.re[j] + psi.im[i] * psi.im[j];
      im[idx] = psi.im[i] * psi.re[j] - psi.re[i] * psi.im[j];
    }
  }
  
  return { re, im };
}

/**
 * Apply a bond operator to a density matrix: ρ → U ρ U†
 * Uses the fact that U is the bond evolution operator.
 * 
 * We apply U to each column of ρ (treating ρ as a collection of kets),
 * then U† to each row.
 * 
 * Actually, it's easier to work with the vectorized form:
 * ρ → U ρ U† means ρ[i,j] = Σ U[i,i'] ρ[i',j'] conj(U[j,j'])
 * 
 * But since U only acts on 2 qubits, we can do this efficiently.
 * 
 * @param {Float64Array} rhoRe
 * @param {Float64Array} rhoIm
 * @param {number} qi - First qubit
 * @param {number} qj - Second qubit
 * @param {number} theta - Bond angle
 */
export function applyBondToDensity(rhoRe, rhoIm, qi, qj, theta) {
  // Strategy: treat each column of ρ as a ket, apply U to it.
  // Then treat each row of ρ as a bra, apply U† (= conjugate of U applied to rows).
  
  // Step 1: Apply U to columns (left multiply)
  // For each column j, apply bond operator to the column vector ρ[:,j]
  const colRe = new Float64Array(DIM);
  const colIm = new Float64Array(DIM);
  
  for (let j = 0; j < DIM; j++) {
    // Extract column j
    for (let i = 0; i < DIM; i++) {
      colRe[i] = rhoRe[i * DIM + j];
      colIm[i] = rhoIm[i * DIM + j];
    }
    // Apply bond operator
    applyBondOperator(colRe, colIm, qi, qj, theta);
    // Write back
    for (let i = 0; i < DIM; i++) {
      rhoRe[i * DIM + j] = colRe[i];
      rhoIm[i * DIM + j] = colIm[i];
    }
  }
  
  // Step 2: Apply U† to rows (right multiply by U†)
  // U† has theta → -theta? No. U = exp(-iθH_bond).
  // U† = exp(+iθH_bond). In the closed form:
  // For U†, the phases are conjugated and the off-diagonal block is transposed-conjugated.
  // But actually, applying U† to each row is equivalent to:
  // ρ[i,:] → ρ[i,:] U† which means we apply U^T^* to the row viewed as a column.
  // For a real-symmetric structure like the bond operator, U^T = U (it's symmetric in the
  // computational basis? Let me check.)
  // Actually U is NOT generally symmetric. U† = exp(+iθH) which is applyBondOperator with -theta.
  // But we want right-multiplication by U†:
  // (ρ U†)[i,j] = Σ_k ρ[i,k] U†[k,j] = Σ_k ρ[i,k] conj(U[j,k])
  // This is the same as applying conj(U) to the row viewed as a column, then conjugating back.
  // Or equivalently, apply U* (element-wise conjugate of U) to each row.
  // U* acts on a vector v as: conj(U * conj(v)).
  
  // Simpler approach: right-multiply by U† = apply bond operator with -theta to each row (transposed).
  // ρ U† [i,j] = Σ_k ρ[i,k] (U†)[k,j]
  // If we view row i as a ket and apply U† to it... that gives Σ_k (U†)[j,k] row[k] which is wrong order.
  // 
  // Let's be explicit. We want: ρ' = U ρ U†
  // We already did ρ_mid = U ρ.
  // Now ρ' = ρ_mid U†.
  // (ρ_mid U†)[i,j] = Σ_k ρ_mid[i,k] U†[k,j]
  // 
  // Since U†[k,j] = conj(U[j,k]), and U is the bond operator with theta:
  // We can compute this by transposing the row, applying conj(U) = bond(-theta) to the conjugated row...
  // 
  // Actually the simplest correct approach: for each row i, apply the transformation
  // row[j] → Σ_k row[k] * U†[k,j]
  // This is the transpose of applying U† to a column. 
  // Since H_bond is Hermitian, U† = exp(+iθH) = bond operator with -theta.
  // And for the bond operator, the matrix is symmetric in computational basis 
  // (because XX, YY, ZZ produce real symmetric matrices when DELTA is real).
  // Wait, YY is NOT real symmetric. Let me check.
  // YY = [[0,0,0,-1],[0,0,1,0],[0,1,0,0],[-1,0,0,0]] - this IS real symmetric.
  // XX = [[0,0,0,1],[0,0,1,0],[0,1,0,0],[1,0,0,0]] - real symmetric.
  // ZZ = [[1,0,0,0],[0,-1,0,0],[0,0,-1,0],[0,0,0,1]] - diagonal, real symmetric.
  // So H_bond is real symmetric ⟹ U = exp(-iθH) has U^T = U (because exp of real symm. times -i).
  // Actually: H real symmetric ⟹ U = exp(-iθH) is complex symmetric? Let me check.
  // exp(-iθH) where H is real symmetric:
  // H = V D V^T (real eigendecomposition), U = V exp(-iθD) V^T.
  // U^T = (V^T)^T exp(-iθD)^T V^T = V exp(-iθD) V^T = U. Yes, U is symmetric!
  // So U†[k,j] = conj(U[k,j]) = conj(U[j,k]) (since U symmetric) = U*[j,k].
  // 
  // Therefore (ρ_mid U†)[i,j] = Σ_k ρ_mid[i,k] conj(U[k,j]) = Σ_k ρ_mid[i,k] conj(U[j,k])
  // 
  // For each row i, this is the inner product of row i with conj(column j of U).
  // Equivalently, transpose ρ_mid rows to columns, apply conj(U) = bond(-theta) but conjugated...
  // 
  // OK this is getting complex. Let me just use the standard approach:
  // For row i: new_row[j] = Σ_k row[k] * conj(U[j,k])
  // Since U is symmetric: = Σ_k row[k] * conj(U[k,j])
  // = conj( Σ_k conj(row[k]) * U[k,j] )
  // = conj( U * conj(row) )[j]
  // 
  // So: new_row = conj( U * conj(row) )
  // 1. Conjugate the row
  // 2. Apply U (bond operator with theta)
  // 3. Conjugate the result
  
  const rowRe = new Float64Array(DIM);
  const rowIm = new Float64Array(DIM);
  
  for (let i = 0; i < DIM; i++) {
    // Extract and conjugate row i
    for (let j = 0; j < DIM; j++) {
      rowRe[j] = rhoRe[i * DIM + j];
      rowIm[j] = -rhoIm[i * DIM + j]; // conjugate
    }
    // Apply bond operator with theta
    applyBondOperator(rowRe, rowIm, qi, qj, theta);
    // Conjugate and write back
    for (let j = 0; j < DIM; j++) {
      rhoRe[i * DIM + j] = rowRe[j];
      rhoIm[i * DIM + j] = -rowIm[j]; // conjugate
    }
  }
}

/**
 * Apply per-qubit dephasing noise to a density matrix.
 * For each qubit q: ρ → (1-p) ρ + p Z_q ρ Z_q
 * 
 * Z_q flips the sign of off-diagonal elements where qubit q differs.
 * Specifically, ρ[i,j] → ρ[i,j] * (1 - 2p) if qubits q of i and j differ.
 * Equivalently: ρ[i,j] *= (1 - 2p)^(number of qubits where i and j differ in the dephased set)
 * 
 * For all qubits dephasing independently:
 * ρ[i,j] *= Π_q [(1-p) + p * (-1)^(bit_q(i) XOR bit_q(j))]
 * = Π_q [1 - 2p * (bit_q(i) XOR bit_q(j))]
 * 
 * For each qubit where bits differ: factor = (1-2p)
 * For each qubit where bits match: factor = 1
 * So: ρ[i,j] *= (1-2p)^(popcount(i XOR j))
 * 
 * But we apply noise per LAYER, and within each layer we dephase all 7 qubits.
 * 
 * @param {Float64Array} rhoRe
 * @param {Float64Array} rhoIm
 * @param {number} p - Dephasing probability per qubit
 */
export function applyDephasing(rhoRe, rhoIm, p) {
  if (p <= 0) return;
  
  const factor = 1 - 2 * p;
  
  // Precompute (1-2p)^k for k = 0..N
  const factors = new Float64Array(N + 1);
  factors[0] = 1;
  for (let k = 1; k <= N; k++) {
    factors[k] = factors[k - 1] * factor;
  }
  
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      const diff = i ^ j;
      const nDiff = popcount(diff);
      if (nDiff > 0) {
        const f = factors[nDiff];
        const idx = i * DIM + j;
        rhoRe[idx] *= f;
        rhoIm[idx] *= f;
      }
    }
  }
}

/**
 * Popcount (number of set bits).
 * @param {number} x
 * @returns {number}
 */
function popcount(x) {
  let count = 0;
  while (x) {
    count += x & 1;
    x >>= 1;
  }
  return count;
}

/**
 * Compute fidelity ⟨ψ|ρ|ψ⟩ between a pure state and a density matrix.
 * @param {{re: Float64Array, im: Float64Array}} psi - Pure state
 * @param {{re: Float64Array, im: Float64Array}} rho - Density matrix (DIM×DIM)
 * @returns {number}
 */
export function densityFidelity(psi, rho) {
  // ⟨ψ|ρ|ψ⟩ = Σ_{i,j} conj(ψ[i]) ρ[i,j] ψ[j]
  let result = 0;
  for (let i = 0; i < DIM; i++) {
    const psiR_i = psi.re[i], psiI_i = psi.im[i]; // conj: (psiR, -psiI)
    for (let j = 0; j < DIM; j++) {
      const rhoR = rho.re[i * DIM + j];
      const rhoI = rho.im[i * DIM + j];
      const psiR_j = psi.re[j], psiI_j = psi.im[j];
      
      // conj(ψ[i]) * ρ[i,j] * ψ[j]
      // = (psiR_i - i*psiI_i)(rhoR + i*rhoI)(psiR_j + i*psiI_j)
      // We only need the real part of the total sum
      const midR = psiR_i * rhoR + psiI_i * rhoI;
      const midI = psiR_i * rhoI - psiI_i * rhoR;
      result += midR * psiR_j - midI * psiI_j;
    }
  }
  return result;
}

/**
 * Compute trace of a density matrix.
 * @param {{re: Float64Array, im: Float64Array}} rho
 * @returns {number}
 */
export function densityTrace(rho) {
  let trace = 0;
  for (let i = 0; i < DIM; i++) {
    trace += rho.re[i * DIM + i];
  }
  return trace;
}

/**
 * Execute a schedule with noise, using density matrix evolution.
 * 
 * @param {{re: Float64Array, im: Float64Array}} psi0 - Start state (pure)
 * @param {object} schedule
 * @param {number} T
 * @param {number} E
 * @param {number} p - Dephasing probability per qubit per layer
 * @returns {{
 *   finalDensity: {re: Float64Array, im: Float64Array},
 *   checkpointDensities: Array<{re: Float64Array, im: Float64Array}>
 * }}
 */
export function executeScheduleNoisy(psi0, schedule, T, E, p) {
  const exp = expandMacros(schedule);
  const D = T / E;
  
  let rho = pureStateToDensity(psi0);
  const checkpointDensities = [];
  
  for (const epoch of exp.epochs) {
    for (const layer of epoch.layers) {
      // Apply all slices in this layer
      for (const slice of layer.slices) {
        const [qi, qj, J] = BONDS[slice.bondIndex];
        const theta = sliceTheta(J, slice.fraction, D);
        applyBondToDensity(rho.re, rho.im, qi, qj, theta);
      }
      // Apply dephasing noise after each layer
      applyDephasing(rho.re, rho.im, p);
    }
    checkpointDensities.push({
      re: new Float64Array(rho.re),
      im: new Float64Array(rho.im),
    });
  }
  
  return {
    finalDensity: rho,
    checkpointDensities,
  };
}

/**
 * Compute P1 for each qubit from a density matrix.
 * P1_q = (1 - ⟨Z_q⟩)/2 = Σ_{i: bit_q(i)=1} ρ[i,i]
 * @param {{re: Float64Array, im: Float64Array}} rho
 * @returns {Float64Array}
 */
export function densityP1(rho) {
  const p1 = new Float64Array(N);
  for (let idx = 0; idx < DIM; idx++) {
    const prob = rho.re[idx * DIM + idx]; // diagonal element (real for valid ρ)
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
 * Extract reduced density matrix for a single qubit from the full density matrix.
 * @param {{re: Float64Array, im: Float64Array}} rho
 * @param {number} q - Qubit index
 * @returns {{r00: number, r01_re: number, r01_im: number, r11: number}}
 */
export function densityReducedDM1(rho, q) {
  const bit = N - 1 - q;
  const mask = 1 << bit;
  let r00 = 0, r11 = 0, r01_re = 0, r01_im = 0;
  
  for (let base = 0; base < DIM; base++) {
    if (base & mask) continue;
    const i0 = base;
    const i1 = base | mask;
    
    // Trace over environment: sum diagonal blocks
    for (let envBase = 0; envBase < DIM; envBase++) {
      if (envBase & mask) continue;
      // Check that envBase and base agree on all bits except the target qubit
      // Actually for the partial trace, we sum over all environmental configurations
      // This approach iterates over all pairs, which is O(DIM^2). 
      // Let me use a more efficient approach.
    }
  }
  
  // More efficient: iterate over all env configurations
  for (let env = 0; env < DIM; env++) {
    if (env & mask) continue; // env has qubit q = 0 (we iterate over env configs)
    const i0 = env;         // qubit q = 0, env config
    const i1 = env | mask;  // qubit q = 1, same env config
    
    r00 += rho.re[i0 * DIM + i0];
    r11 += rho.re[i1 * DIM + i1];
    r01_re += rho.re[i0 * DIM + i1];
    r01_im += rho.im[i0 * DIM + i1];
  }
  
  return { r00, r01_re, r01_im, r11 };
}
