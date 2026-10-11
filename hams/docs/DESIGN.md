# Design Decisions — Mycelium

## Architecture

### Qubit Ordering
- **JS engine**: Big-endian. Qubit 0 is the leftmost position in the tensor product. Basis state index: qubit q contributes bit at position `(N-1-q)`. State |0001000⟩ (site 3 flipped) = index 8.
- **Qiskit**: Little-endian. Qubit 0 is the rightmost bit. The `quantum/` modules handle conversion.
- **Conversion**: `qiskit_index = reverseBits(js_index, N)` where `reverseBits` reverses the N-bit binary representation.

### Bond Split (XX+YY vs ZZ)
On one bond, XX, YY, ZZ all commute (verified: commutator norms = 0). Splitting into flow (XX+YY) and barrier (ZZ) as separate player controls has zero error and adds no puzzle value. **Decision: do not offer this split.** Phase 4 search will check whether it widens the Pareto frontier across multiple bonds; if so, add as a late-world unlock.

### World 3 Bond Selection
Need disjoint pairs to teach parallelism. From the tree:
- Bonds 0-1 and 3-4 are disjoint (share no qubit)
- Bonds 1-2 and 3-5 are disjoint
- Bonds 0-1 and 3-5 are disjoint
Use bonds {0-1, 1-3, 3-4} (indices 0, 2, 3): includes adjacent pair (0-1 & 1-3 share node 1) and disjoint pair (0-1 & 3-4).

### Echo World (World 9)
**Echo protocol**: Evolve forward for time T with the player's schedule, apply a perturbation (Z₃: phase flip on site 3), then evolve backward for time T with the same schedule reversed. **Echo fidelity** = probability of returning to the start state = |⟨ψ₀|U†·Z₃·U|ψ₀⟩|². A perfect Trotter circuit has high echo fidelity because systematic Trotter errors cancel; noise breaks the echo. This teaches that Trotter errors are coherent (reversible) while noise is not.

### Noise Model
Per-layer dephasing: after each layer, every qubit independently undergoes ρ → (1-p)ρ + p·Z·ρ·Z. This is the simplest physically motivated noise (T₂ decoherence) and creates a depth-vs-error tradeoff: more layers reduce Trotter error but accumulate noise.

### Scoring
- **Cost** = number of slices placed in the editor (one epoch of a repeat macro counts once)
- **Depth** = total executed layers across all epochs (macro-expanded)
- **Error** = √(1 - F) where F is fidelity at final time

### Solution Codec
Format: `M1.{levelId}.{base64url(epochData+macroLinks)}.{crc8}`
- Version prefix `M1` for forward compatibility
- Level ID ensures the code is valid for the intended level
- Epoch data: per epoch, per layer, list of (bondIndex, fractionIndex) pairs
- Macro links: which epochs are linked copies of which source epoch
- CRC-8 checksum for typo detection

### Ghost Algorithm
Scaled Taylor series for exp(-iHt)|ψ⟩:
1. Estimate ‖H‖ (precomputed: 7.5846)
2. Choose substeps so that ‖H‖·dt_sub ≤ 1
3. For each substep, compute Taylor series to order 20+: |ψ⟩ ← Σ_{k=0}^{K} (-iH·dt_sub)^k/k! |ψ⟩
4. Convergence check: stop when ‖term‖/‖sum‖ < 1e-15

This avoids eigendecomposition and works for any Hamiltonian. Validated against scipy.linalg.expm to < 1e-10.

### Density Matrix
128×128 complex matrix using paired Float64Arrays (re + im). Total memory: 2 × 128 × 128 × 8 bytes = 256 KB. Only allocated when noise p > 0; otherwise use statevector (2 × 128 × 8 = 2 KB).

### Entropy Calculation
Von Neumann entropy S = -Tr(ρ_A log₂ ρ_A) across each tree-edge cut. Reduced density matrix is at most 8×8 (3 qubits on the smaller side for the 1-3 cut). Eigenvalues via Jacobi iteration on small Hermitian matrices.

## Level Design Philosophy
Each world teaches one concept. Early worlds use subsets of bonds to isolate the concept. Constraints (caps, ceilings) force the player to discover the optimal strategy rather than brute-forcing. Par values come from Phase 4 search.

---

## Phase Completion Log

### Phase 1: Engine + Goldens � COMPLETE
Engine modules: constants.js, complex.js, bond.js, state.js, ghost.js, schedule.js, score.js, density.js, entropy.js, codec.js, rng.js

Bond exactness: apply_bond applies exp(-i*theta*(XX+YY+Delta*ZZ)) where theta=J*f*D. Verified against scipy.linalg.expm (max diff < 1e-12).
Ghost Taylor series: 30-term, ceil(||H||*|t|) substeps. Verified vs goldens < 1e-10.
Golden generator: 72 test vectors (bond exact, Trotter 1st/2nd, ghost, mixed fraction).
Test suite: 18/18 pass (422 ms, Node --test).

Decision: schedule.macroLinks uses {epochIdx: sourceIdx} with placeholder {layers:[]} entries in the epochs array so executeSchedule can iterate epochs.length correctly.
Decision: secondOrderSchedule creates 1 real epoch + (E-1) macro placeholders. Cost = 2*nBonds (once); depth = E*2*nBonds.

### Phase 2: Quantum Modules � COMPLETE
Python modules: quantum/__init__.py, model.py, circuits.py, reference.py, verify.py, selftest.py

model.py: big-endian <-> little-endian index conversion (reverseBits). SparsePauliOp Hamiltonian.
circuits.py: schedules -> Qiskit via rxx/ryy/rzz gates (each bond: rxx(2*theta), ryy(2*theta), rzz(2*Delta*theta)).
verify.py: ONE be.run([circuits], shots=N) call. Population + compute-uncompute fidelity circuits. IonQ AttributeError wrapping handled.
selftest.py: startup badge � Qiskit Statevector vs scipy expm, 2nd-order Trotter at 8 steps.
Platform lint: 0 errors, 0 warnings.

Decision: compute-uncompute uses player circuit + U_ref_dagger (second-order, 8 steps). Classical F_floor reported. IonQ shot-noise error bars: sigma=sqrt(p(1-p)/shots).

### Phase 3: Harness and Lint � COMPLETE
File: dev/harness/lint_qollab.mjs. Checks HTML (no script/html/head/body tags), JS (no localStorage/fetch/document.write), Python (docstring-stripped backend.run() counting). Result: 0 errors, 0 warnings.

### Phase 5: Game UI � COMPLETE (vertical slice M1)
Files: index.html, main.css, main.js, game/app.js, game/store.js, game/render.js, game/sequencer.js, game/levels.js

10 levels across 4 chapters. 3 SVG panels (machine/ghost/drift) with cividis glow + phase tick. Sequencer: bond-row x layer-col grid. Score bars, error trail, Quantum Check section. Keyboard shortcuts, undo/redo, macro system, result overlay, paste code bar. Colour-blind safe (Okabe-Ito palette). Responsive to 360px.
