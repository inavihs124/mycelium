# Mycelium — Trotterized Spin Simulation Puzzle Game

> A Qollab JS/Qiskit project built for the **Qollab Quantum Hackathon**.

## What is it?

**Mycelium** is an [Opus Magnum](https://www.zachtronics.com/opus-magnum/)-style puzzle game where players solve quantum physics problems by designing Trotter schedules. Instead of alchemical transmutations, you're approximating the time evolution of a 7-qubit XXZ spin network.

You place **bond operators** (exact exp(−iθH_bond)) in a grid to build a Trotter step, watch your "machine" evolve, compare it against the exact "ghost" state, and score on **cost** (slices placed), **depth** (layers executed), and **error** (√(1−F)).

## Project Structure

```
qollab/
├── index.html          # Body-only HTML (Qollab rule: no <html>/<head>/<body>)
├── main.css            # Storybook title/map screens + game workbench styling
├── main.js             # Boot entry + title/map navigation shell
├── engine/             # Pure-JS physics engine (no deps)
│   ├── constants.js    # Topology, bonds, DELTA=1
│   ├── complex.js      # Float64Array complex arithmetic
│   ├── bond.js         # Exact bond operator (closed form)
│   ├── state.js        # Statevector management
│   ├── ghost.js        # Exact evolution (30-term Taylor series)
│   ├── schedule.js     # Schedule execution, macro expansion
│   ├── score.js        # Fidelity, error, cost, depth
│   ├── density.js      # Density matrix for noisy evolution
│   ├── entropy.js      # Von Neumann entropy across tree-edge cuts
│   ├── codec.js        # Solution code encoder/decoder (M1.levelId.b64.crc8)
│   └── rng.js          # Seeded PRNG (xorshift128+)
├── game/               # Game logic
│   ├── app.js          # Wires everything together
│   ├── store.js        # Reactive state store with undo/redo
│   ├── render.js       # SVG panel renderer
│   ├── sequencer.js    # Bond×layer grid UI
│   └── levels.js       # 10 levels across 4 chapters
├── quantum/            # Qiskit/Python quantum modules
│   ├── model.py        # Hamiltonian, start states, index conversion
│   ├── circuits.py     # Schedule → Qiskit circuit (rxx/ryy/rzz)
│   ├── reference.py    # 2nd-order Trotter reference + floor
│   ├── verify.py       # ONE backend.run() → populations + fidelity
│   ├── selftest.py     # Startup badge (Qiskit vs scipy)
│   └── quantum_bridge.js  # JS callPromising wrappers
└── data/
    └── goldens.js      # 72 golden test vectors (auto-generated)
```

## Physics

**Hamiltonian:**
```
H = Σ_b J_b (X_i X_j + Y_i Y_j + Δ · Z_i Z_j)    Δ = 1.0
```

**Network (7-qubit tree):**
```
    0
    | J=1.0
    1
   / \
J=0.8  J=0.8
  2     3
       / \
   J=0.6  J=0.6
     4     5
            \
           J=0.5
             6
```

**Bond evolution (exact):**
```
exp(-iθ(XX + YY + Δ·ZZ))   where θ = J_b · fraction · D, D = T/E
```

All three Pauli terms on one bond commute → single bond evolution is **exact**, not approximate.

**Trotter error scaling:**
- 1st order: Error ∝ E⁻¹
- 2nd order: Error ∝ E⁻²

## Running

### In Qollab
Open the complete `qollab/` project in Qollab. The new build starts on an illustrated title screen; choose **Continue journey** to play, or **Pick a level** to open the chapter map. Inside a puzzle, use **Run Pulse** to simulate the schedule. Select a backend (built-in simulator / IBM / IonQ) only when using **Run Quantum Check**.

### UI redesign
The entry experience now has a storybook-style main menu, a four-chapter level map, hand-drawn mushroom/forest SVG artwork, and a calmer puzzle workbench. The menu/map are real HTML/CSS screens wired to the existing level engine. The sequencer, score calculation, simulation, history controls, solution-code import/export, and optional Qiskit bridge remain in place. No external image/font dependency was added.

### Tests (local Node.js)
```bash
# Generate golden test data
python dev/tools/gen_goldens.py

# Run engine tests (18 tests, ~420 ms)
node --test dev/tests/engine/engine.test.mjs

# Platform compliance lint (Qollab rules)
node dev/harness/lint_qollab.mjs

# Par validation hillclimb
node dev/harness/hillclimb.mjs
```

## Backends

| Backend | Notes |
|---------|-------|
| Built-in simulator | Instant, noiseless |
| IBM noise model | Depolarising noise from real device |
| AWS Braket local | sv1 simulator |
| IonQ Aria 1/2 | Remote, real quantum hardware |
| IonQ Forte 1 | Remote, best IonQ device |

**IonQ limit:** One job per run (Qollab restriction). After running a Quantum Check, press **Stop** then **Run** to submit a new job.

## Game Controls

| Key | Action |
|-----|--------|
| `1` / `2` / `3` / `4` | Select fraction 1 / ½ / ¼ / ⅛ |
| Click cell | Place slice |
| Click chip | Remove slice |
| `Z` | Undo |
| `Y` | Redo |
| `R` | Run schedule |
| `M` | Set macro (repeat epoch) |
| `?` | Keyboard help |
| `Esc` | Close overlay |

## Solution Codes

Completed schedules encode as `M1.{levelId}.{base64url}.{crc8}`, e.g.:
```
M1.1-1.IEgsJgJW.7d
```
Paste in the bottom bar to load a schedule.

## Levels

| Level | Name | Concept |
|-------|------|---------|
| 1-1 | First Filament | Single bond |
| 1-2 | Two-Bond Path | Bond ordering |
| 1-3 | Branch Point | Disjoint commuting bonds |
| 2-1 | Repeated Epochs | Macro system |
| 2-2 | Second Order | 2nd-order Trotter |
| 2-3 | Full Network | All 6 bonds, Neel start |
| 3-1 | First Spores | Dephasing noise p=0.02 |
| 3-2 | Noisy Full Network | Noise + depth budget |
| 4-1 | Frugal Filaments | Cost cap = 2 |
| 4-2 | Budget Sprint | Cost cap = 8, E=8 |

## Verified Physics

All numbers below are measured, not adjusted:

| Quantity | Value |
|----------|-------|
| ‖H‖₂ (spectral norm) | 7.5846 |
| Trotter 1st-order slope | −1.00 ± 0.05 |
| Trotter 2nd-order slope | −2.00 ± 0.10 |
| 2nd-order error at E=8, T=1 | 0.0317 |
| Bond exactness max diff | < 1e-12 |
| Ghost vs golden max diff | < 1e-10 |
| Engine tests | 18/18 |
| Lint errors | 0 |

## Architecture Notes

- **No localStorage** (unavailable in Qollab)
- **No `<script>` tags** (Qollab injects scripts)
- **No `fetch()` for local files** (files served differently in Qollab)
- **One `backend.run()` per execution** (IonQ enforces this)
- `backend` is a Qollab global — never constructed in project code
- `callPromising` is the Qollab JS→Python async bridge

## License

MIT — see [LICENSE](LICENSE).

---
*Built for the Qollab Quantum Hackathon 2026.*


## Gameplay UI Refresh — Calm Forest Workbench

The gameplay screen now uses a restrained storybook-forest presentation: a layered SVG night-forest backdrop, seven pastel mushroom nodes connected by a subtle mycelium graph, clearer rounded schedule cells, a compact slice palette, and a quieter Forest Health sidebar. The palette still represents the real Whole/Half/Quarter/Eighth schedule slices, so the visual refresh does not invent new quantum operations or change the physics model.

The update is implemented in `qollab/index.html`, `qollab/main.css`, and `qollab/game/render.js`. Existing simulation state, schedule editing, epoch controls, score calculations, and quantum verification hooks are retained.
