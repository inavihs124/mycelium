/**
 * game/sequencer.js - Underground Root Cavern Sequencer
 *
 * Implements:
 * - 6 Root Lanes with root thickness mapped to coupling J
 * - Spore Pod chips with pod size mapped to slice fraction (1, ½, ¼, ⅛)
 * - Hub bond (1–3) glowing violet
 * - Bloom / budget circles showing placed fraction
 * - Time strata header (T1..T8)
 * - Accessible keyboard navigation (Arrow keys, Space/Enter, Delete)
 */

import { BONDS } from '../engine/constants.js';
import { actions, getState } from './store.js';

const BOND_METAS = [
  { qi: 0, qj: 1, J: 1.0, isHub: false, label: '0–1' },
  { qi: 1, qj: 2, J: 0.8, isHub: false, label: '1–2' },
  { qi: 1, qj: 3, J: 0.8, isHub: true,  label: '1–3 ★' },
  { qi: 3, qj: 4, J: 0.6, isHub: false, label: '3–4' },
  { qi: 3, qj: 5, J: 0.6, isHub: false, label: '3–5' },
  { qi: 5, qj: 6, J: 0.5, isHub: false, label: '5–6' },
];

let _grid = null;
let _epochTabs = null;

export function initSequencer(gridEl, tabsEl) {
  _grid = gridEl;
  _epochTabs = tabsEl;
}

export function renderSequencer(state) {
  if (!_grid || !_epochTabs) return;

  const { schedule, level, selectedEpochIdx, selectedFraction, cursorRow, cursorCol, isRunning, runLayerIndex } = state;
  const E = level.epochs;

  // ── 1. Epoch Tabs (Left Rail) ───────────────────────────────────
  _epochTabs.innerHTML = '';
  for (let e = 0; e < E; e++) {
    const isLinked = schedule.macroLinks && schedule.macroLinks[e] !== undefined;
    const tab = document.createElement('button');
    tab.className = 'epoch-tab' + (e === selectedEpochIdx ? ' active' : '') +
                    (isLinked ? ' macro-linked' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', e === selectedEpochIdx ? 'true' : 'false');
    tab.setAttribute('aria-controls', 'sequencer-grid');
    tab.setAttribute('id', `epoch-tab-${e}`);
    tab.textContent = isLinked
      ? `🌱${e + 1}`
      : `E${e + 1}`;
    tab.title = isLinked
      ? `Linked to E${schedule.macroLinks[e] + 1}`
      : `Epoch ${e + 1}`;
    tab.dataset.epochIdx = e;
    tab.addEventListener('click', () => actions.setSelectedEpoch(e));
    _epochTabs.appendChild(tab);
  }

  // ── 2. Time Strata Header ────────────────────────────────────────
  const epochIdx = selectedEpochIdx;
  const isLinked = schedule.macroLinks && schedule.macroLinks[epochIdx] !== undefined;
  const sourceEpochIdx = isLinked ? schedule.macroLinks[epochIdx] : epochIdx;
  const epoch = schedule.epochs[sourceEpochIdx] || { layers: [] };
  const layers = epoch.layers;
  const numCols = Math.max(layers.length + 2, 8);

  const timeHeader = document.getElementById('sequencer-time-header');
  if (timeHeader) {
    const dt = (level.T / (E * numCols)).toFixed(3);
    timeHeader.innerHTML = `
      <div class="time-header-label">
        <span>Bond Lane</span>
        <span>Bloom</span>
      </div>
      <div class="time-header-cols" style="grid-template-columns: repeat(${numCols}, 1fr)">
        ${Array.from({ length: numCols }, (_, i) => `
          <div class="time-col-item ${i === runLayerIndex && isRunning ? 'active' : ''}">
            <span>T=${i + 1}</span>
            <span class="time-col-sec">${(i * (level.T / E) / numCols).toFixed(3)}s</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── 3. Six Root Lanes (Sequencer Grid) ───────────────────────────
  _grid.innerHTML = '';
  const nBonds = BONDS.length;

  for (let row = 0; row < nBonds; row++) {
    const meta = BOND_METAS[row] || { J: BONDS[row][2], label: `${BONDS[row][0]}–${BONDS[row][1]}`, isHub: false };
    const J = BONDS[row][2];

    // Compute fraction placed in this bond row
    let bondFraction = 0;
    for (const layer of layers) {
      for (const s of layer.slices) {
        if (s.bondIndex === row) bondFraction += s.fraction;
      }
    }
    const isComplete = bondFraction >= 0.999 && bondFraction <= 1.001;

    // Row Container
    const rowEl = document.createElement('div');
    rowEl.className = 'seq-lane-row';
    rowEl.setAttribute('role', 'row');

    // Lane Info (Left Header)
    const infoEl = document.createElement('div');
    infoEl.className = 'seq-bond-info';
    infoEl.title = `Bond ${meta.label}, J=${J.toFixed(2)}`;

    // Bloom circle dash offset calculation
    const circum = 2 * Math.PI * 7.5;
    const progressOffset = Math.max(0, circum * (1 - Math.min(1, bondFraction)));

    infoEl.innerHTML = `
      <div class="bond-ident">
        <div class="bond-pill ${meta.isHub ? 'pill-hub' : ''}"></div>
        <div>
          <span class="bond-names ${meta.isHub ? 'text-cyan' : ''}">${meta.label}</span>
          <span class="bond-j">J = ${J.toFixed(2)} ${meta.isHub ? '(Hubs)' : ''}</span>
        </div>
      </div>
      <div class="bond-budget-circle">
        <svg width="20" height="20" class="-rotate-90" style="transform: rotate(-90deg)">
          <circle cx="10" cy="10" r="7.5" stroke="#122522" stroke-width="2" fill="none"/>
          <circle cx="10" cy="10" r="7.5" stroke="${meta.isHub ? '#c77dff' : '#1fd1a5'}" stroke-width="2" fill="none"
            stroke-dasharray="${circum}" stroke-dashoffset="${progressOffset}"/>
        </svg>
        <span class="budget-frac-text font-mono-num" style="color: ${isComplete ? '#1fd1a5' : '#8b9bb4'}">
          ${bondFraction >= 1 ? '1/1' : bondFraction.toFixed(1)}
        </span>
      </div>
    `;
    rowEl.appendChild(infoEl);

    // Cells Container
    const cellsEl = document.createElement('div');
    cellsEl.className = 'seq-cells-strip';
    cellsEl.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;

    // Root line thickness maps to J: thickness = 1 + J * 3 px
    const rootLineThickness = Math.max(1, Math.round(1 + J * 2.5));

    for (let col = 0; col < numCols; col++) {
      const cell = document.createElement('div');
      cell.className = 'seq-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute('role', 'gridcell');

      if (row === cursorRow && col === cursorCol) {
        cell.classList.add('cursor-focus');
      }

      // Root line background
      const rootLine = document.createElement('div');
      rootLine.className = 'seq-root-line';
      rootLine.style.height = `${rootLineThickness}px`;
      if (meta.isHub) rootLine.style.background = '#4a2663';
      cell.appendChild(rootLine);

      // Check if slice placed in this cell
      const layer = layers[col];
      let hasSlice = false;
      if (layer) {
        const sliceIdx = layer.slices.findIndex(s => s.bondIndex === row);
        if (sliceIdx >= 0) {
          hasSlice = true;
          cell.classList.add('has-slice');
          const slice = layer.slices[sliceIdx];

          // Pod size = slice fraction
          const pod = document.createElement('div');
          const fracClass = fracClassName(slice.fraction);
          pod.className = `seq-spore-pod ${fracClass}` + (meta.isHub ? ' pod-hub' : '');
          pod.textContent = fracLabel(slice.fraction);
          pod.title = `Bond ${meta.label}, fraction ${slice.fraction}. Click to remove.`;
          pod.setAttribute('aria-label', `Placed spore pod ${slice.fraction} on bond ${meta.label}, layer ${col + 1}`);

          pod.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isLinked) {
              actions.removeSlice(sourceEpochIdx, col, sliceIdx);
            }
          });
          cell.appendChild(pod);
        }
      }

      if (!hasSlice) {
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', `Bond ${meta.label}, layer ${col + 1}: empty. Click to place ${selectedFraction}.`);
        cell.addEventListener('click', () => {
          if (isLinked) return;
          placeSliceAt(sourceEpochIdx, col, row, state.selectedFraction);
        });
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (!isLinked) placeSliceAt(sourceEpochIdx, col, row, state.selectedFraction);
            e.preventDefault();
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
            // Nothing to delete in empty cell
          }
          handleGridKeyboard(e, row, col, nBonds, numCols);
        });
      } else {
        cell.setAttribute('tabindex', '0');
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            const currentLayer = layers[col];
            if (currentLayer && !isLinked) {
              const currentSliceIdx = currentLayer.slices.findIndex(s => s.bondIndex === row);
              if (currentSliceIdx >= 0) {
                actions.removeSlice(sourceEpochIdx, col, currentSliceIdx);
              }
            }
            e.preventDefault();
          }
          handleGridKeyboard(e, row, col, nBonds, numCols);
        });
      }

      cellsEl.appendChild(cell);
    }

    rowEl.appendChild(cellsEl);
    _grid.appendChild(rowEl);
  }

  // ── 4. Subterranean Status Bar ────────────────────────────────────
  updateBudgetStatus(state, isLinked);
}

function placeSliceAt(epochIdx, layerIdx, bondIndex, fraction) {
  const state = getState();
  const epoch = state.schedule.epochs[epochIdx];

  let existing = 0;
  if (epoch) {
    for (const layer of epoch.layers) {
      for (const s of layer.slices) {
        if (s.bondIndex === bondIndex) existing += s.fraction;
      }
    }
  }

  if (existing + fraction > 1.001) {
    const live = document.getElementById('aria-live');
    if (live) live.textContent = `Bond ${bondIndex} already has ${existing.toFixed(2)} fraction placed. Budget exceeded.`;
    return;
  }

  actions.placeSlice(epochIdx, layerIdx, bondIndex, fraction);
}

function updateBudgetStatus(state, isLinked) {
  const budgetEl = document.getElementById('budget-status');
  if (!budgetEl) return;

  if (isLinked) {
    budgetEl.innerHTML = `<span>Epoch ${state.selectedEpochIdx + 1} is a linked copy of Epoch ${state.schedule.macroLinks[state.selectedEpochIdx] + 1}.</span>`;
    return;
  }

  const { level, schedule } = state;
  const par = level.par || {};
  const caps = level.caps || {};
  const cost = countCostLocal(schedule);
  const depth = countDepthLocal(schedule);

  const parCost = par.cost ?? 12;
  const parDepth = par.depth ?? 48;

  budgetEl.innerHTML = `
    <span>Cost: <strong class="text-cyan">${cost}</strong> / Par ${parCost}</span>
    <span class="text-dim">·</span>
    <span>Depth: <strong class="text-violet" style="color:var(--spore-violet)">${depth}</strong> / Par ${parDepth}</span>
    <span class="text-dim">·</span>
    <span class="text-teal font-semibold">Sequencer Synchronized: 2nd-Order Trotter S₂(t) Active</span>
  `;
}

function countCostLocal(schedule) {
  let cost = 0;
  const counted = new Set();
  for (let i = 0; i < schedule.epochs.length; i++) {
    const src = schedule.macroLinks && schedule.macroLinks[i] !== undefined
      ? schedule.macroLinks[i] : i;
    if (counted.has(src)) continue;
    counted.add(src);
    for (const layer of schedule.epochs[src].layers) {
      cost += layer.slices.length;
    }
  }
  return cost;
}

function countDepthLocal(schedule) {
  let depth = 0;
  for (let i = 0; i < schedule.epochs.length; i++) {
    const src = schedule.macroLinks && schedule.macroLinks[i] !== undefined
      ? schedule.macroLinks[i] : i;
    depth += schedule.epochs[src].layers.length;
  }
  return depth;
}

function fracClassName(f) {
  if (f === 1) return 'pod-frac-1';
  if (f === 0.5) return 'pod-frac-0_5';
  if (f === 0.25) return 'pod-frac-0_25';
  return 'pod-frac-0_125';
}

function fracLabel(f) {
  if (f === 1) return '1';
  if (f === 0.5) return '½';
  if (f === 0.25) return '¼';
  if (f === 0.125) return '⅛';
  return f.toString();
}

function handleGridKeyboard(e, row, col, nRows, nCols) {
  const moves = {
    'ArrowUp':    [-1,  0],
    'ArrowDown':  [ 1,  0],
    'ArrowLeft':  [ 0, -1],
    'ArrowRight': [ 0,  1],
  };
  if (moves[e.key]) {
    const [dr, dc] = moves[e.key];
    const newRow = Math.max(0, Math.min(nRows - 1, row + dr));
    const newCol = Math.max(0, Math.min(nCols - 1, col + dc));
    actions.setCursor(newRow, newCol);
    const cell = _grid.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`);
    if (cell) cell.focus();
    e.preventDefault();
  }
}
