"""
quantum/model.py - Physics model for Mycelium
Topology, Hamiltonian, start states, exact evolution.
"""
import numpy as np
from scipy.linalg import expm
from qiskit.quantum_info import SparsePauliOp, Statevector

# ── Constants ────────────────────────────────────────────────────────
N = 7
DIM = 1 << N
DELTA = 1.0

# Bonds: (qubit_i, qubit_j, J_coupling)
BONDS = [
    (0, 1, 1.0),
    (1, 2, 0.8),
    (1, 3, 0.8),
    (3, 4, 0.6),
    (3, 5, 0.6),
    (5, 6, 0.5),
]

# Bipartite class of node 1 (for Neel state): {1, 4, 5}
NEEL_FLIPPED = [1, 4, 5]

# ── Hamiltonian ──────────────────────────────────────────────────────
def make_hamiltonian_sparse():
    """Build H as a Qiskit SparsePauliOp (little-endian: qubit 0 is rightmost)."""
    terms = []
    for qi, qj, J in BONDS:
        # Qiskit SparsePauliOp uses little-endian string: rightmost char = qubit 0
        # For N=7 qubits, a Pauli string has 7 characters, index 0 = qubit 6 (leftmost char)
        # and index 6 = qubit 0 (rightmost char).
        
        def pauli_str(pauli_char, a, b):
            """Build Pauli string with pauli_char at positions a and b (qubit indices)."""
            s = ['I'] * N
            s[N - 1 - a] = pauli_char  # little-endian: qubit a is at position N-1-a from left
            s[N - 1 - b] = pauli_char
            return ''.join(s)
        
        terms.append((pauli_str('X', qi, qj), J))
        terms.append((pauli_str('Y', qi, qj), J))
        terms.append((pauli_str('Z', qi, qj), J * DELTA))
    
    return SparsePauliOp.from_list(terms)

def make_hamiltonian_matrix():
    """Build H as a full 128×128 numpy matrix (big-endian: qubit 0 leftmost)."""
    I2 = np.eye(2, dtype=complex)
    X = np.array([[0, 1], [1, 0]], dtype=complex)
    Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
    Z = np.array([[1, 0], [0, -1]], dtype=complex)
    
    def two_body(P, a, b):
        ops = [I2] * N
        ops[a] = P
        ops[b] = P
        result = ops[0]
        for op in ops[1:]:
            result = np.kron(result, op)
        return result
    
    H = np.zeros((DIM, DIM), dtype=complex)
    for qi, qj, J in BONDS:
        H += J * (two_body(X, qi, qj) + two_body(Y, qi, qj) + DELTA * two_body(Z, qi, qj))
    return H

# ── Start states ─────────────────────────────────────────────────────
def single_flip_state(site=3):
    """Big-endian: qubit site flipped. Index = 1 << (N-1-site)."""
    psi = np.zeros(DIM, dtype=complex)
    psi[1 << (N - 1 - site)] = 1.0
    return psi

def neel_state():
    """Flip bipartite class of node 1: {1, 4, 5}. Index = 38."""
    idx = 0
    for q in NEEL_FLIPPED:
        idx |= 1 << (N - 1 - q)
    psi = np.zeros(DIM, dtype=complex)
    psi[idx] = 1.0
    return psi

def start_state(spec):
    """Create start state from spec dict."""
    if spec['kind'] == 'single':
        return single_flip_state(spec.get('site', 3))
    elif spec['kind'] == 'neel':
        return neel_state()
    raise ValueError(f"Unknown start kind: {spec['kind']}")

def start_state_bitstring_qiskit(spec):
    """
    Qiskit basis state bitstring (little-endian: qubit 0 rightmost).
    For single-flip site 3 (JS index 8 = 0001000 big-endian):
      little-endian: reverse bits -> 0001000 -> same (symmetric for this case)
    """
    psi = start_state(spec)
    js_idx = int(np.argmax(np.abs(psi)))
    # Convert big-endian JS index to little-endian Qiskit index
    qiskit_idx = int('{:0{n}b}'.format(js_idx, n=N)[::-1], 2)
    return f'{qiskit_idx:0{N}b}'

# ── Exact evolution ──────────────────────────────────────────────────
_H_MATRIX = None

def get_H_matrix():
    global _H_MATRIX
    if _H_MATRIX is None:
        _H_MATRIX = make_hamiltonian_matrix()
    return _H_MATRIX

def exact_evolution(psi0, t):
    """Compute exp(-iHt)|psi0> using scipy.linalg.expm."""
    H = get_H_matrix()
    U = expm(-1j * H * t)
    return U @ psi0

def state_fidelity(a, b):
    """F = |<a|b>|^2"""
    return float(np.abs(np.vdot(a, b))**2)

def state_error(a, b):
    """sqrt(1 - F)"""
    F = state_fidelity(a, b)
    return float(np.sqrt(max(0.0, 1.0 - F)))

# ── Index conversion ─────────────────────────────────────────────────
def js_to_qiskit_index(js_idx):
    """Convert big-endian JS index to little-endian Qiskit index."""
    bits = f'{js_idx:0{N}b}'
    return int(bits[::-1], 2)

def qiskit_to_js_index(qk_idx):
    """Convert little-endian Qiskit index to big-endian JS index."""
    bits = f'{qk_idx:0{N}b}'
    return int(bits[::-1], 2)

def state_to_qiskit_sv(psi_big_endian):
    """Convert big-endian numpy state to Qiskit Statevector (little-endian)."""
    psi_qiskit = np.zeros(DIM, dtype=complex)
    for js_idx in range(DIM):
        qk_idx = js_to_qiskit_index(js_idx)
        psi_qiskit[qk_idx] = psi_big_endian[js_idx]
    return Statevector(psi_qiskit)

def sv_to_big_endian(sv):
    """Convert Qiskit Statevector to big-endian numpy array."""
    data = np.array(sv.data)
    psi = np.zeros(DIM, dtype=complex)
    for qk_idx in range(DIM):
        js_idx = qiskit_to_js_index(qk_idx)
        psi[js_idx] = data[qk_idx]
    return psi
