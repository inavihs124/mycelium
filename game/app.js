/**
 * game/app.js - Main application: wires everything together
 */

import { initStore, subscribe, getState, actions } from './store.js';
import { getLevel, getNextLevel, LEVELS } from './levels.js';
import { renderPanoramicScene, setViewMode, getViewMode, renderTrail, renderDataTable } from './render.js';
import { initSequencer, renderSequencer } from './sequencer.js';
import { encodeSchedule, decodeSchedule } from '../engine/codec.js';
import { singleFlipState, neelState } from '../engine/state.js';
import { executeSchedule } from '../engine/schedule.js';
import { exactEvolution, ghostCheckpoints } from '../engine/ghost.js';
import { computeScores, epochErrors as computeEpochErrors } from '../engine/score.js';
import { allCutEntropies } from '../engine/entropy.js';

// ── DOM references ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

let _currentLevelId = null;

export function initApp() {
  // Initialize sequencer UI (DOM must exist by now)
  initSequencer($('sequencer-grid'), $('epoch-tabs'));

  // Read level from URL hash or use first level
  const hash = location.hash.replace('#', '');
  const startLevel = LEVELS.find(l => l.id === hash) || LEVELS[0];
  _currentLevelId = startLevel.id;

  // Load the level
  loadLevel(startLevel.id);

  // Wire toolbar buttons
  $('btn-run').addEventListener('click', () => runSchedule());
  if ($('btn-skip')) {
    $('btn-skip').addEventListener('click', () => {
      const state = getState();
      if (state) runSimulation(state, { animate: false });
    });
  }
  $('btn-reset').addEventListener('click', () => resetToStart());
  $('btn-undo').addEventListener('click', () => actions.undo());
  $('btn-redo').addEventListener('click', () => actions.redo());
  $('btn-theme').addEventListener('click', toggleTheme);
  $('btn-motion').addEventListener('click', toggleMotion);
  $('btn-math').addEventListener('click', toggleMathDrawer);
  $('btn-math-close').addEventListener('click', toggleMathDrawer);
  $('btn-macro').addEventListener('click', openMacroDialog);
  $('btn-qcheck').addEventListener('click', runQuantumCheck);
  $('btn-copy-code').addEventListener('click', copyCode);
  $('btn-next-level').addEventListener('click', goNextLevel);
  $('btn-optimize').addEventListener('click', () => $('result-overlay').hidden = true);
  $('btn-paste-code').addEventListener('click', loadFromCode);
  $('btn-help-close').addEventListener('click', () => $('help-dialog').close());

  // View Switcher Buttons
  ['machine', 'ghost', 'both', 'drift'].forEach(mode => {
    const btn = $(`view-${mode}`);
    if (btn) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
        setViewMode(mode);
        renderAll(getState());
      });
    }
  });

  // Fraction palette
  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.palette-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      actions.setSelectedFraction(parseFloat(btn.dataset.fraction));
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleGlobalKey);

  // Subscribe to state changes and re-render
  subscribe(renderAll);

  // Window resize
  window.addEventListener('resize', () => renderAll(getState()));

  // Hash change (level navigation)
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && id !== _currentLevelId) loadLevel(id);
  });

  // Run self-test in background
  runSelftest();
}

// ── Level loading ────────────────────────────────────────────────────
function loadLevel(id) {
  const level = getLevel(id);
  if (!level) return;

  _currentLevelId = id;
  location.hash = '#' + id;

  // Header
  $('level-title').textContent = `${level.id}: ${level.name}`;
  $('val-T').textContent = level.T;
  $('val-E').textContent = level.epochs;
  $('val-p').textContent = level.noise;
  $('param-p').hidden = level.noise === 0;

  // Enable run button
  $('btn-run').disabled = false;

  // Init store
  const emptySchedule = {
    epochs: Array.from({ length: level.epochs }, () => ({ layers: [] })),
    macroLinks: {},
  };
  initStore(level, emptySchedule);

  // Populate math drawer
  populateMathDrawer(level);

  // Run simulation with empty schedule to show start state
  runSimulation(getState());
}

// ── Simulation ───────────────────────────────────────────────────────
function runSchedule() {
  const state = getState();
  if (!state || state.isRunning) return;

  runSimulation(state, { animate: true });
}

function resetToStart() {
  const state = getState();
  if (!state) return;

  // Reset panels to start state
  const psi0 = makeStartState(state.level.start);
  const ghostState = exactEvolution(psi0, state.level.T);

  actions.setSimResults({
    machineState: psi0,
    machineCheckpoints: [],
    machineLayerStates: [psi0],
    ghostState,
    ghostCheckpoints: [],
    scores: null,
    epochErrors: [],
    cutEntropies: allCutEntropies(psi0),
  });
}

async function runSimulation(state, opts = {}) {
  const { animate = false } = opts;
  const { level, schedule } = state;

  const psi0 = makeStartState(level.start);
  const T = level.T;
  const E = level.epochs;

  // Execute schedule
  const result = executeSchedule(psi0, schedule, T, E);
  const { finalState, checkpoints: machineCheckpoints, layerStates: machineLayerStates } = result;

  // Ghost (exact) at checkpoints
  const ghostCPs = ghostCheckpoints(psi0, T, E);
  const ghostFinal = exactEvolution(psi0, T);

  // Scores
  const scores = computeScores(schedule, finalState, ghostFinal, level);
  const epochErrs = computeEpochErrors(machineCheckpoints, ghostCPs);

  // Entropies
  const cutEntropies = allCutEntropies(finalState);

  if (animate && machineLayerStates.length > 1) {
    actions.setRunning(true);
    await animateLayers(machineLayerStates, ghostCPs, schedule, level, scores, epochErrs, cutEntropies);
    actions.setRunning(false);
  }

  actions.setSimResults({
    machineState: finalState,
    machineCheckpoints,
    machineLayerStates,
    ghostState: ghostFinal,
    ghostCheckpoints: ghostCPs,
    scores,
    epochErrors: epochErrs,
    cutEntropies,
  });

  // Show result overlay if schedule has any slices
  if (scores && scores.executedSlices > 0) {
    checkPassFail(scores, level);
  }
}

async function animateLayers(layerStates, ghostCPs, schedule, level, scores, epochErrs, cutEntropies) {
  const delay = getAnimDelay();
  const ghostFinal = exactEvolution(makeStartState(level.start), level.T);

  for (let i = 0; i < layerStates.length; i++) {
    actions.setRunLayerIndex(i);

    const interimScores = computeScores(
      schedule, layerStates[i], ghostFinal, level
    );

    actions.setSimResults({
      machineState: layerStates[i],
      machineCheckpoints: [],
      machineLayerStates: layerStates,
      ghostState: ghostFinal,
      ghostCheckpoints: ghostCPs,
      scores: interimScores,
      epochErrors: epochErrs,
      cutEntropies,
    });

    await sleep(delay);
  }
}

function getAnimDelay() {
  if (document.body.dataset.reducedMotion === 'true') return 10;
  const speed = document.body.dataset.animSpeed || 'normal';
  if (speed === 'fast') return 80;
  if (speed === 'slow') return 400;
  return 180;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeStartState(spec) {
  if (spec.kind === 'single') return singleFlipState(spec.site ?? 3);
  return neelState();
}

// ── Rendering ────────────────────────────────────────────────────────
function renderAll(state) {
  if (!state) return;

  const machineState = state.machineState;
  const ghostState = state.ghostState;

  // Single continuous panoramic scene
  const forestSvg = $('panorama-forest');
  if (forestSvg) {
    renderPanoramicScene(forestSvg, machineState, ghostState, {
      viewMode: getViewMode(),
      runLayerBond: state.runLayerIndex,
    });
  }

  // Update in-scene HUD badge and right dock readouts
  updateHUD(state);

  // Data tables inside the collapsible drawer
  renderDataTable($('table-machine'), machineState, { tableType: 'machine' });
  renderDataTable($('table-ghost'), ghostState, { tableType: 'ghost' });
  renderDataTable($('table-drift'), machineState, { tableType: 'drift', compareState: ghostState });

  // Scores
  renderScores(state);

  // Trail
  if (state.epochErrors && state.level) {
    renderTrail(
      $('trail-chart'),
      state.epochErrors,
      state.level.ceiling?.error ?? 0.2,
      state.level.par?.error,
    );
  }

  // Sequencer
  renderSequencer(state);

  // QC results
  if (state.qcResult) renderQCResults(state.qcResult);

  // Self-test badge
  if (state.selftestBadge) {
    const badge = $('verified-badge');
    if (badge) {
      badge.hidden = !state.selftestBadge.all_passed;
      badge.title = state.selftestBadge.message;
    }
  }
}

function updateHUD(state) {
  if (!state) return;
  const s = state.scores;
  const level = state.level;
  const hudT = $('hud-t');
  const hudMaxT = $('hud-T');
  const hudErr = $('hud-err');
  const hudFid = $('hud-fid');
  const hudCx = $('hud-cx');
  const hudDepth = $('hud-depth');

  if (hudMaxT && level) hudMaxT.textContent = level.T.toFixed(2);
  if (hudT && level) {
    const tVal = state.isRunning && state.machineLayerStates.length > 0
      ? (state.runLayerIndex / Math.max(1, state.machineLayerStates.length - 1)) * level.T
      : (s ? level.T : 0);
    hudT.textContent = tVal.toFixed(2);
  }
  if (hudErr) hudErr.textContent = s ? s.error.toFixed(4) : '—';
  if (hudFid) hudFid.textContent = s ? s.fidelity.toFixed(4) : '—';
  if (hudDepth) hudDepth.textContent = s ? s.depth : 0;
  if (hudCx) hudCx.textContent = s ? Math.max(12, s.depth * 2 + s.cost) : '—';

  // Readouts in Right Dock
  const valFid = $('val-fidelity');
  if (valFid) valFid.textContent = s ? `${(s.fidelity * 100).toFixed(2)}%` : '—';
  const valTrailErr = $('val-trail-err');
  if (valTrailErr) valTrailErr.textContent = s ? s.error.toFixed(4) : '—';
  const trailBadge = $('trail-count-badge');
  if (trailBadge && state.epochErrors) trailBadge.textContent = `${state.epochErrors.length} Checks`;

  // Leaf wilt text
  const leafStatus = $('leaf-status-text');
  if (leafStatus && s && level?.ceiling?.error) {
    const isHealthy = s.error <= level.ceiling.error;
    leafStatus.textContent = isHealthy ? 'Lush & Thriving' : 'Wilted & Stressed';
    leafStatus.style.color = isHealthy ? 'var(--teal)' : 'var(--blight-orange)';
  }
  const goalCeil = $('goal-ceiling-text');
  if (goalCeil && level?.ceiling?.error) {
    goalCeil.textContent = `Goal: < ${level.ceiling.error.toFixed(4)}`;
  }

  // Par achieved badge
  const parBadge = $('par-achieved-badge');
  if (parBadge && s) {
    parBadge.hidden = !s.passed;
  }
}

function renderScores(state) {
  const s = state.scores;
  const level = state.level;
  if (!level) return;

  const par = level.par || {};
  const caps = level.caps || {};
  const ceiling = level.ceiling || {};

  // Cost
  const cost = s ? s.cost : 0;
  $('val-cost').textContent = cost;
  const costMax = Math.max(par.cost || 20, caps.cost || 20, cost);
  updateBar('bar-cost', cost, costMax, 'par-cost', par.cost, 'cap-cost', caps.cost);

  // Depth
  const depth = s ? s.depth : 0;
  $('val-depth').textContent = depth;
  const depthMax = Math.max(par.depth || 60, caps.depth || 60, depth);
  updateBar('bar-depth', depth, depthMax, 'par-depth', par.depth, 'cap-depth', caps.depth);

  // Error
  const error = s ? s.error : null;
  $('val-error').textContent = error !== null ? error.toFixed(4) : '—';
  const errMax = Math.max(ceiling.error || 0.2, par.error || 0.1, error || 0);
  updateErrorBar('bar-error', error, errMax, 'par-error', par.error, 'ceiling-error', ceiling.error);
}

function updateBar(fillId, val, max, parId, parVal, capId, capVal) {
  const fill = $(fillId);
  if (fill) fill.style.width = Math.min(100, (val / max) * 100) + '%';
  const parEl = $(parId);
  if (parEl && parVal !== undefined) {
    parEl.style.left = Math.min(100, (parVal / max) * 100) + '%';
    parEl.hidden = false;
  }
  const capEl = $(capId);
  if (capEl && capVal !== undefined) {
    capEl.style.left = Math.min(100, (capVal / max) * 100) + '%';
    capEl.hidden = false;
  }
}

function updateErrorBar(fillId, val, max, parId, parVal, ceilId, ceilVal) {
  const fill = $(fillId);
  if (fill && val !== null) {
    const pct = Math.min(100, (val / max) * 100);
    fill.style.width = pct + '%';
    fill.style.background = val <= (ceilVal || Infinity)
      ? 'linear-gradient(90deg, var(--teal) 0%, var(--cyan) 100%)'
      : 'linear-gradient(90deg, var(--blight-orange) 0%, #f43f5e 100%)';
  }
  const parEl = $(parId);
  if (parEl && parVal !== undefined) {
    parEl.style.left = Math.min(100, (parVal / max) * 100) + '%';
    parEl.hidden = false;
  }
  const ceilEl = $(ceilId);
  if (ceilEl && ceilVal !== undefined) {
    ceilEl.style.left = Math.min(100, (ceilVal / max) * 100) + '%';
    ceilEl.hidden = false;
  }
}

// ── Pass/Fail Overlay ────────────────────────────────────────────────
function checkPassFail(scores, level) {
  if (!scores.passed) return;

  // Notify the title/map shell; it tracks progress for the current session.
  window.dispatchEvent(new CustomEvent('mycelium-level-completed', { detail: { levelId: level.id } }));

  const overlay = $('result-overlay');
  $('result-title').textContent = scores.passed ? '🍄 Mycelium Grows!' : '⚠ Not Yet';
  $('result-scores').innerHTML = `
    <div>Cost: <strong>${scores.cost}</strong> (par ${level.par?.cost ?? '—'})</div>
    <div>Depth: <strong>${scores.depth}</strong> (par ${level.par?.depth ?? '—'})</div>
    <div>Error: <strong>${scores.error.toFixed(4)}</strong> (ceiling ${level.ceiling?.error ?? '—'})</div>
    <div>Fidelity: <strong>${(scores.fidelity * 100).toFixed(2)}%</strong></div>
  `;

  const next = getNextLevel(level.id);
  $('btn-next-level').hidden = !next;
  if (next) $('btn-next-level').dataset.nextId = next.id;

  overlay.hidden = false;
  overlay.focus();
}

function copyCode() {
  const state = getState();
  if (!state) return;
  const code = encodeSchedule(state.level.id, state.schedule);
  navigator.clipboard?.writeText(code).then(() => {
    $('btn-copy-code').textContent = '✓ Copied!';
    setTimeout(() => ($('btn-copy-code').textContent = 'Copy Solution Code'), 2000);
  });
}

function goNextLevel() {
  const id = $('btn-next-level').dataset.nextId;
  if (id) {
    $('result-overlay').hidden = true;
    loadLevel(id);
  }
}

function loadFromCode() {
  const code = $('paste-code-input').value.trim();
  if (!code) return;
  const decoded = decodeSchedule(code);
  if (decoded.error) {
    $('paste-code-input').style.borderColor = 'var(--blight-orange)';
    ariaAnnounce(`Error loading code: ${decoded.error}`);
    return;
  }
  $('paste-code-input').style.borderColor = '';
  if (decoded.levelId !== _currentLevelId) loadLevel(decoded.levelId);
  actions.loadSchedule(decoded.schedule);
  runSchedule();
}

// ── Math Drawer ──────────────────────────────────────────────────────
function toggleMathDrawer() {
  const drawer = $('math-drawer');
  drawer.hidden = !drawer.hidden;
  $('btn-math').setAttribute('aria-expanded', drawer.hidden ? 'false' : 'true');
}

function populateMathDrawer(level) {
  $('math-content').innerHTML = `
    <h3>Hamiltonian</h3>
    <pre>H = Σ_b J_b (X_i X_j + Y_i Y_j + Δ·Z_i Z_j)
Δ = 1.0
Bonds:
  0: (0,1) J=1.0     3: (3,4) J=0.6
  1: (1,2) J=0.8     4: (3,5) J=0.6
  2: (1,3) J=0.8     5: (5,6) J=0.5</pre>
    
    <h3>Trotter Step</h3>
    <pre>exp(-iθH_bond) where θ = J·f·D
D = T/E = ${level.T}/${level.epochs} = ${(level.T/level.epochs).toFixed(4)}
Bond acts on the 4-dim subspace of the 2 qubits.</pre>

    <h3>Closed Form (exact on one bond)</h3>
    <pre>|00⟩→ e^{-iΔθ}|00⟩
|11⟩→ e^{-iΔθ}|11⟩
|01⟩→ e^{+iΔθ}(cos2θ|01⟩ - i·sin2θ|10⟩)
|10⟩→ e^{+iΔθ}(-i·sin2θ|01⟩ + cos2θ|10⟩)</pre>

    <h3>Error</h3>
    <pre>F = |⟨ψ_exact|ψ_machine⟩|²
Error = √(1 - F)
Ceiling: ${level.ceiling?.error ?? 'none'}
Par: ${level.par?.error ?? 'none'}</pre>

    <h3>Trotter Error Scaling</h3>
    <pre>1st order: Error ∝ E^{-1}
2nd order: Error ∝ E^{-2}</pre>

    ${level.noise > 0 ? `<h3>Noise</h3>
    <pre>Per-qubit dephasing: p = ${level.noise}
After each layer: ρ → (1-p)ρ + p·Z_q·ρ·Z_q</pre>` : ''}
  `;
}

// ── Macro Dialog ─────────────────────────────────────────────────────
function openMacroDialog() {
  const state = getState();
  if (!state) return;
  const E = state.level.epochs;
  const epochIdx = state.selectedEpochIdx;

  const src = prompt(
    `Set epoch ${epochIdx + 1} as a copy of which epoch? (1-${E}, blank to clear):`,
    ''
  );
  if (src === null) return;

  if (src.trim() === '') {
    actions.setMacroLink(epochIdx, null);
    return;
  }

  const srcIdx = parseInt(src, 10) - 1;
  if (srcIdx < 0 || srcIdx >= E || srcIdx === epochIdx) {
    alert('Invalid source epoch.');
    return;
  }

  const schedule = state.schedule;
  schedule.epochs[epochIdx] = { layers: [] };
  actions.setMacroLink(epochIdx, srcIdx);
}

// ── Quantum Check ────────────────────────────────────────────────────
function runQuantumCheck() {
  const state = getState();
  if (!state || state.qcRunning) return;

  if (typeof backend === 'undefined') {
    $('qc-status').textContent = '⚠ No backend connected. Run in Qollab with a backend selected.';
    $('qc-status').className = 'qc-status error';
    return;
  }

  actions.setQCRunning(true);
  $('qc-status').textContent = '⚛ Submitting circuits…';
  $('qc-status').className = 'qc-status';

  const config = {
    schedule: state.schedule,
    level: {
      T: state.level.T,
      E: state.level.epochs,
      start: state.level.start,
      ceiling: state.level.ceiling,
      noise: state.level.noise,
    },
    tier: $('qc-tier').value,
    shots: parseInt($('qc-shots').value, 10),
    ref_steps: 8,
  };

  try {
    callPromising('quantum.verify.run_verification', JSON.stringify(config))
      .then(resultJson => {
        const result = JSON.parse(resultJson);
        actions.setQCResult(result);
        $('qc-status').textContent = result.status === 'success'
          ? `✓ Done in ${result.elapsed_seconds}s on ${result.backend_name}`
          : `✖ Error: ${result.message}`;
        $('qc-status').className = 'qc-status ' + result.status;
        if (result.ionq_one_job) $('qc-one-job-note').hidden = false;
      })
      .catch(err => {
        actions.setQCRunning(false);
        $('qc-status').textContent = `✖ ${err}`;
        $('qc-status').className = 'qc-status error';
      });
  } catch (e) {
    actions.setQCRunning(false);
    $('qc-status').textContent = `✖ ${e.message}`;
    $('qc-status').className = 'qc-status error';
  }
}

function renderQCResults(result) {
  const el = $('qc-results');
  if (!el) return;

  if (result.status !== 'success') {
    el.innerHTML = `<div style="color:var(--blight-orange)">Error: ${result.message}</div>`;
    el.hidden = false;
    return;
  }

  const lines = [`Backend: ${result.backend_name} | Shots: ${result.shots} | Ref floor: ${result.reference_floor.toFixed(4)}`];
  for (const c of result.circuits) {
    if (c.type === 'compute_uncompute') {
      lines.push(`E${c.checkpoint_epoch} (t=${c.checkpoint_T.toFixed(2)}): F_measured = ${c.measured_fidelity.toFixed(4)} ±${c.fidelity_stderr.toFixed(4)} | Hellinger = ${c.hellinger_fidelity.toFixed(4)} | CX est: ${c.cx_estimate?.cx ?? '—'} ${c.cx_estimate?.note || ''}`);
    } else {
      lines.push(`E${c.checkpoint_epoch} populations: Hellinger = ${c.hellinger_fidelity.toFixed(4)} | CX est: ${c.cx_estimate?.cx ?? '—'}`);
    }
  }

  el.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  el.hidden = false;
}

// ── Self-test ────────────────────────────────────────────────────────
async function runSelftest() {
  try {
    if (typeof callPromising !== 'undefined') {
      const badge = await callPromising('quantum.selftest.run_selftest', '');
      actions.setSelftestBadge(JSON.parse(badge));
    }
  } catch (e) {
    // Silently skip
  }
}

// ── Theme / Motion ───────────────────────────────────────────────────
function toggleTheme() {
  document.body.dataset.theme =
    document.body.dataset.theme === 'light' ? '' : 'light';
}

function toggleMotion() {
  const cur = document.body.dataset.reducedMotion;
  document.body.dataset.reducedMotion = cur === 'true' ? '' : 'true';
}

// ── Keyboard shortcuts ───────────────────────────────────────────────
function handleGlobalKey(e) {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const key = e.key;

  if (key === '?' || (key === 'F1' && !e.shiftKey)) {
    $('help-dialog').showModal();
    e.preventDefault();
    return;
  }

  const fractionKeys = { '1': 1, '2': 0.5, '3': 0.25, '4': 0.125 };
  if (fractionKeys[key] !== undefined) {
    const f = fractionKeys[key];
    actions.setSelectedFraction(f);
    document.querySelectorAll('.palette-btn').forEach(btn => {
      btn.setAttribute('aria-pressed', parseFloat(btn.dataset.fraction) === f ? 'true' : 'false');
    });
    e.preventDefault();
    return;
  }

  if ((key === 'z' || key === 'Z') && !e.ctrlKey && !e.metaKey) {
    actions.undo();
    e.preventDefault();
    return;
  }

  if ((key === 'y' || key === 'Y') && !e.ctrlKey && !e.metaKey) {
    actions.redo();
    e.preventDefault();
    return;
  }

  if ((key === 'z' || key === 'Z') && (e.ctrlKey || e.metaKey)) {
    if (e.shiftKey) actions.redo();
    else actions.undo();
    e.preventDefault();
    return;
  }

  if (key === 'r' || key === 'R') {
    runSchedule();
    e.preventDefault();
    return;
  }

  if (key === 'm' || key === 'M') {
    openMacroDialog();
    e.preventDefault();
    return;
  }

  if (key === 'Escape') {
    const overlay = $('result-overlay');
    if (!overlay.hidden) overlay.hidden = true;
    const drawer = $('math-drawer');
    if (!drawer.hidden) drawer.hidden = true;
    const dataDrawer = $('data-drawer');
    if (dataDrawer && dataDrawer.open) dataDrawer.open = false;
    return;
  }
}

function ariaAnnounce(msg) {
  const live = $('aria-live');
  if (live) {
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = msg; });
  }
}
