// verify_4_1.mjs - manually test level 4-1 with 4-bond subset schedules
const repoRoot = 'C:/pirojectsssss/hams';

const { BONDS } = await import(`file://${repoRoot}/qollab/engine/constants.js`);
const { singleFlipState, stateError } = await import(`file://${repoRoot}/qollab/engine/state.js`);
const { exactEvolution } = await import(`file://${repoRoot}/qollab/engine/ghost.js`);
const { executeScheduleFinal } = await import(`file://${repoRoot}/qollab/engine/schedule.js`);

// Level 4-1: site=1, T=0.5, E=1, caps.cost=4
const psi0 = singleFlipState(1);
const T = 0.5, E = 1;
const D = T / E;
const psiExact = exactEvolution(psi0, T);

// Try all 4-bond subsets from 6 bonds
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  const withHead = combinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i);
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

const subsets = combinations([0,1,2,3,4,5], 4);
let bestError = Infinity, bestSched = null;

for (const subset of subsets) {
  for (const order of permutations(subset)) {
    const schedule = {
      epochs: [{
        layers: order.map(bi => ({ slices: [{ bondIndex: bi, fraction: 1 }] }))
      }],
      macroLinks: {},
    };
    const final = executeScheduleFinal(psi0, schedule, T, E);
    const err = stateError(final, psiExact);
    if (err < bestError) {
      bestError = err;
      bestSched = { subset, order };
    }
  }
}

console.log(`Level 4-1 best 4-bond schedule: error=${bestError.toFixed(4)}`);
console.log(`  Subset: bonds [${bestSched.subset}] in order [${bestSched.order}]`);
console.log(`  Par (with 5% slack): ${(bestError * 1.05).toFixed(4)}`);
