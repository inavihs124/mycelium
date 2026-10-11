/**
 * constants.js - Mycelium spin network topology and physical constants
 * 
 * 7-qubit Heisenberg XXZ model on a tree:
 *   H = Σ_b J_b (X_i X_j + Y_i Y_j + Δ Z_i Z_j)
 * 
 * Bond ordering is fixed and must match everywhere (engine, quantum modules, levels).
 */

/** Number of qubits (spins) */
export const N = 7;

/** Hilbert space dimension */
export const DIM = 1 << N; // 128

/** Anisotropy parameter */
export const DELTA = 1.0;

/**
 * Bonds: [qubit_i, qubit_j, coupling_J]
 * Index in this array = bond index used everywhere.
 */
export const BONDS = Object.freeze([
  [0, 1, 1.0],  // bond 0
  [1, 2, 0.8],  // bond 1
  [1, 3, 0.8],  // bond 2
  [3, 4, 0.6],  // bond 3
  [3, 5, 0.6],  // bond 4
  [5, 6, 0.5],  // bond 5
]);

/** Number of bonds */
export const NUM_BONDS = BONDS.length;

/**
 * Adjacency list for the tree.
 * adj[i] = array of neighbor node indices.
 */
export const ADJ = Object.freeze(
  Array.from({ length: N }, (_, i) => {
    const neighbors = [];
    for (const [qi, qj] of BONDS) {
      if (qi === i) neighbors.push(qj);
      if (qj === i) neighbors.push(qi);
    }
    return Object.freeze(neighbors);
  })
);

/**
 * Node degrees.
 */
export const DEGREES = Object.freeze(ADJ.map(a => a.length));

/**
 * Two bonds are adjacent (share a qubit) iff this returns true.
 * @param {number} a - bond index
 * @param {number} b - bond index
 * @returns {boolean}
 */
export function bondsAdjacent(a, b) {
  if (a === b) return true;
  const [ai, aj] = BONDS[a];
  const [bi, bj] = BONDS[b];
  return ai === bi || ai === bj || aj === bi || aj === bj;
}

/**
 * Bipartite colouring of the tree (BFS from node 0).
 * colour[i] = 0 or 1.
 */
export const BIPARTITE_COLOUR = Object.freeze((() => {
  const colour = new Int8Array(N).fill(-1);
  colour[0] = 0;
  const queue = [0];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    for (const nb of ADJ[node]) {
      if (colour[nb] === -1) {
        colour[nb] = 1 - colour[node];
        queue.push(nb);
      }
    }
  }
  return Array.from(colour);
})());

/** Class containing node 0: [0, 2, 4, 6] */
export const BIPARTITE_CLASS_0 = Object.freeze(
  BIPARTITE_COLOUR.reduce((acc, c, i) => (c === 0 ? [...acc, i] : acc), [])
);

/** Class containing node 1: [1, 3, 5] */
export const BIPARTITE_CLASS_1 = Object.freeze(
  BIPARTITE_COLOUR.reduce((acc, c, i) => (c === 1 ? [...acc, i] : acc), [])
);

/**
 * Minimum number of layers per epoch = edge chromatic number = max degree = 3.
 */
export const MIN_LAYERS = Math.max(...DEGREES);

/**
 * Available slice fractions.
 */
export const FRACTIONS = Object.freeze([1, 0.5, 0.25, 0.125]);

/**
 * Fraction labels for display.
 */
export const FRACTION_LABELS = Object.freeze({
  1: '1',
  0.5: '½',
  0.25: '¼',
  0.125: '⅛',
});
