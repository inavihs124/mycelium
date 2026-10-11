"""
quantum/verify.py - Quantum Check: run player circuits on the backend.

One backend.run([...circuits], shots=N) call per execution.
Called from JS via quantum_bridge.js using .callPromising().
Input: JSON string with schedule, level config, tier, shots.
Output: JSON string with results.

Tiers:
  Small (2 circuits): populations + compute-uncompute fidelity
  Medium (≤8 circuits): same at each epoch checkpoint
  Large (stretch): sweep over step counts for sandbox

IMPORTANT: backend is accessed via the 'js' module (Pyodide bridge).
Wrap in try/except: known qiskit-ionq bug reports AttributeError instead of real error.
"""
import json
import numpy as np

def run_verification(config_json):
    """
    Entry point called from quantum_bridge.js via .callPromising(json_string).
    
    Config keys:
      schedule: dict (epochs, macroLinks)
      level: dict (T, E, start, ceiling, noise)
      tier: 'small' | 'medium' | 'large'
      shots: int (default 1024)
      ref_steps: int (default 8)
    
    Returns JSON string.
    """
    import traceback
    try:
        return _run_verification_inner(config_json)
    except AttributeError as e:
        # Known qiskit-ionq bug: AttributeError wraps real error
        return json.dumps({
            'status': 'error',
            'error': str(e),
            'error_type': 'AttributeError',
            'message': (
                'An AttributeError occurred. This is a known qiskit-ionq issue '
                'that wraps the real error (often auth/quota). '
                f'Original: {str(e)}'
            ),
            'ionq_attr_error': True,
        })
    except Exception as e:
        err_str = str(e)
        msg = err_str
        if 'only one job' in err_str.lower():
            msg = ('IonQ backends allow only one job per run. '
                   'Press Stop then Run to submit a new job.')
        return json.dumps({
            'status': 'error',
            'error': err_str,
            'error_type': type(e).__name__,
            'message': msg,
            'ionq_one_job': 'only one job' in err_str.lower(),
            'traceback': traceback.format_exc(),
        })


def _run_verification_inner(config_json):
    import js  # Pyodide bridge to access 'backend' global
    
    config = json.loads(config_json)
    schedule_dict = config['schedule']
    level = config['level']
    tier = config.get('tier', 'small')
    shots = int(config.get('shots', 1024))
    ref_steps = int(config.get('ref_steps', 8))
    
    T = float(level['T'])
    E = int(level['E'])
    start_spec = level['start']
    
    from .circuits import build_circuit_with_measurement, transpile_for_cx_count
    from .reference import build_reference_circuit, reference_inverse, compute_reference_floor
    from .model import (
        start_state, exact_evolution, state_fidelity, state_error,
        js_to_qiskit_index, N, BONDS
    )
    
    # ── Build circuits ────────────────────────────────────────────────
    circuits = []
    circuit_meta = []
    
    # Helper: get start state Qiskit bitstring for compute-uncompute
    psi0 = start_state(start_spec)
    js_start_idx = int(np.argmax(np.abs(psi0)))
    qk_start_idx = js_to_qiskit_index(js_start_idx)
    start_bitstring = f'{qk_start_idx:0{N}b}'
    
    if tier in ('small', 'medium'):
        # Determine checkpoints to evaluate
        if tier == 'small':
            checkpoint_epochs = [E]  # Only final time
        else:  # medium
            # Up to 4 equally-spaced checkpoints
            step = max(1, E // 4)
            checkpoint_epochs = list(range(step, E + 1, step))
            if checkpoint_epochs[-1] != E:
                checkpoint_epochs.append(E)
            checkpoint_epochs = checkpoint_epochs[:4]
        
        for cp_E in checkpoint_epochs:
            cp_T = cp_E * T / E
            
            # Circuit 1: player schedule up to this checkpoint, measure Z-basis
            qc_pop = build_circuit_with_measurement(
                schedule_dict, cp_T, cp_E, start_spec, add_barriers=True
            )
            circuits.append(qc_pop)
            circuit_meta.append({
                'type': 'populations',
                'checkpoint_epoch': cp_E,
                'checkpoint_T': cp_T,
            })
            
            # Circuit 2: player schedule + U_ref^dagger, measure start bitstring
            qc_cc = build_circuit_with_measurement(
                schedule_dict, cp_T, cp_E, start_spec, add_barriers=False
            )
            # Append reference inverse (without reinitializing — compose)
            qc_inv = reference_inverse(cp_T, ref_steps, start_spec)
            # Remove the x-gate initialization from inverse (already done in player circuit)
            # Actually reference_inverse includes initialization; we need just the gate sequence.
            # Build without init:
            from qiskit import QuantumCircuit as QC
            qc_inv_gates = QC(N, N)
            D_ref = cp_T / ref_steps
            for _ in range(ref_steps):
                # Forward half with negative D (inverse)
                for bi in range(len(BONDS)):
                    qi, qj, J = BONDS[bi]
                    theta = J * 0.5 * (-D_ref)
                    qc_inv_gates.rxx(2 * theta, qi, qj)
                    qc_inv_gates.ryy(2 * theta, qi, qj)
                    qc_inv_gates.rzz(2 * float(1.0) * theta, qi, qj)  # DELTA=1
                for bi in reversed(range(len(BONDS))):
                    qi, qj, J = BONDS[bi]
                    theta = J * 0.5 * (-D_ref)
                    qc_inv_gates.rxx(2 * theta, qi, qj)
                    qc_inv_gates.ryy(2 * theta, qi, qj)
                    qc_inv_gates.rzz(2 * float(1.0) * theta, qi, qj)
            
            qc_cc_combined = qc_cc.compose(qc_inv_gates, inplace=False)
            # Remove measurement, add fresh one
            from qiskit import QuantumCircuit as QC2
            # Actually qc_cc already has measurement; compose adds to the end
            # Need to: player circuit (no measure) + inverse gates + measure
            qc_player_nm = build_circuit_with_measurement(
                schedule_dict, cp_T, cp_E, start_spec, add_barriers=False
            ).remove_final_measurements(inplace=False)
            qc_cc_final = qc_player_nm.compose(qc_inv_gates, inplace=False)
            qc_cc_final.measure(range(N), range(N))
            
            circuits.append(qc_cc_final)
            circuit_meta.append({
                'type': 'compute_uncompute',
                'checkpoint_epoch': cp_E,
                'checkpoint_T': cp_T,
                'start_bitstring': start_bitstring,
            })
    
    # Local gate count estimates
    cx_counts = []
    for qc in circuits:
        try:
            cx, ops = transpile_for_cx_count(qc)
            cx_counts.append({'cx': cx, 'ops': ops})
        except Exception as e:
            cx_counts.append({'cx': -1, 'error': str(e)})
    
    # ── Classical reference floor ─────────────────────────────────────
    F_floor, _ = compute_reference_floor(T, ref_steps, start_spec)
    
    # Ideal (classical) predictions
    ideal_predictions = []
    for meta in circuit_meta:
        cp_T = meta['checkpoint_T']
        psi_exact = exact_evolution(psi0, cp_T)
        ideal_predictions.append({
            'fidelity': float(state_fidelity(psi_exact, exact_evolution(psi0, cp_T))),
        })
    
    # ── Submit to backend ─────────────────────────────────────────────
    import time
    t_start = time.time()
    
    be = js.backend
    backend_name = 'unknown'
    try:
        backend_name = str(be.name)
    except Exception:
        pass
    
    job = be.run(circuits, shots=shots)
    result = job.result()
    t_elapsed = time.time() - t_start
    
    # ── Parse results ─────────────────────────────────────────────────
    results_out = []
    
    for i, (meta, cx_info) in enumerate(zip(circuit_meta, cx_counts)):
        counts = dict(result.get_counts(i))
        total = sum(counts.values())
        
        # Compute population for each bitstring
        populations = {}
        for bitstr, count in counts.items():
            p = count / total
            stderr = np.sqrt(p * (1 - p) / total)
            populations[bitstr] = {'prob': float(p), 'stderr': float(stderr)}
        
        if meta['type'] == 'compute_uncompute':
            # Fidelity estimate: P(start_bitstring)
            start_key = start_bitstring
            # Qiskit may pad bitstrings; find key with or without spaces
            found_p = 0.0
            for k, v in counts.items():
                if k.replace(' ', '') == start_key.replace(' ', ''):
                    found_p = v / total
                    break
            measured_fidelity = float(found_p)
            fidelity_stderr = float(np.sqrt(found_p * (1 - found_p) / total))
            
            # Classical Hellinger fidelity of populations vs exact
            psi_exact = exact_evolution(psi0, meta['checkpoint_T'])
            exact_probs = np.abs(psi_exact)**2
            measured_probs = np.zeros(1 << N)
            for k, v in counts.items():
                k_clean = k.replace(' ', '')
                measured_probs[int(k_clean, 2)] += v / total
            
            hellinger = float(np.sum(np.sqrt(exact_probs * measured_probs)))
            
            results_out.append({
                **meta,
                'measured_fidelity': measured_fidelity,
                'fidelity_stderr': fidelity_stderr,
                'hellinger_fidelity': hellinger,
                'reference_floor': float(F_floor),
                'cx_estimate': cx_info,
                'note': 'local estimate, IonQ compiles differently',
            })
        else:
            # Population measurement
            # Compute classical Hellinger fidelity
            psi_exact = exact_evolution(psi0, meta['checkpoint_T'])
            exact_probs = np.abs(psi_exact)**2
            measured_probs = np.zeros(1 << N)
            for k, v in counts.items():
                k_clean = k.replace(' ', '')
                measured_probs[int(k_clean, 2)] += v / total
            hellinger = float(np.sum(np.sqrt(exact_probs * measured_probs)))
            
            results_out.append({
                **meta,
                'populations': populations,
                'hellinger_fidelity': hellinger,
                'cx_estimate': cx_info,
                'note': 'local estimate, IonQ compiles differently',
            })
    
    return json.dumps({
        'status': 'success',
        'backend_name': backend_name,
        'shots': shots,
        'elapsed_seconds': round(t_elapsed, 2),
        'tier': tier,
        'circuits': results_out,
        'reference_floor': float(F_floor),
        'ref_steps': ref_steps,
        'one_job_message': (
            'To check again with a different circuit set, press Stop then Run '
            '(IonQ backends allow one job per run).'
        ),
    })
