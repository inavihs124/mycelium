// debug_codec.mjs
const repoRoot = 'C:/pirojectsssss/hams';
const { encodeSchedule, decodeSchedule, verifyRoundTrip } = await import(`file://${repoRoot}/qollab/engine/codec.js`);

const schedule = {
  epochs: [
    { layers: [
      { slices: [{ bondIndex: 0, fraction: 0.5 }, { bondIndex: 3, fraction: 1 }] },
      { slices: [{ bondIndex: 1, fraction: 0.25 }] },
    ]},
    { layers: [
      { slices: [{ bondIndex: 2, fraction: 0.125 }] },
    ]},
  ],
  macroLinks: { 2: 1 },
};

const code = encodeSchedule('1-1', schedule);
console.log('Encoded code:', code);

const decoded = decodeSchedule(code);
console.log('Decoded:', JSON.stringify(decoded, null, 2));

// The issue: macroLinks: {2: 1} but schedule.epochs only has 2 entries (0 and 1)
// Epoch 2 is linked to epoch 1 but it doesn't exist in epochs array!
// The test is wrong — the schedule should have 3 epochs with epoch 2 as placeholder.
