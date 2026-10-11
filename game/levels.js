/**
 * game/levels.js - All puzzle levels
 *
 * Level structure:
 * {
 *   id: string,                   // e.g. '1-1'
 *   chapter: number,
 *   name: string,
 *   flavour: string,              // lore text
 *   start: { kind, site? },       // start state
 *   T: number,                    // total evolution time
 *   epochs: number,               // E
 *   noise: number,                // p per qubit per layer (0 = noiseless)
 *   ceiling: { error: number },   // must stay below this
 *   caps: { cost?, depth? },      // budget limits
 *   par: { cost, depth, error },  // target par scores
 *   hint: string,                 // player hint
 *   unlockRequires: string[],     // required level ids
 * }
 */

export const LEVELS = [
  // ── Chapter 1: Single Bond ────────────────────────────────────────
  {
    id: '1-1',
    chapter: 1,
    name: 'First Filament',
    flavour: 'A single tendril awakens between two nodes. Learn how one bond evolves.',
    start: { kind: 'single', site: 3 },
    T: 1.0,
    epochs: 1,
    noise: 0,
    ceiling: { error: 0.80 },
    caps: {},
    par: { cost: 6, depth: 6, error: 0.64 },
    hint: 'Place all 6 bonds in order. Try different orderings to reduce error.',
    unlockRequires: [],
  },
  {
    id: '1-2',
    chapter: 1,
    name: 'Two-Bond Path',
    flavour: 'The network extends. Two bonds, one epoch.',
    start: { kind: 'single', site: 0 },
    T: 0.8,
    epochs: 1,
    noise: 0,
    ceiling: { error: 0.55 },
    caps: {},
    par: { cost: 6, depth: 6, error: 0.42 },
    hint: 'Bonds 0 and 1 share qubit 1 — order matters! Try bond 0 before 1 vs after.',
    unlockRequires: ['1-1'],
  },
  {
    id: '1-3',
    chapter: 1,
    name: 'Branch Point',
    flavour: 'Three bonds meet at node 1. Commute the disjoint ones.',
    start: { kind: 'single', site: 3 },
    T: 1.2,
    epochs: 2,
    noise: 0,
    ceiling: { error: 0.35 },
    caps: {},
    par: { cost: 6, depth: 12, error: 0.28 },
    hint: 'Bonds 1 (1-2) and 2 (1-3) commute with bond 3 (3-4). Use disjoint layers.',
    unlockRequires: ['1-2'],
  },

  // ── Chapter 2: Multi-Epoch + Error Scaling ─────────────────────
  {
    id: '2-1',
    chapter: 2,
    name: 'Repeated Epochs',
    flavour: 'The spore clock ticks. Repeat the same pattern across three epochs.',
    start: { kind: 'single', site: 3 },
    T: 1.5,
    epochs: 3,
    noise: 0,
    ceiling: { error: 0.55 },
    caps: { cost: 6 },
    par: { cost: 6, depth: 18, error: 0.46 },
    hint: 'Use the macro system to repeat epoch 0 in epochs 1 and 2. Cost counts once.',
    unlockRequires: ['1-3'],
  },
  {
    id: '2-2',
    chapter: 2,
    name: 'Second Order',
    flavour: 'Forward, reverse — error falls as 1/E². Worth the extra layer?',
    start: { kind: 'single', site: 3 },
    T: 1.0,
    epochs: 4,
    noise: 0,
    ceiling: { error: 0.10 },
    caps: { cost: 12, depth: 48 },
    par: { cost: 12, depth: 48, error: 0.041 },
    hint: 'Use ½ fraction forward then ½ backward. Watch the slope in the error trail.',
    unlockRequires: ['2-1'],
  },
  {
    id: '2-3',
    chapter: 2,
    name: 'Full Network',
    flavour: 'All six bonds. The mycelium breathes.',
    start: { kind: 'neel' },
    T: 1.0,
    epochs: 6,
    noise: 0,
    ceiling: { error: 0.30 },
    caps: { cost: 6, depth: 36 },
    par: { cost: 6, depth: 36, error: 0.22 },
    hint: 'With only 6 cost slots for 6 bonds, you get one slice per bond. Macro all epochs!',
    unlockRequires: ['2-2'],
  },

  // ── Chapter 3: Noisy Channels ─────────────────────────────────
  {
    id: '3-1',
    chapter: 3,
    name: 'First Spores',
    flavour: 'Dephasing creeps in. Fewer layers help, but so does accuracy.',
    start: { kind: 'single', site: 3 },
    T: 1.0,
    epochs: 4,
    noise: 0.02,
    ceiling: { error: 0.25 },
    caps: { depth: 30 },
    par: { cost: 6, depth: 24, error: 0.19 },
    hint: 'Each layer adds noise. Parallel layers (disjoint bonds in one layer) save depth.',
    unlockRequires: ['2-3'],
  },
  {
    id: '3-2',
    chapter: 3,
    name: 'Noisy Full Network',
    flavour: 'The forest is alive — and uncertain. Trade depth for accuracy.',
    start: { kind: 'neel' },
    T: 1.5,
    epochs: 6,
    noise: 0.03,
    ceiling: { error: 0.50 },
    caps: { cost: 6, depth: 40 },
    par: { cost: 6, depth: 36, error: 0.39 },
    hint: 'Group disjoint bond pairs (0&3, or 1&4, or 2&5) into single layers to save depth.',
    unlockRequires: ['3-1'],
  },

  // ── Chapter 4: Sparse Budget ───────────────────────────────────
  {
    id: '4-1',
    chapter: 4,
    name: 'Frugal Filaments',
    flavour: 'Four slices, max. Which bonds matter most here?',
    start: { kind: 'single', site: 1 },
    T: 0.5,
    epochs: 1,
    noise: 0,
    ceiling: { error: 0.80 },
    caps: { cost: 4 },
    par: { cost: 4, depth: 4, error: 0.615 },
    hint: 'Best 4 bonds in order 0→1→2→5 at this start state (site 1, T=0.5). Experiment!',
    unlockRequires: ['3-2'],
  },
  {
    id: '4-2',
    chapter: 4,
    name: 'Budget Sprint',
    flavour: 'Six slices to simulate six bonds over eight epochs. Use macros.',
    start: { kind: 'neel' },
    T: 2.0,
    epochs: 8,
    noise: 0,
    ceiling: { error: 0.40 },
    caps: { cost: 6 },
    par: { cost: 6, depth: 48, error: 0.33 },
    hint: 'One bond per slice. Macro all 8 epochs from one design. Best ordering wins.',
    unlockRequires: ['4-1'],
  },
];

/** Get a level by id. */
export function getLevel(id) {
  return LEVELS.find(l => l.id === id);
}

/** Get all unlocked levels given a set of completed ids. */
export function getUnlocked(completedIds) {
  return LEVELS.filter(l =>
    l.unlockRequires.every(req => completedIds.has(req))
  );
}

/** Get the next level after a given id. */
export function getNextLevel(id) {
  const idx = LEVELS.findIndex(l => l.id === id);
  return idx >= 0 && idx + 1 < LEVELS.length ? LEVELS[idx + 1] : null;
}
