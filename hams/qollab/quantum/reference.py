"""
quantum/reference.py - High-accuracy reference circuit for time t.

Uses second-order Trotter with configurable steps.
Provides: reference circuit, its inverse (for compute-uncompute fidelity),
and the classical reference floor F_floor = |<psi_exact|psi_ref>|^2.
"""
import numpy as np
from qiskit import QuantumCircuit

from .model import N, BONDS, DELTA, start_state, exact_evolution, state_fidelity, js_to_qiskit_index

# Default steps per level (chosen so F_floor >= 0.999 where budget allows)
DEFAULT_STEPS = {
    'low': 4,
    'medium': 8,
    'high': 16,
    'ultra': 32,
}

def build_reference_circuit(T, steps, start_spec, inverse=False):
    """
    Build a second-order Trotter reference circuit for time T with given steps.
    
    Second-order: forward at D/2 per bond, reverse at D/2 per bond, repeated steps times.
    D = T / steps.
    
    Args:
        T: total time
        steps: number of Trotter steps
        start_spec: start state spec dict
        inverse: if True, reverse the evolution (for compute-uncompute)
    
    Returns:
        QuantumCircuit(N, N)
    """
    D = T / steps
    bond_order = list(range(len(BONDS)))
    
    qc = QuantumCircuit(N, N)
    
    # Initialize
    psi = start_state(start_spec)
    js_idx = int(np.argmax(np.abs(psi)))
    qk_idx = js_to_qiskit_index(js_idx)
    for q in range(N):
        if (qk_idx >> q) & 1:
            qc.x(q)
    
    def add_forward_half(circuit, dt):
        for bi in bond_order:
            qi, qj, J = BONDS[bi]
            theta = J * 0.5 * dt
            circuit.rxx(2 * theta, qi, qj)
            circuit.ryy(2 * theta, qi, qj)
            circuit.rzz(2 * DELTA * theta, qi, qj)
    
    def add_reverse_half(circuit, dt):
        for bi in reversed(bond_order):
            qi, qj, J = BONDS[bi]
            theta = J * 0.5 * dt
            circuit.rxx(2 * theta, qi, qj)
            circuit.ryy(2 * theta, qi, qj)
            circuit.rzz(2 * DELTA * theta, qi, qj)
    
    if not inverse:
        for _ in range(steps):
            add_forward_half(qc, D)
            add_reverse_half(qc, D)
    else:
        # Inverse: reverse the entire sequence
        for _ in range(steps):
            add_forward_half(qc, -D)
            add_reverse_half(qc, -D)
    
    return qc

def reference_inverse(T, steps, start_spec):
    """Build U_ref^dagger for compute-uncompute fidelity measurement."""
    return build_reference_circuit(T, steps, start_spec, inverse=True)

def compute_reference_floor(T, steps, start_spec):
    """
    Compute F_floor = |<psi_exact|psi_ref>|^2 classically.
    Returns (F_floor, steps).
    """
    from qiskit.quantum_info import Statevector
    from .model import sv_to_big_endian
    
    qc = build_reference_circuit(T, steps, start_spec, inverse=False)
    
    # Simulate reference circuit
    sv = Statevector(qc)
    psi_ref = sv_to_big_endian(np.array(sv.data))
    
    # Exact state
    psi0 = start_state(start_spec)
    psi_exact = exact_evolution(psi0, T)
    
    F_floor = state_fidelity(psi_exact, psi_ref)
    return F_floor, steps

def choose_reference_steps(T, start_spec, target_floor=0.999):
    """
    Auto-choose steps so F_floor >= target_floor.
    Returns (steps, F_floor).
    """
    for steps in [4, 8, 16, 32, 64]:
        F_floor, _ = compute_reference_floor(T, steps, start_spec)
        if F_floor >= target_floor:
            return steps, F_floor
    # Return best available
    return 64, compute_reference_floor(T, 64, start_spec)[0]
