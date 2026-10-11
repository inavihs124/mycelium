"""
quantum/circuits.py - Build Qiskit circuits from player schedules.

A schedule JSON contains epochs → layers → slices.
Each slice: { bondIndex: int, fraction: float }
theta = J_b * fraction * D  (D = T/E = epoch duration)
Qiskit gates: rxx(2*theta), ryy(2*theta), rzz(2*DELTA*theta)
"""
import json
from qiskit import QuantumCircuit

from .model import N, BONDS, DELTA, start_state, js_to_qiskit_index

def build_init_circuit(start_spec):
    """Build the initialization circuit: X gates to flip qubits."""
    qc = QuantumCircuit(N, N)
    psi = start_state(start_spec)
    import numpy as np
    js_idx = int(np.argmax(np.abs(psi)))
    # In Qiskit (little-endian), qubit q is bit q of the index
    qk_idx = js_to_qiskit_index(js_idx)
    for q in range(N):
        if (qk_idx >> q) & 1:
            qc.x(q)
    return qc

def build_schedule_circuit(schedule_dict, T, E, start_spec, add_barriers=True):
    """
    Build a Qiskit circuit for the given player schedule.
    
    Args:
        schedule_dict: schedule as dict (epochs, macroLinks)
        T: total evolution time
        E: number of epochs (should equal len(schedule_dict['epochs']))
        start_spec: {'kind': 'single'|'neel', 'site': int}
        add_barriers: if True, add barriers between layers (meaningful depth)
    
    Returns:
        QuantumCircuit(N, N) without measurement
    """
    D = T / E  # epoch duration
    
    # Expand macro links
    epochs = expand_macros(schedule_dict)
    
    qc = build_init_circuit(start_spec)
    
    for epoch in epochs:
        for layer in epoch['layers']:
            for s in layer['slices']:
                bi = s['bondIndex']
                f = s['fraction']
                qi, qj, J = BONDS[bi]
                theta = J * f * D
                
                # Qiskit gates: rxx(2*theta), ryy(2*theta), rzz(2*DELTA*theta)
                # rxx(phi) = exp(-i * phi/2 * XX), so phi = 2*theta
                # Qiskit qubit numbering is little-endian; qi and qj are physical qubit indices.
                # Since BONDS uses physical qubit indices same as Qiskit's qubit numbering,
                # we apply gates directly on qi, qj.
                qc.rxx(2 * theta, qi, qj)
                qc.ryy(2 * theta, qi, qj)
                qc.rzz(2 * DELTA * theta, qi, qj)
            
            if add_barriers:
                qc.barrier()
    
    return qc

def build_circuit_with_measurement(schedule_dict, T, E, start_spec, add_barriers=True):
    """Build circuit and add measurement to all qubits."""
    qc = build_schedule_circuit(schedule_dict, T, E, start_spec, add_barriers)
    qc.measure(range(N), range(N))
    return qc

def expand_macros(schedule_dict):
    """Expand macro links in a schedule, returning a flat list of epochs."""
    epochs_raw = schedule_dict['epochs']
    macro_links = schedule_dict.get('macroLinks', {})
    
    expanded = []
    for i, epoch in enumerate(epochs_raw):
        key = str(i)
        if key in macro_links or i in macro_links:
            src = macro_links.get(key, macro_links.get(i))
            expanded.append(epochs_raw[src])
        else:
            expanded.append(epoch)
    
    return expanded

def get_circuit_gate_counts(qc):
    """Return gate count dict for a circuit."""
    return dict(qc.count_ops())

def transpile_for_cx_count(qc):
    """Transpile circuit and return CX count (local estimate)."""
    from qiskit import transpile as qk_transpile
    t = qk_transpile(qc, basis_gates=['rz', 'sx', 'x', 'cx'], optimization_level=3)
    return t.count_ops().get('cx', 0), dict(t.count_ops())
