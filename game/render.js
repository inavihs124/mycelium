/**
 * game/render.js - Panoramic Quantum Forest Scene Renderer
 *
 * Implements:
 * - Single continuous panoramic alien moon jungle scene
 * - 7 Colossal Trees mapped to spin network state:
 *     - Canopy size & shade = P1
 *     - Dashed ring radius = mixing (coherence / superposition)
 *     - Marker shape = phase quadrant (Q0: ○, Q1: ◆, Q2: □, Q3: ▲)
 *     - Orange halo radius = |ΔP1|
 *     - Hanging filaments with instanced SVG <use>
 *     - Soil line plaques (P1, ghost P1)
 *     - View modes: Machine | Ghost | Both | Drift
 * - One particle canvas (< 30 particles, paused on tab hidden or reduced motion)
 * - Accessible data tables inside collapsible drawer
 * - Error trail chart
 */

import { N, BONDS } from '../engine/constants.js';
import { computeP1 } from '../engine/state.js';

// Tree X layout across 1920px panorama
export const TREE_CONFIGS = [
  { q: 0, x: 130,  y: 465, trunkH: 92,  isHub: false, isMajor: false, label: 'Tree 0' },
  { q: 1, x: 380,  y: 458, trunkH: 108, isHub: true,  isMajor: false, label: 'Tree 1 ★' },
  { q: 2, x: 640,  y: 462, trunkH: 92,  isHub: false, isMajor: false, label: 'Tree 2' },
  { q: 3, x: 960,  y: 452, trunkH: 142, isHub: true,  isMajor: true,  label: 'Tree 3 ★ Major' },
  { q: 4, x: 1280, y: 458, trunkH: 100, isHub: false, isMajor: false, label: 'Tree 4' },
  { q: 5, x: 1540, y: 460, trunkH: 96,  isHub: false, isMajor: false, label: 'Tree 5' },
  { q: 6, x: 1780, y: 465, trunkH: 90,  isHub: false, isMajor: false, label: 'Tree 6' },
];

const MUSHROOM_COLORS = [
  { cap: '#ee8b9b', edge: '#ffd0d4', spot: '#fff0d8', glow: '#ec8a9e' },
  { cap: '#f0b871', edge: '#ffdfac', spot: '#fff3cd', glow: '#f0b871' },
  { cap: '#8fb9ed', edge: '#d9e9ff', spot: '#f4f7ff', glow: '#8fb9ed' },
  { cap: '#b89be4', edge: '#ecdcff', spot: '#fff5ff', glow: '#ba95f0' },
  { cap: '#9bd4ad', edge: '#dbf5d3', spot: '#f5ffdf', glow: '#9bd4ad' },
  { cap: '#ed9a7e', edge: '#ffd8bd', spot: '#fff2da', glow: '#ed9a7e' },
  { cap: '#9caef0', edge: '#dce3ff', spot: '#f5f4ff', glow: '#9caef0' },
];


let _currentViewMode = 'both';
let _particleAnimId = null;
let _particles = [];
let _canvasInitialized = false;

export function setViewMode(mode) {
  _currentViewMode = mode;
}

export function getViewMode() {
  return _currentViewMode;
}

/** Compute phase angle in radians [-π, π] for qubit q */
export function computePhaseAngle(state, q) {
  if (!state) return 0;
  const { re, im } = state;
  const N_q = re.length;
  const bitPos = 7 - 1 - q;
  const mask = 1 << bitPos;

  let sumR = 0, sumI = 0;
  for (let idx = 0; idx < N_q; idx++) {
    if (idx & mask) {
      sumR += re[idx];
      sumI += im[idx];
    }
  }
  return Math.atan2(sumI, sumR);
}

/** Map phase angle to quadrant 0..3 */
export function getPhaseQuadrant(angle) {
  const deg = ((angle * 180 / Math.PI) + 360) % 360;
  if (deg < 90) return 0;
  if (deg < 180) return 1;
  if (deg < 270) return 2;
  return 3;
}

/** Compute mixing = 2 * sqrt(p1 * (1 - p1)) (coherence/superposition measure) */
function computeMixing(p) {
  const clamped = Math.max(0, Math.min(1, p));
  return 2 * Math.sqrt(clamped * (1 - clamped));
}

/** Color shade based on P1 */
function getCanopyColor(p, isMajor, isHub) {
  if (isMajor && p > 0.3) return 'url(#hub3Core)';
  if (isHub && p > 0.15) return 'url(#hub1Core)';
  if (p > 0.4) return '#1d4b4a';
  if (p > 0.15) return '#143b37';
  if (p > 0.05) return '#113331';
  return '#0d1b1d';
}

/**
 * Main Panoramic Forest Renderer.
 */
export function renderPanoramicScene(svg, machineState, ghostState, opts = {}) {
  const { viewMode = _currentViewMode, runLayerBond = -1 } = opts;
  _currentViewMode = viewMode;

  const treesGroup = svg.querySelector('#forest-trees');
  if (!treesGroup) return;

  const p1_m = machineState ? computeP1(machineState) : new Float64Array(N);
  const p1_g = ghostState ? computeP1(ghostState) : new Float64Array(N);

  treesGroup.innerHTML = '';

  // The quantum tree is now drawn as a linked mushroom network. Links sit behind
  // the nodes, and their subtle glow keeps the relationship readable without clutter.
  const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  linksGroup.setAttribute('class', 'mycelium-links');
  const linkColors = ['#d9b16b', '#b9c58f', '#bba4d8', '#a8c6a2', '#d4a46a', '#a4bdc5'];
  BONDS.forEach(([from, to, coupling], index) => {
    const a = TREE_CONFIGS[from];
    const b = TREE_CONFIGS[to];
    const ax = a.x, ay = a.y - a.trunkH + 4;
    const bx = b.x, by = b.y - b.trunkH + 4;
    const midX = (ax + bx) / 2;
    const midY = Math.min(ay, by) - 25 - coupling * 14;
    const link = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    link.setAttribute('d', `M ${ax} ${ay} Q ${midX} ${midY} ${bx} ${by}`);
    link.setAttribute('fill', 'none');
    link.setAttribute('stroke', linkColors[index % linkColors.length]);
    link.setAttribute('stroke-width', `${1.5 + coupling * 0.45}`);
    link.setAttribute('stroke-linecap', 'round');
    link.setAttribute('opacity', `${0.42 + Math.min(0.22, coupling * 0.14)}`);
    link.setAttribute('filter', 'drop-shadow(0 0 1.5px currentColor)');
    linksGroup.appendChild(link);
  });
  treesGroup.appendChild(linksGroup);

  const markersOverlay = document.getElementById('tree-markers-overlay');
  const plaquesContainer = document.getElementById('tree-plaques');
  if (markersOverlay) markersOverlay.innerHTML = '';
  if (plaquesContainer) plaquesContainer.innerHTML = '';

  for (let q = 0; q < N; q++) {
    const cfg = TREE_CONFIGS[q];
    const pm = p1_m[q];
    const pg = p1_g[q];
    const delta = Math.abs(pm - pg);

    // Active P1 based on view mode
    const p1_active = (viewMode === 'ghost') ? pg : pm;
    const mixing = computeMixing(p1_active);
    const phaseAngle = computePhaseAngle(
      viewMode === 'ghost' ? ghostState : machineState,
      q
    );
    const quadrant = getPhaseQuadrant(phaseAngle);

    // Geometry calculations
    const groundY = cfg.y;
    const trunkH = cfg.trunkH;
    const canopyCy = groundY - trunkH;
    const canopyRx = Math.round(28 + p1_active * 35 + (cfg.isMajor ? 10 : 0) + (cfg.isHub ? 4 : 0));
    const canopyRy = Math.round(17 + p1_active * 15 + (cfg.isMajor ? 5 : 0));
    const ringRadius = Math.round(27 + mixing * (cfg.isMajor ? 35 : 18));
    const haloRadius = Math.round(canopyRx + 7 + delta * 42);
    const mushroom = MUSHROOM_COLORS[q];

    // Tree Group
    const tg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tg.setAttribute('transform', `translate(${cfg.x}, ${groundY})`);
    tg.setAttribute('id', `tree-qubit-${q}`);
    tg.classList.add('panoramic-tree');
    if (cfg.isMajor) tg.classList.add('tree-major-hub');

    // 0. Small carved forest plinth: each qubit feels like a piece on a tabletop map.
    // This is purely presentation; all quantum values and state calculations stay unchanged.
    const plinthRx = cfg.isMajor ? 52 : (cfg.isHub ? 40 : 34);
    const plinthRy = cfg.isMajor ? 13 : 9;
    const plinthOuter = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plinthOuter.setAttribute('cx', '0');
    plinthOuter.setAttribute('cy', '-1');
    plinthOuter.setAttribute('rx', plinthRx);
    plinthOuter.setAttribute('ry', plinthRy);
    plinthOuter.setAttribute('fill', '#1e2d20');
    plinthOuter.setAttribute('stroke', '#8b7048');
    plinthOuter.setAttribute('stroke-width', cfg.isMajor ? '2.5' : '1.8');
    plinthOuter.setAttribute('opacity', '.98');
    tg.appendChild(plinthOuter);

    const plinthTop = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    plinthTop.setAttribute('cx', '0');
    plinthTop.setAttribute('cy', '-3');
    plinthTop.setAttribute('rx', plinthRx * .78);
    plinthTop.setAttribute('ry', plinthRy * .63);
    plinthTop.setAttribute('fill', '#2c432d');
    plinthTop.setAttribute('stroke', mushroom.glow);
    plinthTop.setAttribute('stroke-opacity', '.52');
    plinthTop.setAttribute('stroke-width', '1.1');
    tg.appendChild(plinthTop);

    // 1. Dashed Mixing Ring
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ring.setAttribute('cx', 0);
    ring.setAttribute('cy', -trunkH);
    ring.setAttribute('rx', ringRadius);
    ring.setAttribute('ry', ringRadius);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', cfg.isMajor ? '#d0b0f1' : mushroom.glow);
    ring.setAttribute('stroke-width', cfg.isMajor ? '1.6' : '1');
    ring.setAttribute('stroke-dasharray', cfg.isMajor ? '4 5' : '3 5');
    ring.setAttribute('opacity', `${0.16 + mixing * 0.3}`);
    if (cfg.isMajor) ring.classList.add('glow-violet');
    tg.appendChild(ring);

    // 2. Orange Drift Halo (shown in Drift or Both mode if delta > 0.0005)
    if ((viewMode === 'drift' || viewMode === 'both') && delta > 0.0005) {
      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      halo.setAttribute('cx', 0);
      halo.setAttribute('cy', -trunkH);
      halo.setAttribute('rx', haloRadius);
      halo.setAttribute('ry', Math.round(haloRadius * 0.75));
      halo.setAttribute('fill', 'rgba(255, 122, 61, 0.08)');
      halo.setAttribute('stroke', '#efb58d');
      halo.setAttribute('stroke-width', viewMode === 'drift' ? '1.8' : '1');
      halo.setAttribute('stroke-dasharray', viewMode === 'drift' ? '4 3' : '2 2');
      halo.setAttribute('opacity', `${Math.min(0.9, 0.3 + delta * 5)}`);
      halo.classList.add('drift-halo');
      tg.appendChild(halo);
    }

    // 3. Mushroom stem. Probability still controls cap size and the rings above.
    const stemW = cfg.isMajor ? 18 : cfg.isHub ? 12 : 8;
    const stem = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stem.setAttribute('d', `M-${stemW},0 C-${stemW * 0.75},-${trunkH * 0.25} -${stemW * 0.55},-${trunkH * 0.66} -${stemW * 0.6},-${trunkH - 3} Q0,-${trunkH - 8} ${stemW * 0.6},-${trunkH - 3} C${stemW * 0.55},-${trunkH * 0.66} ${stemW * 0.75},-${trunkH * 0.25} ${stemW},0 Z`);
    stem.setAttribute('fill', '#e9ddcf');
    stem.setAttribute('stroke', '#fff1df');
    stem.setAttribute('stroke-width', '1.2');
    stem.setAttribute('opacity', '0.96');
    tg.appendChild(stem);

    // 4. Ghost Spirit Overlay (in Both mode or Ghost mode)
    if (viewMode === 'both' || viewMode === 'ghost') {
      const ghostRx = Math.round(28 + pg * 35 + (cfg.isMajor ? 10 : 0) + (cfg.isHub ? 4 : 0));
      const ghostRy = Math.round(17 + pg * 15 + (cfg.isMajor ? 5 : 0));
      const ghostCanopy = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ghostCanopy.setAttribute('cx', 0);
      ghostCanopy.setAttribute('cy', -trunkH);
      ghostCanopy.setAttribute('rx', ghostRx + 6);
      ghostCanopy.setAttribute('ry', ghostRy + 6);
      ghostCanopy.setAttribute('fill', 'url(#spiritOverlay)');
      ghostCanopy.setAttribute('opacity', viewMode === 'ghost' ? '0.5' : '0.22');
      tg.appendChild(ghostCanopy);
    }

    // 5. Rounded mushroom cap with a few understated luminous spots.
    const cap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const topY = -trunkH - canopyRy;
    const capEdgeY = -trunkH + 5;
    cap.setAttribute('d', `M ${-canopyRx} ${capEdgeY} C ${-canopyRx * 0.94} ${-trunkH - canopyRy * 0.45}, ${-canopyRx * 0.58} ${topY}, 0 ${topY} C ${canopyRx * 0.58} ${topY}, ${canopyRx * 0.94} ${-trunkH - canopyRy * 0.45}, ${canopyRx} ${capEdgeY} Q 0 ${-trunkH + canopyRy * 0.45} ${-canopyRx} ${capEdgeY} Z`);
    cap.setAttribute('fill', mushroom.cap);
    cap.setAttribute('stroke', mushroom.edge);
    cap.setAttribute('stroke-width', cfg.isMajor ? '2.5' : '1.7');
    cap.setAttribute('opacity', `${0.76 + p1_active * 0.2}`);
    cap.style.filter = `drop-shadow(0 0 ${cfg.isMajor ? 12 : 6}px ${mushroom.glow}66)`;
    if (cfg.isMajor) cap.classList.add('anim-pulse');
    tg.appendChild(cap);

    // Small cap spots echo the storybook art without obscuring the state encoding.
    const spots = [
      [-0.43, -0.42, 2.8], [-0.08, -0.68, 3.4], [0.29, -0.48, 2.5], [0.55, -0.22, 2.0],
    ];
    for (const [sx, sy, sr] of spots) {
      const spot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      spot.setAttribute('cx', Math.round(canopyRx * sx));
      spot.setAttribute('cy', Math.round(-trunkH + canopyRy * sy));
      spot.setAttribute('r', sr * (cfg.isMajor ? 1.15 : 1));
      spot.setAttribute('fill', mushroom.spot);
      spot.setAttribute('opacity', '0.82');
      tg.appendChild(spot);
    }

    // Tiny friendly face on the upper stem; purely decorative and state-neutral.
    const eyeY = -trunkH + 21;
    for (const ex of [-5.5, 5.5]) {
      const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      eye.setAttribute('cx', ex);
      eye.setAttribute('cy', eyeY);
      eye.setAttribute('r', cfg.isMajor ? '2.4' : '1.9');
      eye.setAttribute('fill', '#344052');
      tg.appendChild(eye);
    }
    const smile = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    smile.setAttribute('d', `M -3 ${eyeY + 7} Q 0 ${eyeY + 10} 3 ${eyeY + 7}`);
    smile.setAttribute('stroke', '#344052');
    smile.setAttribute('stroke-width', '1.5');
    smile.setAttribute('stroke-linecap', 'round');
    smile.setAttribute('fill', 'none');
    tg.appendChild(smile);

    treesGroup.appendChild(tg);

    // 7. Floating Phase Marker & Delta Badge in Overlay
    if (markersOverlay) {
      const markerItem = document.createElement('div');
      markerItem.className = 'tree-marker-item';
      // Compute percentage coordinates across panorama
      const pctX = (cfg.x / 1920) * 100;
      const pctY = ((canopyCy - canopyRy - 26) / 540) * 100;
      markerItem.style.left = `${pctX}%`;
      markerItem.style.top = `${pctY}%`;

      // Marker shape based on quadrant
      const shapeEl = document.createElement('div');
      shapeEl.className = 'marker-shape';
      let symbol = '○';
      if (quadrant === 1) {
        shapeEl.classList.add('shape-diamond');
        symbol = '◆';
      } else if (quadrant === 2) {
        shapeEl.classList.add('shape-square');
        symbol = '□';
      } else if (quadrant === 3) {
        shapeEl.classList.add('shape-triangle');
        symbol = '▲';
      }
      shapeEl.innerHTML = `<span>${symbol}</span>`;
      markerItem.appendChild(shapeEl);

      // Delta badge
      const deltaBadge = document.createElement('span');
      deltaBadge.className = 'delta-badge' + (delta > 0.03 ? ' delta-warn' : '');
      deltaBadge.textContent = `Δ ${delta.toFixed(3)}`;
      markerItem.appendChild(deltaBadge);

      markersOverlay.appendChild(markerItem);
    }

    // 8. Soil Line Name Plaque
    if (plaquesContainer) {
      const plaque = document.createElement('div');
      plaque.className = 'plaque-item' + (cfg.isMajor ? ' plaque-major' : cfg.isHub ? ' plaque-hub' : '');
      plaque.setAttribute('role', 'status');
      plaque.setAttribute('aria-label', `${cfg.label}: P1 ${pm.toFixed(3)}, ghost ${pg.toFixed(3)}`);

      let p1Display = `P1 ${pm.toFixed(3)}`;
      let ghostDisplay = `ghost ${pg.toFixed(3)}`;
      if (viewMode === 'ghost') {
        p1Display = `P1 (G) ${pg.toFixed(3)}`;
        ghostDisplay = `machine ${pm.toFixed(3)}`;
      } else if (viewMode === 'drift') {
        p1Display = `|ΔP1| ${delta.toFixed(3)}`;
        ghostDisplay = `M ${pm.toFixed(3)} · G ${pg.toFixed(3)}`;
      }

      plaque.innerHTML = `
        <span class="plaque-title">${cfg.label}</span>
        <span class="plaque-p1 font-mono-num">${p1Display}</span>
        <span class="plaque-ghost font-mono-num">${ghostDisplay}</span>
      `;
      plaquesContainer.appendChild(plaque);
    }
  }

  // Initialize and run particle canvas
  initParticleCanvas();
}

/** Legacy panel renderer wrapper so nothing breaks */
export function renderPanel(svg, state, opts = {}) {
  // If svg is the panoramic forest SVG or backdrop, route to panoramic
  const forestSvg = document.getElementById('panorama-forest');
  if (forestSvg) {
    const ghostState = opts.compareState || null;
    renderPanoramicScene(forestSvg, state, ghostState, opts);
  }
}

/**
 * High-performance Particle Canvas (< 30 particles total).
 */
function initParticleCanvas() {
  if (_canvasInitialized) return;
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  _canvasInitialized = true;
  _particles = [];
  const W = canvas.width || 1920;
  const H = canvas.height || 540;

  // 24 floating bioluminescent spores
  for (let i = 0; i < 24; i++) {
    _particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1.5 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.2 - Math.random() * 0.5,
      alpha: 0.3 + Math.random() * 0.5,
      color: i % 3 === 0 ? '#c77dff' : i % 2 === 0 ? '#4de3ff' : '#1fd1a5',
    });
  }

  function renderParticles() {
    if (document.hidden || document.body.dataset.reducedMotion === 'true') {
      _particleAnimId = requestAnimationFrame(renderParticles);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    for (const p of _particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < 0) { p.y = H; p.x = Math.random() * W; }
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _particleAnimId = requestAnimationFrame(renderParticles);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && _particleAnimId) {
      cancelAnimationFrame(_particleAnimId);
      _particleAnimId = null;
    } else if (!document.hidden && !_particleAnimId) {
      _particleAnimId = requestAnimationFrame(renderParticles);
    }
  });

  _particleAnimId = requestAnimationFrame(renderParticles);
}

/**
 * Render the error trail chart.
 */
export function renderTrail(svg, epochErrors, ceiling, par) {
  if (!svg) return;
  svg.innerHTML = '';

  const W = svg.clientWidth || 300;
  const H = svg.clientHeight || 60;
  const PAD = { top: 6, right: 8, bottom: 14, left: 24 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  if (!epochErrors || epochErrors.length === 0) return;

  const maxErr = Math.max(ceiling * 1.15, Math.max(...epochErrors) * 1.15, 0.05);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${PAD.left}, ${PAD.top})`);
  svg.appendChild(g);

  // Ceiling line
  const cy = iH * (1 - ceiling / maxErr);
  const cline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  cline.setAttribute('x1', 0);  cline.setAttribute('y1', cy);
  cline.setAttribute('x2', iW); cline.setAttribute('y2', cy);
  cline.setAttribute('stroke', '#ff7a3d');
  cline.setAttribute('stroke-width', '1');
  cline.setAttribute('stroke-dasharray', '2 3');
  cline.setAttribute('opacity', '0.7');
  g.appendChild(cline);

  // Ceiling text
  const ctxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  ctxt.setAttribute('x', 6);
  ctxt.setAttribute('y', cy - 3);
  ctxt.setAttribute('font-size', '6');
  ctxt.setAttribute('fill', '#ff7a3d');
  ctxt.setAttribute('font-family', 'ui-monospace, monospace');
  ctxt.textContent = `Goal Ceiling (${ceiling.toFixed(4)})`;
  g.appendChild(ctxt);

  // Par line
  if (par !== undefined && par > 0) {
    const py = iH * (1 - par / maxErr);
    const pline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    pline.setAttribute('x1', 0);  pline.setAttribute('y1', py);
    pline.setAttribute('x2', iW); pline.setAttribute('y2', py);
    pline.setAttribute('stroke', '#ffc857');
    pline.setAttribute('stroke-width', '1');
    pline.setAttribute('stroke-dasharray', '2 2');
    pline.setAttribute('opacity', '0.5');
    g.appendChild(pline);
  }

  // Smooth trail path
  const n = epochErrors.length;
  const points = epochErrors.map((e, i) => {
    const xp = (i / (n > 1 ? n - 1 : 1)) * iW;
    const yp = iH * (1 - Math.min(e, maxErr) / maxErr);
    return [xp, yp];
  });

  if (points.length > 0) {
    let d = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i][0]},${points[i][1]}`;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#1fd1a5');
    path.setAttribute('stroke-width', '2');
    path.classList.add('glow-teal');
    g.appendChild(path);

    // Dots
    for (let i = 0; i < points.length; i++) {
      const [xp, yp] = points[i];
      const e = epochErrors[i];
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', xp);
      dot.setAttribute('cy', yp);
      dot.setAttribute('r', i === points.length - 1 ? '3.5' : '2.5');
      dot.setAttribute('fill', i === points.length - 1 ? '#ffffff' : e <= ceiling ? '#1fd1a5' : '#ff7a3d');
      if (i === points.length - 1) dot.classList.add('glow-cyan');
      g.appendChild(dot);
    }
  }
}

/**
 * Render all three data tables (machine, ghost, drift).
 */
export function renderDataTable(table, state, opts = {}) {
  if (!table) return;
  const { compareState = null, tableType = 'machine' } = opts;

  if (!state) {
    table.innerHTML = '';
    return;
  }

  const p1 = computeP1(state);
  const p1_comp = compareState ? computeP1(compareState) : null;

  if (tableType === 'drift' && p1_comp) {
    const rows = [['Qubit', 'P₁(M)', 'P₁(G)', '|ΔP₁|', 'Phase M', 'Phase G']];
    for (let q = 0; q < N; q++) {
      const pm = p1[q];
      const pg = p1_comp[q];
      const delta = Math.abs(pm - pg);
      const am = computePhaseAngle(state, q);
      const ag = computePhaseAngle(compareState, q);
      rows.push([
        `q${q}`,
        pm.toFixed(4),
        pg.toFixed(4),
        delta.toFixed(4),
        (am * 180 / Math.PI).toFixed(1) + '°',
        (ag * 180 / Math.PI).toFixed(1) + '°',
      ]);
    }
    table.innerHTML = rows.map((row, i) =>
      `<tr>${row.map(cell => i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`
    ).join('');
    return;
  }

  const rows = [['Qubit', 'P₁', 'Phase', 'Mixing']];
  for (let q = 0; q < N; q++) {
    const angle = computePhaseAngle(state, q);
    const mix = computeMixing(p1[q]);
    rows.push([
      `q${q}`,
      p1[q].toFixed(4),
      (angle * 180 / Math.PI).toFixed(1) + '°',
      mix.toFixed(3),
    ]);
  }

  table.innerHTML = rows.map((row, i) =>
    `<tr>${row.map(cell => i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`).join('')}</tr>`
  ).join('');
}
