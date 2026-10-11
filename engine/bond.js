/**
 * bond.js - Bond (slice) operator for the Heisenberg XXZ model
 * 
 * A bond connects qubits i and j with coupling J.
 * The bond Hamiltonian is: H_b = J * (XX + YY + DELTA * ZZ)
 * 
 * Bond evolution exp(-i * theta * (XX + YY + DELTA*ZZ)) has a closed form:
 *   |00⟩, |11⟩ → phase e^{-i*DELTA*theta}
 *   {|01⟩, |10⟩} block: e^{+i*DELTA*theta} * (cos(2θ)I - i·sin(2θ)σ_x)
 * 
 * This module applies the bond operator directly to a statevector,
 * operating only on the 4 amplitudes affected by the two-qubit gate.
 * 
 * Convention: big-endian. Qubit q contributes bit at position (N-1-q).
 */

import { N, DELTA } from './constants.js';

/**
 * Apply the bond evolution operator to a statevector in-place.
 * 
 * exp(-i * theta * (X_qi X_qj + Y_qi Y_qj + DELTA * Z_qi Z_qj))
 * 
 * where theta = J_bond * fraction * epochDuration
 * 
 * @param {Float64Array} re - Real parts of statevector (length 2^N)
 * @param {Float64Array} im - Imaginary parts of statevector (length 2^N)
 * @param {number} qi - First qubit index (0..N-1)
 * @param {number} qj - Second qubit index (0..N-1)
 * @param {number} theta - Angle parameter (J * f * D)
 */
export function applyBondOperator(re, im, qi, qj, theta) {
  const dim = re.length;
  
  // Bit positions in the basis state index (big-endian)
  const bitI = N - 1 - qi;
  const bitJ = N - 1 - qj;
  
  // Precompute the operator matrix elements
  const dtheta = DELTA * theta;
  const cosDelta = Math.cos(dtheta);
  const sinDelta = Math.sin(dtheta);
  const cos2theta = Math.cos(2 * theta);
  const sin2theta = Math.sin(2 * theta);
  
  // Phase for |00⟩ and |11⟩: e^{-i*DELTA*theta}
  const phase00_re = cosDelta;
  const phase00_im = -sinDelta;
  
  // Phase for {|01⟩,|10⟩} block: e^{+i*DELTA*theta}
  const phaseOff_re = cosDelta;
  const phaseOff_im = sinDelta;
  
  // Block matrix for {|01⟩,|10⟩}: phase * (cos(2θ)I - i·sin(2θ)σ_x)
  // M = [[phase * cos2θ, -i * phase * sin2θ],
  //      [-i * phase * sin2θ, phase * cos2θ]]
  // 
  // Diagonal: (phaseOff_re + i*phaseOff_im) * cos2θ
  const diagR = phaseOff_re * cos2theta;
  const diagI = phaseOff_im * cos2theta;
  // Off-diagonal: -i * (phaseOff_re + i*phaseOff_im) * sin2θ
  //             = (phaseOff_im * sin2θ) + i * (-phaseOff_re * sin2θ)
  //             = (-i * phase * sin2θ)
  const offR = phaseOff_im * sin2theta;
  const offI = -phaseOff_re * sin2theta;
  
  // Iterate over all basis states, grouped by the (qi, qj) bits
  // Process each group of 4 states that differ only in bits qi and qj
  const maskI = 1 << bitI;
  const maskJ = 1 << bitJ;
  const maskBoth = maskI | maskJ;
  
  for (let base = 0; base < dim; base++) {
    // Skip if either target bit is set (we'll process from the base with both bits 0)
    if (base & maskBoth) continue;
    
    // Indices of the 4 states in the (qi, qj) subspace
    const i00 = base;              // qi=0, qj=0
    const i01 = base | maskJ;      // qi=0, qj=1
    const i10 = base | maskI;      // qi=1, qj=0
    const i11 = base | maskBoth;   // qi=1, qj=1
    
    // Apply phase to |00⟩: multiply by e^{-i*DELTA*theta}
    const r00 = re[i00], m00 = im[i00];
    re[i00] = r00 * phase00_re - m00 * phase00_im;
    im[i00] = r00 * phase00_im + m00 * phase00_re;
    
    // Apply phase to |11⟩: multiply by e^{-i*DELTA*theta}
    const r11 = re[i11], m11 = im[i11];
    re[i11] = r11 * phase00_re - m11 * phase00_im;
    im[i11] = r11 * phase00_im + m11 * phase00_re;
    
    // Apply 2×2 block to {|01⟩, |10⟩}
    const r01 = re[i01], m01 = im[i01];
    const r10 = re[i10], m10 = im[i10];
    
    // new |01⟩ = diag * |01⟩ + off * |10⟩
    re[i01] = diagR * r01 - diagI * m01 + offR * r10 - offI * m10;
    im[i01] = diagR * m01 + diagI * r01 + offR * m10 + offI * r10;
    
    // new |10⟩ = off * |01⟩ + diag * |10⟩
    re[i10] = offR * r01 - offI * m01 + diagR * r10 - diagI * m10;
    im[i10] = offR * m01 + offI * r01 + diagR * m10 + diagI * r10;
  }
}

/**
 * Compute theta for a slice.
 * @param {number} J - Bond coupling strength
 * @param {number} fraction - Slice fraction (1, 0.5, 0.25, 0.125)
 * @param {number} epochDuration - Duration of one epoch (T/E)
 * @returns {number} theta = J * fraction * epochDuration
 */
export function sliceTheta(J, fraction, epochDuration) {
  return J * fraction * epochDuration;
}
