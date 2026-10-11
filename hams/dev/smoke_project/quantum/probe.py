"""
Mycelium Smoke Test - Quantum Probe
Builds two circuits and submits them in one backend.run call.
Reports: bit ordering, gate counts, timing, raw count keys.
"""
import json
import time

def run_probe(config_json):
    """Run the smoke probe. Called from JS via .callPromising(json_string)."""
    import numpy as np
    from qiskit import QuantumCircuit, transpile
    
    config = json.loads(config_json)
    shots = config.get('shots', 1024)
    result_data = {}
    
    # Circuit 1: X(0) on 7 qubits - reveals bit ordering
    # If qubit 0 is rightmost in count keys, we expect '0000001'
    # If qubit 0 is leftmost, we expect '1000000'
    c1 = QuantumCircuit(7, 7)
    c1.x(0)
    c1.measure(range(7), range(7))
    c1.name = 'bit_order_probe'
    
    # Circuit 2: rxx/ryy/rzz on bond (0,1) with theta=0.3
    # Tests that abstract gates work on this backend
    theta = 0.3
    c2 = QuantumCircuit(7, 7)
    c2.x(3)  # start state: flip qubit 3
    c2.rxx(2 * theta, 0, 1)
    c2.ryy(2 * theta, 0, 1)
    c2.rzz(2 * 1.0 * theta, 0, 1)  # DELTA=1.0
    c2.measure(range(7), range(7))
    c2.name = 'gate_test'
    
    # Local transpile to count CX gates
    try:
        t1 = transpile(c1, basis_gates=['rz', 'sx', 'x', 'cx'], optimization_level=3)
        t2 = transpile(c2, basis_gates=['rz', 'sx', 'x', 'cx'], optimization_level=3)
        cx_count_1 = t1.count_ops().get('cx', 0)
        cx_count_2 = t2.count_ops().get('cx', 0)
        result_data['local_transpile'] = {
            'c1_cx': cx_count_1,
            'c2_cx': cx_count_2,
            'c1_ops': dict(t1.count_ops()),
            'c2_ops': dict(t2.count_ops()),
        }
    except Exception as e:
        result_data['local_transpile_error'] = str(e)
    
    # Submit ONE job with both circuits
    # backend is passed as global by Qollab in Python entry, but here
    # we receive it from JS. We need to use the global 'backend'.
    # In Qollab JS projects, Python modules access backend differently.
    # The JS side will pass it or we read it from the module scope.
    
    # Actually, in Qollab JS projects calling Python modules,
    # backend is available in the JS scope. The Python function
    # receives it as a parameter or accesses it via the bridge.
    # Let's try accessing it as a global that Qollab injects.
    
    t_start = time.time()
    try:
        # In Qollab, 'backend' should be available in the Python scope
        # when called from a JS project. If not, we'll catch the error.
        import js
        be = js.backend
        
        job = be.run([c1, c2], shots=shots)
        result = job.result()
        
        t_elapsed = time.time() - t_start
        result_data['elapsed_seconds'] = round(t_elapsed, 2)
        
        # Parse counts
        counts_c1 = dict(result.get_counts(0))
        counts_c2 = dict(result.get_counts(1))
        
        result_data['bit_order_probe'] = {
            'raw_keys': list(counts_c1.keys()),
            'counts': counts_c1,
            'interpretation': 'If top key is 0000001 -> qubit 0 is rightmost (standard Qiskit). If 1000000 -> qubit 0 is leftmost.'
        }
        
        result_data['gate_test'] = {
            'raw_keys': list(counts_c2.keys())[:10],
            'counts': {k: v for k, v in sorted(counts_c2.items(), key=lambda x: -x[1])[:10]},
        }
        
        # Backend name (defensive)
        try:
            result_data['backend_name'] = str(be.name)
        except Exception:
            result_data['backend_name'] = 'unknown'
        
        result_data['shots'] = shots
        result_data['status'] = 'SUCCESS'
        
    except Exception as e:
        t_elapsed = time.time() - t_start
        result_data['elapsed_seconds'] = round(t_elapsed, 2)
        result_data['error'] = str(e)
        result_data['error_type'] = type(e).__name__
        
        # Check for known IonQ issues
        err_str = str(e)
        if 'only one job' in err_str.lower():
            result_data['ionq_one_job'] = True
        if 'AttributeError' in type(e).__name__:
            result_data['ionq_attr_error'] = True
        
        result_data['status'] = 'FAILED'
    
    return json.dumps(result_data)
