/**
 * entropy.js - Entanglement entropy across tree-edge cuts
 * 
 * For each bond (tree edge), cutting it partitions the 7 nodes into two sets.
 * The entanglement entropy is the von Neumann entropy of the reduced state
 * on the smaller side: S = -Tr(ρ_A log₂ ρ_A).
 * 
 * The smaller side has at most 3 qubits (for the 1-3 cut), so the reduced
 * density matrix is at most 8×8. We use the Jacobi eigenvalue solver from complex.js.
 */

import { N, DIM, BONDS, ADJ } from './constants.js';
import { hermitianEigenvalues, cmat } from './complex.js';

/**
 * Precompute the partition for each bond cut.
 * For each bond, BFS from one side excluding the bond edge.
 * @returns {Array<{sideA: number[], sideB: number[], smaller: number[]}>}
 */
function computePartitions() {
  const partitions = [];
  
  for (const [qi, qj] of BONDS) {
    // BFS from qi, excluding the edge qi-qj
    const visited = new Set([qi]);
    const queue = [qi];
    let head = 0;
    
    while (head < queue.length) {
      const node = queue[head++];
      for (const nb of ADJ[node]) {
        if (!visited.has(nb) && !(node === qi && nb === qj) && !(node === qj && nb === qi)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    
    const sideA = Array.from(visited).sort((a, b) => a - b);
    const sideB = [];
    for (let i = 0; i < N; i++) {
      if (!visited.has(i)) sideB.push(i);
    }
    
    const smaller = sideA.length <= sideB.length ? sideA : sideB;
    partitions.push({ sideA, sideB, smaller });
  }
  
  return partitions;
}

/** Cached partitions */
const PARTITIONS = computePartitions();

/**
 * Get the partition info for a bond cut.
 * @param {number} bondIndex
 * @returns {{sideA: number[], sideB: number[], smaller: number[]}}
 */
export function getPartition(bondIndex) {
  return PARTITIONS[bondIndex];
}

/**
 * Compute the reduced density matrix for a subset of qubits from a pure state.
 * The qubits in `keep` are kept; all others are traced out.
 * 
 * @param {{re: Float64Array, im: Float64Array}} psi - Pure statevector
 * @param {number[]} keep - Qubit indices to keep (sorted)
 * @returns {{re: Float64Array, im: Float64Array, n: number}} - Reduced density matrix
 */
export function reducedDensityMatrix(psi, keep) {
  const nKeep = keep.length;
  const dimKeep = 1 << nKeep;
  const rho = cmat(dimKeep);
  
  // For each pair of basis states in the full system,
  // check if the traced-out qubits match, and accumulate.
  
  // Build bit masks for keep qubits
  const keepBits = keep.map(q => N - 1 - q); // big-endian bit positions
  
  // For efficiency: iterate over all basis states and map to reduced indices
  // reduced index for state |idx⟩ = extract bits at keepBits positions
  
  function reducedIndex(fullIdx) {
    let ri = 0;
    for (let k = 0; k < nKeep; k++) {
      if ((fullIdx >> keepBits[k]) & 1) {
        ri |= 1 << (nKeep - 1 - k);
      }
    }
    return ri;
  }
  
  // Build mask for traced-out qubits
  const traceQubits = [];
  const keepSet = new Set(keep);
  for (let q = 0; q < N; q++) {
    if (!keepSet.has(q)) traceQubits.push(q);
  }
  const traceBits = traceQubits.map(q => N - 1 - q);
  
  // Group basis states by their traced-out bits
  // States with the same traced-out bits but different keep bits contribute to ρ
  
  // For each configuration of traced-out qubits:
  const nTrace = traceQubits.length;
  const dimTrace = 1 << nTrace;
  
  for (let envIdx = 0; envIdx < dimTrace; envIdx++) {
    // Build the full indices for this environment configuration
    // combined with each possible keep configuration
    const fullIndices = new Array(dimKeep);
    
    for (let ki = 0; ki < dimKeep; ki++) {
      let fullIdx = 0;
      // Set keep bits
      for (let k = 0; k < nKeep; k++) {
        if ((ki >> (nKeep - 1 - k)) & 1) {
          fullIdx |= 1 << keepBits[k];
        }
      }
      // Set trace bits from envIdx
      for (let t = 0; t < nTrace; t++) {
        if ((envIdx >> (nTrace - 1 - t)) & 1) {
          fullIdx |= 1 << traceBits[t];
        }
      }
      fullIndices[ki] = fullIdx;
    }
    
    // Accumulate: ρ[ki, kj] += ψ[full_ki] * conj(ψ[full_kj])
    for (let ki = 0; ki < dimKeep; ki++) {
      const fi = fullIndices[ki];
      const psiR_i = psi.re[fi], psiI_i = psi.im[fi];
      
      for (let kj = 0; kj < dimKeep; kj++) {
        const fj = fullIndices[kj];
        const psiR_j = psi.re[fj], psiI_j = psi.im[fj];
        
        const idx = ki * dimKeep + kj;
        rho.re[idx] += psiR_i * psiR_j + psiI_i * psiI_j;
        rho.im[idx] += psiI_i * psiR_j - psiR_i * psiI_j;
      }
    }
  }
  
  return rho;
}

/**
 * Compute von Neumann entropy S = -Σ λ_i log₂(λ_i) from eigenvalues.
 * @param {Float64Array} eigenvalues
 * @returns {number} Entropy in bits
 */
export function vonNeumannEntropy(eigenvalues) {
  let S = 0;
  for (let i = 0; i < eigenvalues.length; i++) {
    const lam = eigenvalues[i];
    if (lam > 1e-15) {
      S -= lam * Math.log2(lam);
    }
  }
  return S;
}

/**
 * Compute entanglement entropy across a tree-edge cut for a pure state.
 * @param {{re: Float64Array, im: Float64Array}} psi
 * @param {number} bondIndex
 * @returns {{entropy: number, bound: number, partition: {sideA: number[], sideB: number[], smaller: number[]}}}
 */
export function cutEntropy(psi, bondIndex) {
  const partition = PARTITIONS[bondIndex];
  const rho = reducedDensityMatrix(psi, partition.smaller);
  const evals = hermitianEigenvalues(rho);
  const entropy = vonNeumannEntropy(evals);
  const bound = partition.smaller.length; // min(|A|, |B|) bits
  
  return { entropy, bound, partition };
}

/**
 * Compute all cut entropies for a state.
 * @param {{re: Float64Array, im: Float64Array}} psi
 * @returns {Array<{bondIndex: number, entropy: number, bound: number}>}
 */
export function allCutEntropies(psi) {
  return BONDS.map((_, idx) => {
    const result = cutEntropy(psi, idx);
    return { bondIndex: idx, entropy: result.entropy, bound: result.bound };
  });
}

/**
 * Compute entanglement entropy across a tree-edge cut for a density matrix.
 * Note: for mixed states, this includes classical mixing.
 * 
 * @param {{re: Float64Array, im: Float64Array}} rho - Full density matrix (DIM×DIM)
 * @param {number} bondIndex
 * @returns {{entropy: number, bound: number, note: string}}
 */
export function cutEntropyDensity(rho, bondIndex) {
  const partition = PARTITIONS[bondIndex];
  const smaller = partition.smaller;
  const nKeep = smaller.length;
  const dimKeep = 1 << nKeep;
  
  // Partial trace to get reduced density matrix
  const rhoR = cmat(dimKeep);
  const keepBits = smaller.map(q => N - 1 - q);
  const traceQubits = [];
  const keepSet = new Set(smaller);
  for (let q = 0; q < N; q++) {
    if (!keepSet.has(q)) traceQubits.push(q);
  }
  const traceBits = traceQubits.map(q => N - 1 - q);
  const nTrace = traceQubits.length;
  const dimTrace = 1 << nTrace;
  
  for (let envIdx = 0; envIdx < dimTrace; envIdx++) {
    for (let ki = 0; ki < dimKeep; ki++) {
      let fi = 0;
      for (let k = 0; k < nKeep; k++) {
        if ((ki >> (nKeep - 1 - k)) & 1) fi |= 1 << keepBits[k];
      }
      for (let t = 0; t < nTrace; t++) {
        if ((envIdx >> (nTrace - 1 - t)) & 1) fi |= 1 << traceBits[t];
      }
      
      for (let kj = 0; kj < dimKeep; kj++) {
        let fj = 0;
        for (let k = 0; k < nKeep; k++) {
          if ((kj >> (nKeep - 1 - k)) & 1) fj |= 1 << keepBits[k];
        }
        for (let t = 0; t < nTrace; t++) {
          if ((envIdx >> (nTrace - 1 - t)) & 1) fj |= 1 << traceBits[t];
        }
        
        const idx = ki * dimKeep + kj;
        rhoR.re[idx] += rho.re[fi * DIM + fj];
        rhoR.im[idx] += rho.im[fi * DIM + fj];
      }
    }
  }
  
  const evals = hermitianEigenvalues(rhoR);
  const entropy = vonNeumannEntropy(evals);
  const bound = smaller.length;
  
  return { entropy, bound, note: 'includes classical mixing' };
}
