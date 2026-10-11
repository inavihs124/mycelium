// debug_trotter.mjs
const repoRoot = 'C:/pirojectsssss/hams';

const { singleFlipState, stateError } = await import(`file://${repoRoot}/qollab/engine/state.js`);
const { exactEvolution } = await import(`file://${repoRoot}/qollab/engine/ghost.js`);
const { executeScheduleFinal, firstOrderSchedule, secondOrderSchedule } = await import(`file://${repoRoot}/qollab/engine/schedule.js`);

const T = 1.0;
const psi0 = singleFlipState(3);
const psiExact = exactEvolution(psi0, T);
const order = [0,1,2,3,4,5];

// Test with steps=8
const steps = 8;
const sched2 = secondOrderSchedule(order, steps);
console.log('Second order schedule epochs:', sched2.epochs.length);
console.log('Macro links:', JSON.stringify(sched2.macroLinks));
console.log('Layers in epoch 0:', sched2.epochs[0].layers.length);
console.log('First slice:', JSON.stringify(sched2.epochs[0].layers[0].slices[0]));

const final = executeScheduleFinal(psi0, sched2, T, steps);
const err = stateError(final, psiExact);
console.log('8-step 2nd order error:', err.toFixed(6), '(expected ~0.0317)');

// Also test 1-epoch case 
const sched2_1 = secondOrderSchedule(order, 1);
const final1 = executeScheduleFinal(psi0, sched2_1, T, 1);
const err1 = stateError(final1, psiExact);
console.log('1-step 2nd order error:', err1.toFixed(6), '(should be ~0.83)');

// Test first order 8 steps
const sched1 = firstOrderSchedule(order, steps);
const final1st = executeScheduleFinal(psi0, sched1, T, steps);
const err1st = stateError(final1st, psiExact);
console.log('8-step 1st order error:', err1st.toFixed(6), '(expected ~0.38)');
