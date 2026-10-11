/**
 * lint_qollab.mjs - Platform compliance linter
 *
 * Checks all files under the Qollab project for known violations:
 * 1. No <script> tags in HTML
 * 2. No <html>, <head>, <body> wrapper tags in HTML  
 * 3. No localStorage usage
 * 4. No fetch() calls for project files
 * 5. No document.write
 * 6. backend is never constructed (only used as global)
 * 7. callPromising is used (not called) directly on a JS object
 * 8. No more than one backend.run() per Python module
 *
 * Run: node dev/harness/lint_qollab.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const QOLLAB_ROOT = path.join(REPO_ROOT, 'qollab');

let errors = 0;
let warnings = 0;

function err(file, line, msg) {
  console.error(`  ✖ ${path.relative(REPO_ROOT, file)}:${line}: ${msg}`);
  errors++;
}

function warn(file, line, msg) {
  console.warn(`  ⚠ ${path.relative(REPO_ROOT, file)}:${line}: ${msg}`);
  warnings++;
}

function walkFiles(dir, ext, fn) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      walkFiles(full, ext, fn);
    } else if (stat.isFile() && (!ext || full.endsWith(ext))) {
      fn(full);
    }
  }
}

function checkHTML(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    // No <script> tags
    if (/<script[\s>]/i.test(line)) {
      err(file, lineno, '<script> tag found — Qollab injects scripts, don\'t add your own');
    }

    // No html/head/body wrappers
    for (const tag of ['html', 'head', 'body']) {
      if (new RegExp(`</?${tag}[\\s>]`, 'i').test(line)) {
        err(file, lineno, `<${tag}> tag found — index.html must be body-only`);
      }
    }

    // No inline event handlers
    if (/\bon\w+\s*=\s*['"]/i.test(line)) {
      warn(file, lineno, 'Inline event handler found — prefer addEventListener');
    }
  }
}

function checkJS(file) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    // No localStorage
    if (/localStorage/.test(line)) {
      err(file, lineno, 'localStorage is not available in Qollab');
    }

    // No sessionStorage
    if (/sessionStorage/.test(line)) {
      err(file, lineno, 'sessionStorage is not available in Qollab');
    }

    // No document.write
    if (/document\.write/.test(line)) {
      err(file, lineno, 'document.write is not allowed');
    }

    // No fetch for local project files
    if (/fetch\(['"`]\.\//i.test(line) || /fetch\(['"`]\/(?!\/)/i.test(line)) {
      err(file, lineno, 'fetch() of local project files not available in Qollab');
    }

    // No new QiskitBackend or similar construction
    if (/new\s+(IBMBackend|IonQBackend|QiskitBackend|AWSBackend)/i.test(line)) {
      err(file, lineno, 'backend must not be constructed — use the global `backend` provided by Qollab');
    }

    // backend.run called more than once in a file (accumulate)
    // handled below

    // callPromising: should be called as a function, not accessed as a method chain weirdly
    if (/\.callPromising\s*\(/.test(line) && !/^.*callPromising\s*\(/.test(line)) {
      warn(file, lineno, 'callPromising should be called directly on the bridge reference');
    }
  }

  // Count backend.run() calls
  const runMatches = src.match(/\bbackend\.run\s*\(/g) || [];
  if (runMatches.length > 1) {
    err(file, 0, `backend.run() called ${runMatches.length} times — IonQ allows only one job per run`);
  }
}

function checkPython(file) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // Strip Python docstrings (triple-quoted blocks) and comment lines
  let inDocstring = false;
  let docstringChar = null;
  const codeLines = [];
  for (const line of lines) {
    const t = line.trim();
    if (!inDocstring) {
      if (t.startsWith('"""') || t.startsWith("'''")) {
        docstringChar = t.startsWith('"""') ? '"""' : "'''";
        // Check if it closes on the same line
        const rest = t.slice(3);
        if (rest.includes(docstringChar)) {
          continue; // Single-line docstring, skip
        }
        inDocstring = true;
        continue;
      }
      if (!t.startsWith('#')) {
        codeLines.push(line);
      }
    } else {
      if (t.includes(docstringChar)) {
        inDocstring = false;
      }
    }
  }
  const codeSrc = codeLines.join('\n');

  // Count be.run() / backend.run() calls in code (not comments/docstrings)
  const runMatches = codeSrc.match(/\bbackend\.run\s*\(|\bbe\.run\s*\(/g) || [];
  if (runMatches.length > 1) {
    err(file, 0, `backend.run() called ${runMatches.length} times in Python — IonQ allows only one job per run`);
  }

  // Check for import js at top level (should be inside function for Python modules)
  const importJsIdx = lines.findIndex(l => l.trim() === 'import js');
  if (importJsIdx >= 0) {
    const priorLines = lines.slice(0, importJsIdx);
    const indented = priorLines.filter(l => /^\s+/.test(l) && l.trim().startsWith('def '));
    if (indented.length === 0) {
      warn(file, importJsIdx + 1, '`import js` at module level — should be inside a function');
    }
  }
}

// ── Run checks ─────────────────────────────────────────────────────
console.log('🔍 Qollab platform linter\n');

console.log('Checking HTML files...');
walkFiles(QOLLAB_ROOT, '.html', checkHTML);

console.log('Checking JS files...');
walkFiles(QOLLAB_ROOT, '.js', checkJS);
walkFiles(QOLLAB_ROOT, '.mjs', checkJS);

console.log('Checking Python files...');
walkFiles(QOLLAB_ROOT, '.py', checkPython);

// ── Summary ────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Errors: ${errors}  Warnings: ${warnings}`);
if (errors === 0) {
  console.log('✅ All checks passed.');
  process.exit(0);
} else {
  console.error('❌ Platform compliance violations found.');
  process.exit(1);
}
