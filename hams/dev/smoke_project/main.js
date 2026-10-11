// Mycelium Smoke Test - main.js
// Tests: backend global, Python bridge, rxx/ryy/rzz gates, bit ordering, one-job rule

import * as probe from 'quantum.probe';

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');

function log(msg) {
  const text = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg);
  console.log(text);
  logEl.textContent += text + '\n';
}

function setStatus(msg, color) {
  statusEl.textContent = msg;
  statusEl.style.borderLeft = `4px solid ${color || '#00d4ff'}`;
}

async function run() {
  setStatus('Running smoke test...', '#ffa500');
  log('=== MYCELIUM SMOKE TEST ===');
  log('Timestamp: ' + new Date().toISOString());

  // 1. Backend info
  log('\n--- BACKEND INFO ---');
  try {
    // Defensive: backend may not have all attributes
    const name = typeof backend !== 'undefined' ? backend.name : 'UNDEFINED';
    log('backend.name: ' + name);
  } catch (e) {
    log('backend.name error: ' + e.message);
  }

  try {
    // Try to read various backend attributes
    const attrs = ['name', 'num_qubits', 'max_circuits', 'configuration', 'properties'];
    for (const attr of attrs) {
      try {
        const val = backend[attr];
        if (val !== undefined && val !== null) {
          log('backend.' + attr + ': ' + JSON.stringify(val));
        }
      } catch (e) {
        log('backend.' + attr + ': [error] ' + e.message);
      }
    }
  } catch (e) {
    log('Backend attribute scan error: ' + e.message);
  }

  // 2. Run probe via Python bridge
  log('\n--- PYTHON BRIDGE + QUANTUM CIRCUITS ---');
  try {
    const resultJson = await probe.run_probe.callPromising(JSON.stringify({
      shots: 1024
    }));
    const result = JSON.parse(resultJson);
    log('Probe result:');
    log(result);
    setStatus('Smoke test PASSED', '#00ff00');
  } catch (e) {
    log('Probe error: ' + String(e));
    log('Error type: ' + (e.constructor ? e.constructor.name : 'unknown'));
    if (String(e).includes('only one job')) {
      log('>>> IonQ one-job-per-run limit confirmed');
    }
    setStatus('Smoke test FAILED - see log', '#ff0000');
  }

  log('\n=== END SMOKE TEST ===');
}

run();
