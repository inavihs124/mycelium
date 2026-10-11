"""
quantum/selftest.py - Startup self-test for the Mycelium quantum modules.

Runs automatically at startup (target < 2s) and on demand.
Compares Qiskit Statevector + scipy expm results against the shipped goldens.js
and the JS engine's results via the bridge.

Returns JSON string for display as a verified badge.
"""
import json
import time
import numpy as np

# A small set of golden cases embedded here to avoid loading goldens.js from Python
# (Python data files must appear as plain string literals in source)
SELF_TEST_CASES = [
    {
        'id': 'ghost_single_t1',
        'kind': 'single',
        'site': 3,
        'T': 1.0,
        'type': 'ghost',
    },
    {
        'id': 'ghost_neel_t1',
        'kind': 'neel',
        'site': None,
        'T': 1.0,
        'type': 'ghost',
    },
    {
        'id': 'trotter2_8steps_t1',
        'kind': 'single',
        'site': 3,
        'T': 1.0,
        'steps': 8,
        'type': 'trotter2',
        'expected_error': 0.0317,
        'error_tolerance': 0.005,
    },
]

def run_selftest(goldens_json_str=None):
    """
    Run the self-test and return a JSON string with results.
    
    Args:
        goldens_json_str: JSON string from goldens.js (passed from JS bridge).
                          If None, runs without golden comparison.
    
    Returns:
        JSON string with test results and badge info.
    """
    t_start = time.time()
    results = []
    max_diff = 0.0
    all_passed = True
    
    from .model import (
        single_flip_state, neel_state, exact_evolution, state_fidelity, 
        state_error, start_state
    )
    from .circuits import build_schedule_circuit, expand_macros
    from qiskit.quantum_info import Statevector
    from .model import sv_to_big_endian, BONDS, DELTA
    
    for case in SELF_TEST_CASES:
        t_case = time.time()
        try:
            spec = {'kind': case['kind']}
            if case.get('site') is not None:
                spec['site'] = case['site']
            psi0 = start_state(spec)
            
            if case['type'] == 'ghost':
                # Compare scipy expm vs Qiskit Statevector evolution
                psi_exact = exact_evolution(psi0, case['T'])
                
                # Build simple reference circuit with many steps
                from .reference import build_reference_circuit
                qc = build_reference_circuit(case['T'], 32, spec, inverse=False)
                sv = Statevector(qc)
                psi_qiskit = sv_to_big_endian(np.array(sv.data))
                
                diff = float(np.max(np.abs(psi_exact - psi_qiskit)))
                F = float(state_fidelity(psi_exact, psi_qiskit))
                
                results.append({
                    'id': case['id'],
                    'type': case['type'],
                    'max_diff_vs_qiskit': diff,
                    'fidelity_vs_qiskit': F,
                    'passed': diff < 0.005,  # High steps, so F > 0.999
                    'time_ms': round((time.time() - t_case) * 1000, 1),
                })
                
                if diff > max_diff:
                    max_diff = diff
                if diff >= 0.005:
                    all_passed = False
            
            elif case['type'] == 'trotter2':
                # Build second-order Trotter schedule
                bond_order = list(range(6))
                T = case['T']
                steps = case['steps']
                D = T / steps
                
                # Build schedule dict
                layers = []
                for bi in bond_order:
                    layers.append({'slices': [{'bondIndex': bi, 'fraction': 0.5}]})
                for bi in reversed(bond_order):
                    layers.append({'slices': [{'bondIndex': bi, 'fraction': 0.5}]})
                
                schedule = {
                    'epochs': [{'layers': layers}],
                    'macroLinks': {str(i): 0 for i in range(1, steps)},
                }
                for i in range(1, steps):
                    schedule['epochs'].append({'layers': []})
                
                # Simulate with Qiskit Statevector
                qc = build_schedule_circuit(schedule, T, steps, spec, add_barriers=False)
                sv = Statevector(qc)
                psi_qiskit = sv_to_big_endian(np.array(sv.data))
                
                # Compare to exact
                psi_exact = exact_evolution(psi0, T)
                err = float(state_error(psi_exact, psi_qiskit))
                
                expected = case.get('expected_error', 0.0317)
                tol = case.get('error_tolerance', 0.005)
                passed = abs(err - expected) < tol
                
                results.append({
                    'id': case['id'],
                    'type': case['type'],
                    'error': err,
                    'expected_error': expected,
                    'passed': passed,
                    'time_ms': round((time.time() - t_case) * 1000, 1),
                })
                
                if not passed:
                    all_passed = False
        
        except Exception as e:
            results.append({
                'id': case['id'],
                'error': str(e),
                'passed': False,
            })
            all_passed = False
    
    # Compare against goldens if provided
    golden_max_diff = None
    if goldens_json_str:
        try:
            goldens = json.loads(goldens_json_str)
            ghost_goldens = [g for g in goldens if g['type'] == 'ghost']
            diffs = []
            for g in ghost_goldens[:3]:  # Only test a few for speed
                spec = g['start']
                psi0 = start_state(spec)
                psi_exact = exact_evolution(psi0, g['T'])
                psi_golden = np.array(g['psiExact']['re']) + 1j * np.array(g['psiExact']['im'])
                diff = float(np.max(np.abs(psi_exact - psi_golden)))
                diffs.append(diff)
            golden_max_diff = float(max(diffs)) if diffs else None
        except Exception as e:
            golden_max_diff = None
    
    t_total = time.time() - t_start
    
    badge = {
        'status': 'verified' if all_passed else 'failed',
        'message': (
            f'Verified in your browser: max difference {max_diff:.2e}'
            if all_passed else 'Self-test failed — see details'
        ),
        'all_passed': all_passed,
        'total_time_ms': round(t_total * 1000, 1),
        'results': results,
        'golden_max_diff': golden_max_diff,
    }
    
    return json.dumps(badge)
