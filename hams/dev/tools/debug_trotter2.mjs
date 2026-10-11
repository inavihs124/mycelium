// debug_trotter2.mjs - more detailed check
const repoRoot = 'C:/pirojectsssss/hams';

const { N, BONDS } = await import(`file://${repoRoot}/qollab/engine/constants.js`);
const { applyBondOperator } = await import(`file://${repoRoot}/qollab/engine/bond.js`);
const { singleFlipState, stateError, copyState } = await import(`file://${repoRoot}/qollab/engine/state.js`);
const { exactEvolution } = await import(`file://${repoRoot}/qollab/engine/ghost.js`);
const { expandMacros, secondOrderSchedule, firstOrderSchedule } = await import(`file://${repoRoot}/qollab/engine/schedule.js`);

const T = 1.0;
const psi0 = singleFlipState(3);
const psiExact = exactEvolution(psi0, T);
const order = [0,1,2,3,4,5];

// Manually execute 8-step second order Trotter
const steps = 8;
const D = T / steps;

let psi = copyState(psi0);

// Do one step manually: forward 0.5*D per bond, then reverse
for (let s = 0; s < steps; s++) {
  // Forward
  for (const bi of order) {
    const [qi, qj, J] = BONDS[bi];
    const theta = J * 0.5 * D;
    applyBondOperator(psi.re, psi.im, qi, qj, theta);
  }
  // Reverse
  for (let i = order.length - 1; i >= 0; i--) {
    const bi = order[i];
    const [qi, qj, J] = BONDS[bi];
    const theta = J * 0.5 * D;
    applyBondOperator(psi.re, psi.im, qi, qj, theta);
  }
}

const err_manual = stateError(psi, psiExact);
console.log('Manual 8-step 2nd order error:', err_manual.toFixed(6), '(expected ~0.0317)');

// Now check what the schedule executor does
const sched = secondOrderSchedule(order, steps);
const expanded = expandMacros(sched);
console.log('Expanded epochs:', expanded.epochs.length);
console.log('Layers per epoch:', expanded.epochs[0].layers.length);
console.log('Slices in layer 0:', JSON.stringify(expanded.epochs[0].layers[0]));

// Manually trace the executor with the schedule
let psi2 = copyState(psi0);
let totalLayers = 0;
for (const epoch of expanded.epochs) {
  for (const layer of epoch.layers) {
    totalLayers++;
    for (const slice of layer.slices) {
      const [qi, qj, J] = BONDS[slice.bondIndex];
      const theta = J * slice.fraction * D;
      applyBondOperator(psi2.re, psi2.im, qi, qj, theta);
    }
  }
}
const err_sched = stateError(psi2, psiExact);
console.log('Schedule trace error:', err_sched.toFixed(6));
console.log('Total layers:', totalLayers, '(expected 96 for 8 steps × 12 layers)');

// Compare single step D
console.log('\nD =', D);
console.log('Single step theta for bond 0 (J=1):', 1.0 * 0.5 * D);
