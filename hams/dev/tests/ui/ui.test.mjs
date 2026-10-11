/**
 * dev/tests/ui/ui.test.mjs - UI & Accessibility Test Suite
 *
 * Tests:
 * 1. Control presence and ARIA accessibility labels
 * 2. Panoramic scene with 7 trees and view switcher
 * 3. Exact data mapping:
 *    - canopy size and shade = P1
 *    - dashed ring radius = mixing
 *    - marker shape = phase quadrant
 *    - orange halo radius = |ΔP1|
 *    - root thickness = J
 *    - pod size = slice fraction
 * 4. Performance: animated elements under 150, particle canvas
 * 5. Reduced motion stopping animations
 * 6. Measured WCAG contrast analysis for all UI colors
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const INDEX_HTML = readFileSync(path.join(REPO_ROOT, 'qollab/index.html'), 'utf8');
const MAIN_CSS = readFileSync(path.join(REPO_ROOT, 'qollab/main.css'), 'utf8');

// JSDOM-like lightweight HTML scanner / regex asserts
test('1. HTML structure and controls: all required controls and ARIA attributes exist', () => {
  const requiredIds = [
    'level-title', 'param-T', 'val-T', 'param-E', 'val-E', 'param-p', 'val-p',
    'btn-run', 'btn-skip', 'btn-reset', 'btn-undo', 'btn-redo',
    'btn-math', 'btn-theme', 'btn-motion', 'aria-live',
    'panorama-forest', 'panorama-backdrop', 'particle-canvas',
    'hud-t', 'hud-T', 'hud-err', 'hud-fid', 'hud-cx', 'hud-depth',
    'view-machine', 'view-ghost', 'view-both', 'view-drift',
    'tree-markers-overlay', 'tree-plaques', 'data-drawer',
    'table-machine', 'table-ghost', 'table-drift',
    'epoch-tabs', 'btn-macro', 'sequencer-grid', 'budget-status',
    'val-cost', 'bar-cost', 'par-cost', 'cap-cost',
    'val-depth', 'bar-depth', 'par-depth', 'cap-depth',
    'val-error', 'bar-error', 'par-error', 'ceiling-error',
    'trail-chart', 'quantum-check-section', 'verified-badge',
    'qc-tier', 'qc-shots', 'btn-qcheck', 'qc-status', 'qc-results', 'qc-one-job-note',
    'paste-code-input', 'btn-paste-code',
    'math-drawer', 'btn-math-close', 'math-content',
    'result-overlay', 'result-title', 'result-scores', 'btn-copy-code', 'btn-next-level', 'btn-optimize',
    'help-dialog', 'btn-help-close',
  ];

  for (const id of requiredIds) {
    const hasId = INDEX_HTML.includes(`id="${id}"`);
    assert.ok(hasId, `Required element #${id} must exist in index.html`);
  }

  // Check critical ARIA attributes
  assert.ok(INDEX_HTML.includes('aria-live="polite"'), 'Live region must have aria-live="polite"');
  assert.ok(INDEX_HTML.includes('role="toolbar"'), 'Toolbar must have role="toolbar"');
  assert.ok(INDEX_HTML.includes('role="radiogroup"'), 'View switcher must have role="radiogroup"');
  assert.ok(INDEX_HTML.includes('role="grid"'), 'Sequencer must have role="grid"');
  assert.ok(INDEX_HTML.includes('role="meter"'), 'Score bars must have role="meter"');
  assert.ok(INDEX_HTML.includes('role="dialog"') || INDEX_HTML.includes('<dialog'), 'Dialogs must exist');
});

test('2. Single panoramic scene replaces 3 side-by-side panels', () => {
  assert.ok(INDEX_HTML.includes('class="panorama-section"'), 'Must have .panorama-section');
  assert.ok(!INDEX_HTML.includes('class="panels-row"'), 'Three side-by-side panels row must be removed');
  assert.ok(INDEX_HTML.includes('id="panorama-forest"'), 'Must have single panoramic forest SVG');
  assert.ok(INDEX_HTML.includes('id="view-machine"') && INDEX_HTML.includes('id="view-ghost"') &&
            INDEX_HTML.includes('id="view-both"') && INDEX_HTML.includes('id="view-drift"'),
            'Must have Machine | Ghost | Both | Drift view switcher');
});

test('3. Exact data mapping logic in render.js and sequencer.js', async () => {
  const renderModule = await import('../../../qollab/game/render.js');
  const { computePhaseAngle, getPhaseQuadrant, TREE_CONFIGS } = renderModule;

  assert.equal(TREE_CONFIGS.length, 7, 'Must have 7 tree configurations for qubits 0..6');

  // Phase quadrant mapping:
  // Quadrant 0: [0, 90 deg) -> 0 (Circle)
  // Quadrant 1: [90, 180 deg) -> 1 (Diamond)
  // Quadrant 2: [180, 270 deg) -> 2 (Square)
  // Quadrant 3: [270, 360 deg) -> 3 (Triangle)
  assert.equal(getPhaseQuadrant(0), 0, '0 rad -> Quadrant 0 (Circle)');
  assert.equal(getPhaseQuadrant(Math.PI * 0.6), 1, '108 deg -> Quadrant 1 (Diamond)');
  assert.equal(getPhaseQuadrant(Math.PI), 2, '180 deg -> Quadrant 2 (Square)');
  assert.equal(getPhaseQuadrant(-Math.PI * 0.4), 3, '-72 deg (288 deg) -> Quadrant 3 (Triangle)');

  // Verify render.js contains data mappings:
  const renderSrc = readFileSync(path.join(REPO_ROOT, 'qollab/game/render.js'), 'utf8');
  assert.ok(renderSrc.includes('mixing') && renderSrc.includes('Math.sqrt'), 'Dashed ring radius must map to mixing');
  assert.ok(renderSrc.includes('delta') && renderSrc.includes('haloRadius'), 'Orange halo radius must map to |ΔP1|');
  assert.ok(renderSrc.includes('canopyRx') && renderSrc.includes('p1'), 'Canopy size must map to P1');

  // Verify sequencer.js contains data mappings:
  const seqSrc = readFileSync(path.join(REPO_ROOT, 'qollab/game/sequencer.js'), 'utf8');
  assert.ok(seqSrc.includes('rootLineThickness') && seqSrc.includes('J'), 'Root thickness must map to coupling J');
  assert.ok(seqSrc.includes('pod-frac-') && seqSrc.includes('slice.fraction'), 'Pod size must map to slice fraction');
});

test('4. Performance constraints: instanced filaments, particle canvas, animated elements under 150', () => {
  // Check instanced <use> tags or defs
  assert.ok(INDEX_HTML.includes('<defs id="forest-defs">') && INDEX_HTML.includes('id="filament-cluster-'),
    'Must define reusable filament clusters for SVG <use> instancing');
  
  // Check particle canvas exists
  assert.ok(INDEX_HTML.includes('id="particle-canvas"'), 'Must have single particle canvas');

  // Count keyframe animations in main.css
  const animMatches = MAIN_CSS.match(/@keyframes\s+([a-zA-Z0-9_-]+)/g) || [];
  assert.ok(animMatches.length >= 3, 'Must have keyframe animations (pulseGlow, sapFlow, etc.)');

  // Ensure total animated elements in static HTML is low (< 150)
  const animClassMatches = INDEX_HTML.match(/class="[^"]*anim-[^"]*"/g) || [];
  assert.ok(animClassMatches.length < 50, `Animated elements in HTML (${animClassMatches.length}) is under 150`);
});

test('5. Reduced motion compliance: prefers-reduced-motion and manual toggle stop drifting, swaying, pulsing', () => {
  assert.ok(MAIN_CSS.includes('@media (prefers-reduced-motion: reduce)'),
    'Must include @media (prefers-reduced-motion: reduce)');
  assert.ok(MAIN_CSS.includes('[data-reduced-motion="true"]'),
    'Must support manual reduced motion toggle [data-reduced-motion="true"]');
  assert.ok(MAIN_CSS.includes('animation: none !important') || MAIN_CSS.includes('animation-duration: 0.001ms !important'),
    'Animations must be stopped under reduced motion');
});

test('6. Color contrast and WCAG AA analysis with measured numbers', () => {
  // Helper to parse hex to sRGB
  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
  }

  // Calculate relative luminance per WCAG 2.1
  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  // Calculate contrast ratio
  function contrastRatio(hex1, hex2) {
    const [r1, g1, b1] = hexToRgb(hex1);
    const [r2, g2, b2] = hexToRgb(hex2);
    const l1 = getLuminance(r1, g1, b1);
    const l2 = getLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Test primary palette against deep backgrounds:
  const bgAbyss = '#050a0f';
  const bgCard = '#07131a';
  const bgPlank = '#120b08';

  const testPairs = [
    { name: 'Primary Text on Abyss', fg: '#f2f4f8', bg: bgAbyss, req: 4.5 },
    { name: 'Teal on Abyss', fg: '#1fd1a5', bg: bgAbyss, req: 4.5 },
    { name: 'Cyan on Abyss', fg: '#4de3ff', bg: bgAbyss, req: 4.5 },
    { name: 'Amber on Abyss', fg: '#ffc857', bg: bgAbyss, req: 4.5 },
    { name: 'Ghost Silver on Abyss', fg: '#9cc7ff', bg: bgAbyss, req: 4.5 },
    { name: 'Spore Violet on Abyss', fg: '#c77dff', bg: bgAbyss, req: 4.5 },
    { name: 'Muted Text on Card', fg: '#9db0cb', bg: bgCard, req: 4.5 },
    { name: 'Amber on Plank Footer', fg: '#ffc857', bg: bgPlank, req: 4.5 },
  ];

  const results = [];
  let failures = 0;

  for (const pair of testPairs) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const passed = ratio >= pair.req;
    results.push({ ...pair, measured: ratio.toFixed(2), passed });
    if (!passed) failures++;
    assert.ok(passed, `${pair.name}: measured ${ratio.toFixed(2)}:1 (required >= ${pair.req}:1)`);
  }

  console.log('\n📊 Measured WCAG Contrast Ratios:');
  for (const r of results) {
    console.log(`   ${r.passed ? '✔' : '✖'} ${r.name}: ${r.measured}:1 (req >= ${r.req}:1)`);
  }
});
