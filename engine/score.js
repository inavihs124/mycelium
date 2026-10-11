/**
 * score.js - Scoring functions for Mycelium
 * 
 * Cost = slices placed in editor (macro source counted once)
 * Depth = total executed layers across all epochs (macro-expanded)
 * Error = sqrt(1 - F) where F = |⟨ψ_exact|ψ_machine⟩|²
 */

import { fidelity, stateError } from './state.js';
import { countCost, countDepth, countExecutedSlices } from './schedule.js';

/**
 * Compute all scores for a schedule execution.
 * 
 * @param {object} schedule - The player's schedule
 * @param {{re: Float64Array, im: Float64Array}} machineState - Final machine state
 * @param {{re: Float64Array, im: Float64Array}} exactState - Exact ghost state at T
 * @param {object} [level] - Level configuration for caps/ceiling
 * @returns {{
 *   cost: number,
 *   depth: number, 
 *   error: number,
 *   fidelity: number,
 *   executedSlices: number,
 *   passed: boolean,
 *   withinCaps: {cost: boolean, depth: boolean},
 *   withinCeiling: boolean
 * }}
 */
export function computeScores(schedule, machineState, exactState, level) {
  const cost = countCost(schedule);
  const depth = countDepth(schedule);
  const F = fidelity(exactState, machineState);
  const error = Math.sqrt(Math.max(0, 1 - F));
  const executedSlices = countExecutedSlices(schedule);
  
  let withinCaps = { cost: true, depth: true };
  let withinCeiling = true;
  
  if (level) {
    if (level.caps) {
      if (level.caps.cost !== undefined) {
        withinCaps.cost = cost <= level.caps.cost;
      }
      if (level.caps.depth !== undefined) {
        withinCaps.depth = depth <= level.caps.depth;
      }
    }
    if (level.ceiling && level.ceiling.error !== undefined) {
      withinCeiling = error <= level.ceiling.error;
    }
  }
  
  const passed = withinCeiling && withinCaps.cost && withinCaps.depth;
  
  return {
    cost,
    depth,
    error,
    fidelity: F,
    executedSlices,
    passed,
    withinCaps,
    withinCeiling,
  };
}

/**
 * Compute per-epoch errors.
 * @param {Array<{re: Float64Array, im: Float64Array}>} checkpoints - Machine states at epoch boundaries
 * @param {Array<{re: Float64Array, im: Float64Array}>} ghostCheckpoints - Exact states at epoch boundaries
 * @returns {number[]} Error at each checkpoint
 */
export function epochErrors(checkpoints, ghostCheckpoints) {
  return checkpoints.map((cp, i) => stateError(cp, ghostCheckpoints[i]));
}

/**
 * Check if a score beats a par value.
 * @param {number} score - Player's score (lower is better)
 * @param {number} par - Par value
 * @returns {boolean}
 */
export function beatsPar(score, par) {
  return score <= par;
}
