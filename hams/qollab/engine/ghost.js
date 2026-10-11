/**
 * ghost.js - Exact time evolution exp(-iHt)|ψ₀⟩ via scaled Taylor series
 * 
 * The Hamiltonian H = Σ_b J_b (X_iX_j + Y_iY_j + Δ·Z_iZ_j) is applied
 * as 18 sparse Pauli terms. The Taylor series is:
 *   exp(-iHt)|ψ⟩ = Σ_{k=0}^∞ (-iHt)^k/k! |ψ⟩
 * 
 * For numerical stability, we scale: choose substeps with ‖H‖·dt ≤ 1.
 * Within each substep, compute to order ≥ 20.
 * 
 * Validated against scipy.linalg.expm to < 1e-10.
 */

import { N, DIM, BONDS, DELTA } from './constants.js';

/**
 * Spectral norm of H, precomputed.
 * ‖H‖₂ = 7.584591 (from Phase 0 spike).
 */
const H_NORM = 7.584591;

/** Maximum Taylor order */
const MAX_ORDER = 30;

/** Convergence tolerance */
const TOL = 1e-15;

/**
 * Apply one Pauli-term contribution to a vector: out += coeff * (P_a ⊗ P_b) |v⟩
 * where P is X, Y, or Z on qubits qa, qb.
 * 
 * This modifies `out` in place.
 * 
 * @param {Float64Array} outRe
 * @param {Float64Array} outIm
 * @param {Float64Array} vRe
 * @param {Float64Array} vIm
 * @param {string} pauli - 'XX', 'YY', or 'ZZ'
 * @param {number} qa - First qubit
 * @param {number} qb - Second qubit
 * @param {number} coeffR - Real part of coefficient
 * @param {number} coeffI - Imaginary part of coefficient
 */
function applyPauliTerm(outRe, outIm, vRe, vIm, pauli, qa, qb, coeffR, coeffI) {
  const bitA = N - 1 - qa;
  const bitB = N - 1 - qb;
  const maskA = 1 << bitA;
  const maskB = 1 << bitB;
  
  for (let idx = 0; idx < DIM; idx++) {
    let targetIdx, valR, valI;
    
    if (pauli === 'XX') {
      // XX flips both qubits
      targetIdx = idx ^ maskA ^ maskB;
      valR = vRe[targetIdx];
      valI = vIm[targetIdx];
    } else if (pauli === 'YY') {
      // YY flips both qubits with sign (-1)^(bitA(idx) + bitB(idx))
      // Y|0⟩ = i|1⟩, Y|1⟩ = -i|0⟩
      // (Y⊗Y)|ab⟩ = i^(1-2a) * i^(1-2b) |ā,b̄⟩ = (-1)^(a+b) * (-1) |ā,b̄⟩
      // Wait, let me be more careful:
      // Y|0⟩ = i|1⟩, Y|1⟩ = -i|0⟩
      // (YaYb)|ab⟩ = (Ya|a⟩)(Yb|b⟩)
      // a=0,b=0: i|1⟩·i|1⟩ = -|11⟩
      // a=0,b=1: i|1⟩·(-i)|0⟩ = |10⟩
      // a=1,b=0: (-i)|0⟩·i|1⟩ = |01⟩
      // a=1,b=1: (-i)|0⟩·(-i)|0⟩ = -|00⟩
      // So sign = (-1)^(a+b+1)... no: a=0,b=0 → -1, a=0,b=1 → +1, a=1,b=0 → +1, a=1,b=1 → -1
      // Sign = (-1)^(1 + a + b) ... no. Let me redo:
      // a=0,b=0: (i)(i) = i² = -1
      // a=0,b=1: (i)(-i) = -i² = 1
      // a=1,b=0: (-i)(i) = -i² = 1  
      // a=1,b=1: (-i)(-i) = i² = -1
      // So sign = -(-1)^(a+b) = -1 if a+b even, +1 if a+b odd
      targetIdx = idx ^ maskA ^ maskB;
      const a = (idx >> bitA) & 1;
      const b = (idx >> bitB) & 1;
      const sign = ((a + b) & 1) ? 1 : -1;
      valR = sign * vRe[targetIdx];
      valI = sign * vIm[targetIdx];
    } else { // ZZ
      // ZZ does not flip qubits, just applies sign (-1)^(a+b)
      targetIdx = idx;
      const a = (idx >> bitA) & 1;
      const b = (idx >> bitB) & 1;
      const sign = ((a + b) & 1) ? -1 : 1;
      valR = sign * vRe[targetIdx];
      valI = sign * vIm[targetIdx];
    }
    
    // out += coeff * val
    outRe[idx] += coeffR * valR - coeffI * valI;
    outIm[idx] += coeffR * valI + coeffI * valR;
  }
}

/**
 * Apply H to a vector: out = H|v⟩
 * H = Σ_b J_b (X_iX_j + Y_iY_j + Δ·Z_iZ_j)
 * 
 * @param {Float64Array} outRe
 * @param {Float64Array} outIm
 * @param {Float64Array} vRe
 * @param {Float64Array} vIm
 */
export function applyH(outRe, outIm, vRe, vIm) {
  outRe.fill(0);
  outIm.fill(0);
  
  for (const [qi, qj, J] of BONDS) {
    applyPauliTerm(outRe, outIm, vRe, vIm, 'XX', qi, qj, J, 0);
    applyPauliTerm(outRe, outIm, vRe, vIm, 'YY', qi, qj, J, 0);
    applyPauliTerm(outRe, outIm, vRe, vIm, 'ZZ', qi, qj, J * DELTA, 0);
  }
}

/**
 * Compute exp(-iHt)|ψ⟩ using scaled Taylor series.
 * 
 * @param {{re: Float64Array, im: Float64Array}} psi - Input statevector (not modified)
 * @param {number} t - Evolution time
 * @returns {{re: Float64Array, im: Float64Array}} - Output statevector
 */
export function exactEvolution(psi, t) {
  // Number of substeps: ceil(||H|| * |t| / 1)
  const numSteps = Math.max(1, Math.ceil(H_NORM * Math.abs(t)));
  const dt = t / numSteps;
  
  // Working buffers
  let curRe = new Float64Array(psi.re);
  let curIm = new Float64Array(psi.im);
  
  const termRe = new Float64Array(DIM);
  const termIm = new Float64Array(DIM);
  const hvRe = new Float64Array(DIM);
  const hvIm = new Float64Array(DIM);
  
  for (let step = 0; step < numSteps; step++) {
    // Taylor series: exp(-iH*dt)|cur⟩ = Σ_k (-iH*dt)^k/k! |cur⟩
    // term_k = (-iH*dt)^k/k! |cur⟩
    // term_{k+1} = (-iH*dt)/(k+1) * term_k
    
    // Initialize: term_0 = |cur⟩, sum = |cur⟩
    const sumRe = new Float64Array(curRe);
    const sumIm = new Float64Array(curIm);
    
    termRe.set(curRe);
    termIm.set(curIm);
    
    for (let k = 0; k < MAX_ORDER; k++) {
      // Compute H * term_k
      applyH(hvRe, hvIm, termRe, termIm);
      
      // term_{k+1} = (-i * dt) / (k+1) * H * term_k
      // -i * dt * (a + ib) = dt * (b - ia) → real: dt*b/(k+1), imag: -dt*a/(k+1)
      const scale = dt / (k + 1);
      for (let i = 0; i < DIM; i++) {
        termRe[i] = scale * hvIm[i];
        termIm[i] = -scale * hvRe[i];
      }
      
      // sum += term_{k+1}
      let maxTerm = 0;
      for (let i = 0; i < DIM; i++) {
        sumRe[i] += termRe[i];
        sumIm[i] += termIm[i];
        const mag = termRe[i] * termRe[i] + termIm[i] * termIm[i];
        if (mag > maxTerm) maxTerm = mag;
      }
      
      // Check convergence
      if (maxTerm < TOL * TOL) break;
    }
    
    curRe = sumRe;
    curIm = sumIm;
  }
  
  return { re: curRe, im: curIm };
}

/**
 * Compute the ghost (exact state) at multiple times.
 * @param {{re: Float64Array, im: Float64Array}} psi0 - Start state
 * @param {number[]} times - Array of times to compute
 * @returns {Array<{re: Float64Array, im: Float64Array}>}
 */
export function ghostStates(psi0, times) {
  return times.map(t => exactEvolution(psi0, t));
}

/**
 * Compute exact state at checkpoint times for a given level.
 * @param {{re: Float64Array, im: Float64Array}} psi0 - Start state
 * @param {number} T - Total time
 * @param {number} E - Number of epochs
 * @returns {Array<{re: Float64Array, im: Float64Array}>} States at t=k*T/E for k=1..E
 */
export function ghostCheckpoints(psi0, T, E) {
  const times = [];
  for (let k = 1; k <= E; k++) {
    times.push(k * T / E);
  }
  return ghostStates(psi0, times);
}
