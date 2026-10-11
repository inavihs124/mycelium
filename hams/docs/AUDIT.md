# Phase 0 Audit — Mycelium

## Environment

| Tool | Version |
|------|---------|
| Node.js | v24.14.1 |
| Python | 3.12.10 |
| Qiskit | 2.5.2 |
| Qiskit-Aer | 0.17.2 |
| NumPy | 2.0.0 |
| SciPy | 1.17.1 |
| OS | Windows |

## Repository Layout Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Qubit ordering in JS engine | Big-endian: qubit 0 = leftmost in tensor product, basis state index bit (N-1-q) | Natural for tree visualization; convert at Qiskit boundary |
| Qiskit ordering | Little-endian: qubit 0 = rightmost bit of basis state index | Qiskit convention; `verify.py` handles conversion |
| Complex storage | Paired Float64Arrays (re[], im[]) | No GC pressure, SIMD-friendly, cache-coherent |
| Ghost algorithm | Scaled Taylor series (order ≥ 20, steps with ‖H‖dt ≤ 1) | No eigensolver needed; validated to < 1e-10 vs expm |
| Density matrix | 128×128 complex Float64Arrays, only when noise p > 0 | Memory: 256 KB; acceptable for 7 qubits |
| Bond split (XX+YY vs ZZ) | NOT offered as a player control | On one bond, all three terms commute; splitting has zero error and no puzzle value. Revisit in Phase 4 search. |
| Framework | None (vanilla DOM + SVG) | Qollab rules: no build step, no external CSS/JS |

## Numerical Derivations

### 1. Bipartite Colour Classes

Tree edges: 0-1, 1-2, 1-3, 3-4, 3-5, 5-6.

BFS from node 0:
- **Class 0** (colour of node 0): {0, 2, 3, 6}
- **Class 1** (colour of node 1): {1, 4, 5}

Node degrees: 0→1, 1→3, 2→1, 3→3, 4→1, 5→2, 6→1.

**Neel state**: flip class of node 1 = {1, 4, 5}. Bitstring (q0..q6): `0100110`, basis index 38.

### 2. Bond Fact: XX, YY, ZZ Commute on One Bond

Verified in 2-qubit space:
- ‖[XX, YY]‖ = 0.00
- ‖[XX, ZZ]‖ = 0.00
- ‖[YY, ZZ]‖ = 0.00

Closed-form vs `expm` difference at θ = 0.37: **2.11e-16** (machine epsilon).

### 3. Commutator Norms: Adjacent vs Disjoint Bond Pairs

| Bond A | Bond B | Share qubit? | ‖[H_a, H_b]‖₂ |
|--------|--------|:---:|---:|
| 0-1 | 1-2 | YES | 5.542563 |
| 0-1 | 1-3 | YES | 5.542563 |
| 0-1 | 3-4 | no | 0.000000 |
| 0-1 | 3-5 | no | 0.000000 |
| 0-1 | 5-6 | no | 0.000000 |
| 1-2 | 1-3 | YES | 4.434050 |
| 1-2 | 3-4 | no | 0.000000 |
| 1-2 | 3-5 | no | 0.000000 |
| 1-2 | 5-6 | no | 0.000000 |
| 1-3 | 3-4 | YES | 3.325538 |
| 1-3 | 3-5 | YES | 3.325538 |
| 1-3 | 5-6 | no | 0.000000 |
| 3-4 | 3-5 | YES | 2.494153 |
| 3-4 | 5-6 | no | 0.000000 |
| 3-5 | 5-6 | YES | 2.078461 |

**Result:** Disjoint bonds have exactly zero commutator norm. Adjacent bonds range from 2.08 to 5.54 (proportional to J_a × J_b). This confirms that Trotter error arises *only* between bonds sharing a qubit.

### 4. Trotter Error Scaling (single-flip site 3, T=1)

Start state: |0001000⟩ (index 8, one excitation at site 3).

| Steps | dt | F (1st) | Error (1st) | F (2nd) | Error (2nd) |
|---:|---:|---:|---:|---:|---:|
| 1 | 1.0000 | 0.3164 | 0.8268 | 0.3086 | 0.8315 |
| 2 | 0.5000 | 0.0240 | 0.9879 | 0.8339 | 0.4076 |
| 4 | 0.2500 | 0.4984 | 0.7083 | 0.9851 | 0.1223 |
| 8 | 0.1250 | 0.8562 | 0.3792 | 0.9990 | **0.0317** |
| 16 | 0.0625 | 0.9633 | 0.1916 | 0.99994 | 0.0080 |
| 32 | 0.0312 | 0.9908 | 0.0958 | 0.999996 | 0.0020 |

**Log-log slopes** (error vs steps, later pairs where asymptotic regime holds):
- 1st order: converges to **-1.00** (last pair: -1.001)
- 2nd order: converges to **-2.00** (last pair: -1.997)

**8 second-order steps error: 0.0317** — matches expected ~0.03. ✓

> [!NOTE]
> At low step counts (1-2 steps), errors are so large that the log-log slope is unreliable.
> The asymptotic slopes (-1 and -2) emerge clearly from 4+ steps onward.

### 5. Design-Space Size

First-order orderings of 6 bonds: 6! = **720**.

With fractions {1, ½, ¼, ⅛}: compositions of 8 (in units of ⅛) using parts {1, 2, 4, 8} = **56 per bond**.

Total fraction assignments for 6 bonds: 56⁶ = **30,840,979,456** (~31 billion).

Multiplied by layer assignments (constrained by collision rules) and multiple epochs, the design space is astronomically larger than 720. This validates that the game has a non-trivial design space beyond simple orderings.

**Minimum layers per epoch** = edge chromatic number of the tree = max degree = **3**.
(Nodes 1 and 3 each have degree 3.)

### 6. Entanglement from Neel Start

At t = 0: all cut entropies = **0.00 bits** (product state). ✓

At t = 1:

| Cut | Sides | Smaller | S (bits) | Bound (bits) | Within? |
|-----|-------|---------|---:|---:|:---:|
| 0-1 | {0}\|{1,2,3,4,5,6} | {0} | 0.877 | 1 | ✓ |
| 1-2 | {0,1,3,4,5,6}\|{2} | {2} | 0.687 | 1 | ✓ |
| 1-3 | {0,1,2}\|{3,4,5,6} | {0,1,2} | 1.453 | 3 | ✓ |
| 3-4 | {0,1,2,3,5,6}\|{4} | {4} | 0.999 | 1 | ✓ |
| 3-5 | {0,1,2,3,4}\|{5,6} | {5,6} | 1.615 | 2 | ✓ |
| 5-6 | {0,1,2,3,4,5}\|{6} | {6} | 0.998 | 1 | ✓ |

All entropies stay within the cut bound min(|A|, |B|) bits. ✓

### 7. Hamiltonian Spectral Norm

‖H‖₂ = **7.584591**

For Taylor series: dt ≤ 1/‖H‖ = **0.131846**

### 8. Single-Flip Populations at T=1

Exact evolution U(1)|0001000⟩ — populations in the one-excitation sector:

| State | Population |
|-------|---:|
| \|0000001⟩ (site 6) | 0.0986 |
| \|0000010⟩ (site 5) | 0.1605 |
| \|0000100⟩ (site 4) | 0.1819 |
| \|0001000⟩ (site 3) | 0.0394 |
| \|0010000⟩ (site 2) | 0.0605 |
| \|0100000⟩ (site 1) | 0.3255 |
| \|1000000⟩ (site 0) | 0.1337 |

Sum = 1.0000. The pulse has spread across the tree, with most amplitude at node 1 (the highest-degree hub closest to the start).

### 9. Qiskit Angle Convention

Verified: `rxx(phi) = exp(-i * phi/2 * XX)`.
For slice with theta = J_b * f * D: use `rxx(2*theta)`, `ryy(2*theta)`, `rzz(2*DELTA*theta)`.
Difference: **0.00**. ✓

## Ambiguities and Resolutions

| Ambiguity | Resolution | Recorded in |
|-----------|------------|-------------|
| Neel bipartite class | Nodes 1, 4, 5 (class of node 1) — confirmed by BFS | AUDIT.md §1 |
| "expected ~0.03" at 8 steps | Measured 0.0317 — within expectation | AUDIT.md §4 |
| "about -1.0 / -2.0" slopes | Asymptotic slopes confirmed at -1.001 / -1.997 | AUDIT.md §4 |
| Bond split (XX+YY) / ZZ as separate controls | Deferred to Phase 4; on one bond they commute so no puzzle value | DESIGN.md |
| World 3 "choose a path with disjoint pairs" | Bonds 0-1 & 3-4 are disjoint; bonds 1-2 & 3-5 are disjoint. Use both pairs. | DESIGN.md |
| Echo world definition | Forward evolution, apply perturbation Z_3 (phase flip on site 3), reverse evolution. Echo fidelity = P(return to start). | DESIGN.md |
| JS engine qubit ordering | Big-endian for internal state; convert at Qiskit bridge | DESIGN.md |

## Unverified on Qollab

- `backend` global availability in Python modules called from JS
- `import * as probe from 'quantum.probe'` syntax
- `.callPromising()` behavior on IonQ backends
- Bit ordering of IonQ count keys
- `backend.name` and other attribute availability
- File size/count limits (will verify with pack.mjs)

All of the above are tested by the smoke project (section 11).
