/**
 * quantum/quantum_bridge.js
 * Qollab JS→Python bridge for the quantum modules.
 *
 * This file is imported by app.js (indirectly via callPromising).
 * It wraps Python functions so they can be called from JS.
 *
 * Qollab provides: callPromising(pythonCallable, arg) -> Promise<string>
 * This is a global available in the Qollab JS runtime.
 *
 * Usage:
 *   import { runVerification, runSelftest } from './quantum/quantum_bridge.js';
 *   const result = await runVerification(config);
 *   const badge = await runSelftest();
 */

/**
 * Run the quantum verification check.
 * @param {object} config - { schedule, level, tier, shots, ref_steps }
 * @returns {Promise<object>} Parsed result from verify.py
 */
export async function runVerification(config) {
  const json = JSON.stringify(config);
  const resultJson = await callPromising('quantum.verify.run_verification', json);
  return JSON.parse(resultJson);
}

/**
 * Run the startup self-test.
 * @param {string|null} goldensJson - GOLDENS from data/goldens.js as JSON string
 * @returns {Promise<object>} Parsed badge from selftest.py
 */
export async function runSelftest(goldensJson = null) {
  const resultJson = await callPromising('quantum.selftest.run_selftest', goldensJson || '');
  return JSON.parse(resultJson);
}
