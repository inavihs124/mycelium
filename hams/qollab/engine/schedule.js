/**
 * schedule.js - Schedule execution: apply a player's Trotter schedule to a statevector
 * 
 * A schedule is structured as:
 * {
 *   epochs: [
 *     {
 *       layers: [
 *         { slices: [{ bondIndex, fraction }, ...] },
 *         ...
 *       ]
 *     },
 *     ...
 *   ],
 *   macroLinks: { epochIdx: sourceEpochIdx, ... }  // optional
 * }
 * 
 * Each slice applies: exp(-i * theta * (XX + YY + Δ*ZZ)) with theta = J_b * fraction * D
 * where D = T / E (epoch duration).
 */

import { BONDS } from './constants.js';
import { applyBondOperator, sliceTheta } from './bond.js';
import { copyState } from './state.js';

/**
 * Expand macro links: replace linked epochs with copies of their source.
 * @param {object} schedule - Schedule with macroLinks
 * @returns {object} - Schedule with all epochs expanded
 */
export function expandMacros(schedule) {
  const expanded = { epochs: [] };
  for (let i = 0; i < schedule.epochs.length; i++) {
    if (schedule.macroLinks && schedule.macroLinks[i] !== undefined) {
      const sourceIdx = schedule.macroLinks[i];
      expanded.epochs.push(JSON.parse(JSON.stringify(schedule.epochs[sourceIdx])));
    } else {
      expanded.epochs.push(JSON.parse(JSON.stringify(schedule.epochs[i])));
    }
  }
  return expanded;
}

/**
 * Count executed layers across all epochs (macro-expanded).
 * @param {object} schedule
 * @returns {number}
 */
export function countDepth(schedule) {
  const exp = expandMacros(schedule);
  let depth = 0;
  for (const epoch of exp.epochs) {
    depth += epoch.layers.length;
  }
  return depth;
}

/**
 * Count slices placed in the editor (cost).
 * A macro-linked epoch doesn't count (its source counts once).
 * @param {object} schedule
 * @returns {number}
 */
export function countCost(schedule) {
  let cost = 0;
  const counted = new Set();
  for (let i = 0; i < schedule.epochs.length; i++) {
    const sourceIdx = (schedule.macroLinks && schedule.macroLinks[i] !== undefined)
      ? schedule.macroLinks[i] : i;
    if (counted.has(sourceIdx)) continue;
    counted.add(sourceIdx);
    for (const layer of schedule.epochs[sourceIdx].layers) {
      cost += layer.slices.length;
    }
  }
  return cost;
}

/**
 * Count total executed slices (macro-expanded).
 * @param {object} schedule
 * @returns {number}
 */
export function countExecutedSlices(schedule) {
  const exp = expandMacros(schedule);
  let count = 0;
  for (const epoch of exp.epochs) {
    for (const layer of epoch.layers) {
      count += layer.slices.length;
    }
  }
  return count;
}

/**
 * Execute a schedule on a statevector, returning the final state
 * and intermediate states at epoch boundaries (checkpoints).
 * 
 * @param {{re: Float64Array, im: Float64Array}} psi0 - Start state
 * @param {object} schedule - Schedule to execute
 * @param {number} T - Total evolution time
 * @param {number} E - Number of epochs (schedule.epochs.length should equal E)
 * @returns {{
 *   finalState: {re: Float64Array, im: Float64Array},
 *   checkpoints: Array<{re: Float64Array, im: Float64Array}>,
 *   layerStates: Array<{re: Float64Array, im: Float64Array}>
 * }}
 */
export function executeSchedule(psi0, schedule, T, E) {
  const exp = expandMacros(schedule);
  const D = T / E; // epoch duration
  
  let current = copyState(psi0);
  const checkpoints = [];
  const layerStates = [copyState(current)]; // Initial state
  
  for (const epoch of exp.epochs) {
    for (const layer of epoch.layers) {
      // Apply all slices in this layer (they act on disjoint qubits by construction)
      for (const slice of layer.slices) {
        const [qi, qj, J] = BONDS[slice.bondIndex];
        const theta = sliceTheta(J, slice.fraction, D);
        applyBondOperator(current.re, current.im, qi, qj, theta);
      }
      layerStates.push(copyState(current));
    }
    checkpoints.push(copyState(current));
  }
  
  return {
    finalState: current,
    checkpoints,
    layerStates,
  };
}

/**
 * Execute schedule and return only the final state (no checkpoints).
 * More memory efficient for search.
 * 
 * @param {{re: Float64Array, im: Float64Array}} psi0
 * @param {object} schedule
 * @param {number} T
 * @param {number} E
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function executeScheduleFinal(psi0, schedule, T, E) {
  const exp = expandMacros(schedule);
  const D = T / E;
  
  let current = copyState(psi0);
  
  for (const epoch of exp.epochs) {
    for (const layer of epoch.layers) {
      for (const slice of layer.slices) {
        const [qi, qj, J] = BONDS[slice.bondIndex];
        const theta = sliceTheta(J, slice.fraction, D);
        applyBondOperator(current.re, current.im, qi, qj, theta);
      }
    }
  }
  
  return current;
}

/**
 * Build a simple first-order Trotter schedule for all bonds in the given order.
 * Each bond gets one slice of fraction 1 per epoch.
 * Each slice is in its own layer (sequential, no parallelism).
 * Epochs 1..E-1 are macro copies of epoch 0.
 *
 * @param {number[]} bondOrder - Permutation of bond indices
 * @param {number} E - Number of epochs
 * @returns {object} schedule
 */
export function firstOrderSchedule(bondOrder, E) {
  const epochTemplate = {
    layers: bondOrder.map(bi => ({
      slices: [{ bondIndex: bi, fraction: 1 }],
    })),
  };

  const epochs = [JSON.parse(JSON.stringify(epochTemplate))];
  const macroLinks = {};
  for (let i = 1; i < E; i++) {
    macroLinks[i] = 0;
    epochs.push({ layers: [] }); // placeholder for macro-linked epoch
  }

  return { epochs, macroLinks };
}

/**
 * Build a second-order Trotter schedule: forward at dt/2, reverse at dt/2.
 * Each bond gets fraction 0.5 in each direction.
 * Epochs 1..E-1 are macro copies of epoch 0.
 *
 * @param {number[]} bondOrder - Permutation of bond indices
 * @param {number} E - Number of epochs
 * @returns {object} schedule
 */
export function secondOrderSchedule(bondOrder, E) {
  const layers = [];

  // Forward half
  for (const bi of bondOrder) {
    layers.push({ slices: [{ bondIndex: bi, fraction: 0.5 }] });
  }

  // Reverse half
  for (let i = bondOrder.length - 1; i >= 0; i--) {
    layers.push({ slices: [{ bondIndex: bondOrder[i], fraction: 0.5 }] });
  }

  const epochTemplate = { layers };

  const epochs = [JSON.parse(JSON.stringify(epochTemplate))];
  const macroLinks = {};
  for (let i = 1; i < E; i++) {
    macroLinks[i] = 0;
    epochs.push({ layers: [] }); // placeholder for macro-linked epoch
  }

  return { epochs, macroLinks };
}
