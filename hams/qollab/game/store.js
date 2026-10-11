/**
 * game/store.js - Reactive state store (no framework)
 * 
 * Central state for the game. All mutations go through actions.
 * Listeners are called after each mutation.
 */

const _listeners = new Set();
let _state = null;

/** Subscribe to state changes. Returns unsubscribe function. */
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Notify all listeners with current state. */
function notify() {
  for (const fn of _listeners) {
    try { fn(_state); } catch (e) { console.error('Store listener error:', e); }
  }
}

/** Get current state (read-only copy). */
export function getState() {
  return _state;
}

/** Initialize the store with a level. */
export function initStore(level, startSchedule) {
  _state = {
    level,
    schedule: startSchedule || emptySchedule(level),
    // History for undo/redo
    history: [],
    historyIndex: -1,
    // Simulation results
    machineState: null,
    machineCheckpoints: [],
    machineLayerStates: [],
    ghostState: null,
    ghostCheckpoints: [],
    // Scores
    scores: null,
    epochErrors: [],
    // UI state
    selectedFraction: 1,
    selectedEpochIdx: 0,
    cursorRow: 0,  // bond row
    cursorCol: 0,  // layer col
    isRunning: false,
    runLayerIndex: 0,
    animationSpeed: 'normal',
    // Quantum check
    qcResult: null,
    qcRunning: false,
    qcJobSent: false,
    // Self-test badge
    selftestBadge: null,
    // Entropy (computed lazily)
    cutEntropies: null,
  };
  // Push initial snapshot to history
  _pushHistory();
  notify();
}

function emptySchedule(level) {
  const epochs = [];
  for (let e = 0; e < level.epochs; e++) {
    epochs.push({ layers: [] });
  }
  return { epochs, macroLinks: {} };
}

/** Commit current schedule to history (call before any mutation). */
function _pushHistory() {
  const snapshot = JSON.stringify(_state.schedule);
  // Trim redo branch
  _state.history = _state.history.slice(0, _state.historyIndex + 1);
  _state.history.push(snapshot);
  _state.historyIndex = _state.history.length - 1;
  // Keep history bounded
  if (_state.history.length > 100) {
    _state.history.shift();
    _state.historyIndex--;
  }
}

export const actions = {
  /** Place a slice at (epochIdx, layerIdx, bondIndex, fraction). */
  placeSlice(epochIdx, layerIdx, bondIndex, fraction) {
    _pushHistory();
    const epoch = _state.schedule.epochs[epochIdx];
    // Ensure layer exists
    while (epoch.layers.length <= layerIdx) {
      epoch.layers.push({ slices: [] });
    }
    epoch.layers[layerIdx].slices.push({ bondIndex, fraction });
    _state.scores = null;
    notify();
  },

  /** Remove a slice from (epochIdx, layerIdx, sliceIdx). */
  removeSlice(epochIdx, layerIdx, sliceIdx) {
    _pushHistory();
    const layer = _state.schedule.epochs[epochIdx].layers[layerIdx];
    layer.slices.splice(sliceIdx, 1);
    // Remove empty layers
    if (layer.slices.length === 0) {
      _state.schedule.epochs[epochIdx].layers.splice(layerIdx, 1);
    }
    _state.scores = null;
    notify();
  },

  /** Undo last action. */
  undo() {
    if (_state.historyIndex <= 0) return;
    _state.historyIndex--;
    _state.schedule = JSON.parse(_state.history[_state.historyIndex]);
    _state.scores = null;
    notify();
  },

  /** Redo last undone action. */
  redo() {
    if (_state.historyIndex >= _state.history.length - 1) return;
    _state.historyIndex++;
    _state.schedule = JSON.parse(_state.history[_state.historyIndex]);
    _state.scores = null;
    notify();
  },

  /** Set macro link. */
  setMacroLink(epochIdx, sourceIdx) {
    _pushHistory();
    if (sourceIdx === null) {
      delete _state.schedule.macroLinks[epochIdx];
    } else {
      _state.schedule.macroLinks[epochIdx] = sourceIdx;
    }
    notify();
  },

  setSelectedFraction(f) {
    _state.selectedFraction = f;
    notify();
  },

  setSelectedEpoch(idx) {
    _state.selectedEpochIdx = idx;
    notify();
  },

  setCursor(row, col) {
    _state.cursorRow = row;
    _state.cursorCol = col;
    notify();
  },

  setRunning(running) {
    _state.isRunning = running;
    notify();
  },

  setRunLayerIndex(idx) {
    _state.runLayerIndex = idx;
    notify();
  },

  setSimResults({ machineState, machineCheckpoints, machineLayerStates,
                  ghostState, ghostCheckpoints, scores, epochErrors, cutEntropies }) {
    _state.machineState = machineState;
    _state.machineCheckpoints = machineCheckpoints;
    _state.machineLayerStates = machineLayerStates;
    _state.ghostState = ghostState;
    _state.ghostCheckpoints = ghostCheckpoints;
    _state.scores = scores;
    _state.epochErrors = epochErrors;
    _state.cutEntropies = cutEntropies;
    notify();
  },

  setQCResult(result) {
    _state.qcResult = result;
    _state.qcRunning = false;
    _state.qcJobSent = true;
    notify();
  },

  setQCRunning(running) {
    _state.qcRunning = running;
    notify();
  },

  setSelftestBadge(badge) {
    _state.selftestBadge = badge;
    notify();
  },

  loadSchedule(schedule) {
    _pushHistory();
    _state.schedule = schedule;
    _state.scores = null;
    notify();
  },
};
