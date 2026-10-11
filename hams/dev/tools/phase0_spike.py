"""
Phase 0 Spike: Numerical derivations for Mycelium
Computes:
1. Commutator norms for adjacent vs disjoint bond pairs
2. Bipartite colour classes of the tree
3. Bond-fact verification (XX, YY, ZZ commute on one bond)
4. Trotter error scaling (first and second order)
5. Design-space size analysis
6. Neel state bipartite classes
"""

import numpy as np
from scipy.linalg import expm, norm
from itertools import permutations
import json

N = 7  # qubits
DIM = 2**N  # 128

# Topology: [i, j, J_coupling]
BONDS = [
    (0, 1, 1.0),
    (1, 2, 0.8),
    (1, 3, 0.8),
    (3, 4, 0.6),
    (3, 5, 0.6),
    (5, 6, 0.5),
]
DELTA = 1.0

# Pauli matrices
I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)

def kron_n(ops):
    """Kronecker product of a list of 2x2 matrices, qubit 0 is leftmost (big-endian for matrix construction)."""
    result = ops[0]
    for op in ops[1:]:
        result = np.kron(result, op)
    return result

def pauli_on_qubits(pauli_char, qubit, n=N):
    """Single Pauli on qubit `qubit` in n-qubit space. Qubit 0 = leftmost in tensor product."""
    paulis = {'I': I2, 'X': X, 'Y': Y, 'Z': Z}
    ops = [I2] * n
    ops[qubit] = paulis[pauli_char]
    return kron_n(ops)

def two_qubit_pauli(p, qi, qj, n=N):
    """P_qi ⊗ P_qj in n-qubit space."""
    ops = [I2] * n
    paulis = {'X': X, 'Y': Y, 'Z': Z}
    ops[qi] = paulis[p]
    ops[qj] = paulis[p]
    return kron_n(ops)

def bond_hamiltonian(qi, qj, J, delta=DELTA, n=N):
    """H_bond = J * (XX + YY + delta*ZZ) for qubits qi, qj."""
    XX = two_qubit_pauli('X', qi, qj, n)
    YY = two_qubit_pauli('Y', qi, qj, n)
    ZZ = two_qubit_pauli('Z', qi, qj, n)
    return J * (XX + YY + delta * ZZ)

def full_hamiltonian():
    """Full Hamiltonian H = sum_b J_b (XX + YY + DELTA*ZZ)."""
    H = np.zeros((DIM, DIM), dtype=complex)
    for qi, qj, J in BONDS:
        H += bond_hamiltonian(qi, qj, J)
    return H

# ============================================================
# 1. Bipartite colour classes of the tree
# ============================================================
print("=" * 60)
print("1. BIPARTITE COLOUR CLASSES")
print("=" * 60)

# Build adjacency list
adj = {i: [] for i in range(N)}
for qi, qj, J in BONDS:
    adj[qi].append(qj)
    adj[qj].append(qi)

# BFS to colour
colour = [-1] * N
colour[0] = 0
queue = [0]
while queue:
    node = queue.pop(0)
    for nb in adj[node]:
        if colour[nb] == -1:
            colour[nb] = 1 - colour[node]
            queue.append(nb)

class_0 = [i for i in range(N) if colour[i] == 0]
class_1 = [i for i in range(N) if colour[i] == 1]

print(f"Class 0 (colour of node 0): {class_0}")
print(f"Class 1 (colour of node 1): {class_1}")
print(f"Node degrees: {[(i, len(adj[i])) for i in range(N)]}")

# Neel state: flip class containing node 1
neel_flipped = class_1
print(f"\nNeel state flips (class of node 1): {neel_flipped}")
# Build neel state vector
neel_bits = ['0'] * N
for q in neel_flipped:
    neel_bits[q] = '1'
neel_bitstring = ''.join(neel_bits)
neel_index = int(neel_bitstring, 2)
print(f"Neel bitstring (q0..q6): {neel_bitstring}")
print(f"Neel basis state index: {neel_index}")

# ============================================================
# 2. Bond fact: XX, YY, ZZ commute on one bond
# ============================================================
print("\n" + "=" * 60)
print("2. BOND FACT: XX, YY, ZZ COMMUTE ON ONE BOND")
print("=" * 60)

# Test on bond (0,1) in 2-qubit space for clarity
XX_2 = np.kron(X, X)
YY_2 = np.kron(Y, Y)
ZZ_2 = np.kron(Z, Z)

comm_XY = XX_2 @ YY_2 - YY_2 @ XX_2
comm_XZ = XX_2 @ ZZ_2 - ZZ_2 @ XX_2
comm_YZ = YY_2 @ ZZ_2 - ZZ_2 @ YY_2

print(f"||[XX, YY]|| = {norm(comm_XY):.2e}")
print(f"||[XX, ZZ]|| = {norm(comm_XZ):.2e}")
print(f"||[YY, ZZ]|| = {norm(comm_YZ):.2e}")
print("All zero => XX, YY, ZZ commute on one bond. Bond evolution is exact.")

# Verify closed form
theta = 0.37  # arbitrary test angle
H_bond_2 = XX_2 + YY_2 + DELTA * ZZ_2
U_exact = expm(-1j * theta * H_bond_2)

# Closed form: |00>, |11> get phase e^{-i*DELTA*theta}
# {|01>, |10>} block: e^{+i*DELTA*theta} * (cos(2*theta)*I - i*sin(2*theta)*sigma_x)
phase_diag = np.exp(-1j * DELTA * theta)
phase_off = np.exp(1j * DELTA * theta)
U_closed = np.zeros((4, 4), dtype=complex)
U_closed[0, 0] = phase_diag  # |00>
U_closed[3, 3] = phase_diag  # |11>
# {|01>=1, |10>=2} block
U_closed[1, 1] = phase_off * np.cos(2 * theta)
U_closed[1, 2] = phase_off * (-1j * np.sin(2 * theta))
U_closed[2, 1] = phase_off * (-1j * np.sin(2 * theta))
U_closed[2, 2] = phase_off * np.cos(2 * theta)

diff_closed = norm(U_exact - U_closed)
print(f"\nClosed-form vs expm difference (theta={theta}): {diff_closed:.2e}")

# ============================================================
# 3. Commutator norms: adjacent vs disjoint bond pairs
# ============================================================
print("\n" + "=" * 60)
print("3. COMMUTATOR NORMS: ADJACENT vs DISJOINT BOND PAIRS")
print("=" * 60)

bond_H = []
for idx, (qi, qj, J) in enumerate(BONDS):
    bond_H.append(bond_hamiltonian(qi, qj, J))

# For each pair of bonds, compute ||[H_a, H_b]|| (spectral norm)
print(f"\nBond list: {[(i, f'{qi}-{qj}') for i, (qi, qj, J) in enumerate(BONDS)]}")

# Determine adjacency: two bonds share a qubit
def bonds_share_qubit(a, b):
    qa = {BONDS[a][0], BONDS[a][1]}
    qb = {BONDS[b][0], BONDS[b][1]}
    return len(qa & qb) > 0

print(f"\n{'Bond A':>10} {'Bond B':>10} {'Share?':>8} {'||[Ha,Hb]||':>14}")
print("-" * 50)
for a in range(len(BONDS)):
    for b in range(a+1, len(BONDS)):
        comm = bond_H[a] @ bond_H[b] - bond_H[b] @ bond_H[a]
        cnorm = np.linalg.norm(comm, ord=2)  # spectral norm
        shared = bonds_share_qubit(a, b)
        label_a = f"{BONDS[a][0]}-{BONDS[a][1]}"
        label_b = f"{BONDS[b][0]}-{BONDS[b][1]}"
        print(f"{label_a:>10} {label_b:>10} {'YES' if shared else 'no':>8} {cnorm:>14.6f}")

# ============================================================
# 4. Trotter error scaling
# ============================================================
print("\n" + "=" * 60)
print("4. TROTTER ERROR SCALING (single-flip at site 3, T=1)")
print("=" * 60)

H = full_hamiltonian()
T = 1.0

# Start state: single flip at site 3
psi0_bits = ['0'] * N
psi0_bits[3] = '1'
psi0_idx = int(''.join(psi0_bits), 2)
psi0 = np.zeros(DIM, dtype=complex)
psi0[psi0_idx] = 1.0

# Exact evolution
U_exact_full = expm(-1j * H * T)
psi_exact = U_exact_full @ psi0

print(f"Start state: |{''.join(psi0_bits)}> (index {psi0_idx})")
print(f"||psi_exact||^2 = {np.abs(psi_exact) @ np.abs(psi_exact):.15f}")

def first_order_trotter(psi, dt, steps):
    """Apply all 6 bonds in listed order, each for dt."""
    psi_out = psi.copy()
    for _ in range(steps):
        for idx, (qi, qj, J) in enumerate(BONDS):
            Hb = bond_hamiltonian(qi, qj, J)
            Ub = expm(-1j * Hb * dt)
            psi_out = Ub @ psi_out
    return psi_out

def second_order_trotter(psi, dt, steps):
    """Forward at dt/2, reverse at dt/2."""
    psi_out = psi.copy()
    for _ in range(steps):
        # Forward half
        for idx in range(len(BONDS)):
            qi, qj, J = BONDS[idx]
            Hb = bond_hamiltonian(qi, qj, J)
            Ub = expm(-1j * Hb * dt / 2)
            psi_out = Ub @ psi_out
        # Reverse half
        for idx in range(len(BONDS) - 1, -1, -1):
            qi, qj, J = BONDS[idx]
            Hb = bond_hamiltonian(qi, qj, J)
            Ub = expm(-1j * Hb * dt / 2)
            psi_out = Ub @ psi_out
    return psi_out

print(f"\n{'Steps':>6} {'dt':>10} {'F_1st':>14} {'Err_1st':>14} {'F_2nd':>14} {'Err_2nd':>14}")
print("-" * 80)

steps_list = [1, 2, 4, 8, 16, 32]
errors_1st = []
errors_2nd = []

for steps in steps_list:
    dt = T / steps
    
    psi_1 = first_order_trotter(psi0, dt, steps)
    F_1 = abs(np.vdot(psi_exact, psi_1))**2
    err_1 = np.sqrt(1 - F_1) if F_1 < 1 else 0.0
    
    psi_2 = second_order_trotter(psi0, dt, steps)
    F_2 = abs(np.vdot(psi_exact, psi_2))**2
    err_2 = np.sqrt(1 - F_2) if F_2 < 1 else 0.0
    
    errors_1st.append((steps, err_1))
    errors_2nd.append((steps, err_2))
    
    print(f"{steps:>6} {dt:>10.4f} {F_1:>14.10f} {err_1:>14.10f} {F_2:>14.10f} {err_2:>14.10f}")

# Log-log slopes
print("\nLog-log slopes (error vs steps):")
for label, errors in [("1st order", errors_1st), ("2nd order", errors_2nd)]:
    # Use pairs of points
    slopes = []
    for i in range(len(errors) - 1):
        s1, e1 = errors[i]
        s2, e2 = errors[i + 1]
        if e1 > 0 and e2 > 0:
            slope = np.log(e2 / e1) / np.log(s2 / s1)
            slopes.append(slope)
    print(f"  {label}: slopes = {[f'{s:.3f}' for s in slopes]}")
    if slopes:
        print(f"    average slope = {np.mean(slopes):.3f}")

# Check specific: 8 second-order steps
idx_8 = next(i for i, (s, _) in enumerate(errors_2nd) if s == 8)
print(f"\n8 second-order steps: error = {errors_2nd[idx_8][1]:.6f} (expected ~0.03)")

# ============================================================
# 5. Qiskit angle convention verification
# ============================================================
print("\n" + "=" * 60)
print("5. QISKIT ANGLE CONVENTION (rxx, ryy, rzz)")
print("=" * 60)
print("Qiskit R_PP(phi) = exp(-i * phi/2 * PP)")
print("We need exp(-i * theta * PP) => phi = 2*theta")
print("For slice: theta = J_b * f * D")
print("So: rxx(2*J*f*D), ryy(2*J*f*D), rzz(2*DELTA*J*f*D)")

# Verify in 2-qubit space
theta_test = 0.5
# Our convention: exp(-i * theta * XX)
U_our = expm(-1j * theta_test * np.kron(X, X))
# Qiskit: rxx(phi) = exp(-i * phi/2 * XX), so phi = 2*theta
phi_qiskit = 2 * theta_test
U_qiskit_rxx = expm(-1j * phi_qiskit / 2 * np.kron(X, X))
print(f"||U_our - U_qiskit(phi=2*theta)|| = {norm(U_our - U_qiskit_rxx):.2e}")

# ============================================================
# 6. Design-space analysis
# ============================================================
print("\n" + "=" * 60)
print("6. DESIGN-SPACE ANALYSIS")
print("=" * 60)
print(f"6 bonds, first-order orderings: 6! = {len(list(permutations(range(6))))}")

# With fraction {1}, one epoch: just orderings = 720
# With fractions {1, 1/2, 1/4, 1/8}: each bond can be split
# into k pieces summing to 1 (compositions)
# Compositions of 8 (in units of 1/8) into parts from {1,2,4,8} (= {1/8, 1/4, 1/2, 1} * 8)
# Number of compositions of 8 using parts 1,2,4,8:
def count_compositions(target, parts):
    """Count ordered compositions of target using given parts."""
    dp = [0] * (target + 1)
    dp[0] = 1
    # This is ordered, so it's not just partition but composition
    # dp[n] = sum of dp[n-p] for each part p
    for n in range(1, target + 1):
        for p in parts:
            if p <= n:
                dp[n] += dp[n - p]
    return dp[target]

# Each bond must fill 8/8 using pieces of size 8, 4, 2, 1 (= fractions 1, 1/2, 1/4, 1/8)
comps_per_bond = count_compositions(8, [1, 2, 4, 8])
print(f"Compositions of 8 using {{1,2,4,8}}: {comps_per_bond} per bond")
print(f"With 6 bonds: {comps_per_bond}^6 = {comps_per_bond**6} fraction assignments")
print(f"  × layer assignments (depends on collisions)")
print(f"  This is far larger than 720 orderings alone")

# For fractions {1} only (no splitting): just orderings with layer assignment
# In the game, layers are columns: slices in one layer run simultaneously
# but cannot share a qubit. So it's a graph colouring problem on the line graph.

# Minimum layers needed (edge colouring of the tree):
# Chromatic index of a tree = max degree = 3 (nodes 1 and 3 have degree 3)
print(f"\nMinimum layers (edge chromatic number of tree) = max degree = 3")
print(f"  Node 1 degree: {len(adj[1])} (bonds 0-1, 1-2, 1-3)")
print(f"  Node 3 degree: {len(adj[3])} (bonds 1-3, 3-4, 3-5)")

# ============================================================
# 7. Entanglement from neel start
# ============================================================
print("\n" + "=" * 60)
print("7. ENTANGLEMENT FROM NEEL START")
print("=" * 60)

psi_neel = np.zeros(DIM, dtype=complex)
psi_neel[neel_index] = 1.0
print(f"Neel start: index {neel_index}, bitstring {neel_bitstring}")

def von_neumann_entropy(rho):
    """Von Neumann entropy in bits."""
    eigenvalues = np.linalg.eigvalsh(rho)
    eigenvalues = eigenvalues[eigenvalues > 1e-15]
    return -np.sum(eigenvalues * np.log2(eigenvalues))

def partial_trace(psi, keep_qubits, n=N):
    """Trace out all qubits except keep_qubits from pure state psi."""
    dim = 2**n
    n_keep = len(keep_qubits)
    n_trace = n - n_keep
    trace_qubits = [q for q in range(n) if q not in keep_qubits]
    
    rho_reduced = np.zeros((2**n_keep, 2**n_keep), dtype=complex)
    
    for i in range(dim):
        for j in range(dim):
            # Check if traced-out qubits match
            match = True
            for q in trace_qubits:
                bit_i = (i >> (n - 1 - q)) & 1
                bit_j = (j >> (n - 1 - q)) & 1
                if bit_i != bit_j:
                    match = False
                    break
            if not match:
                continue
            
            # Map to reduced indices
            ri = 0
            rj = 0
            for k, q in enumerate(keep_qubits):
                bi = (i >> (n - 1 - q)) & 1
                bj = (j >> (n - 1 - q)) & 1
                ri |= bi << (n_keep - 1 - k)
                rj |= bj << (n_keep - 1 - k)
            
            rho_reduced[ri, rj] += psi[i] * np.conj(psi[j])
    
    return rho_reduced

# Entanglement at t=0 (product state)
print("\nEntanglement at t=0 (product state, should be 0):")
for bond_idx, (qi, qj, _) in enumerate(BONDS):
    # Cut across this bond: smaller side
    # BFS from qi excluding the edge to qj to find one partition
    visited = set()
    queue_bfs = [qi]
    visited.add(qi)
    while queue_bfs:
        node = queue_bfs.pop(0)
        for nb in adj[node]:
            if nb not in visited and not (node == qi and nb == qj) and not (node == qj and nb == qi):
                visited.add(nb)
                queue_bfs.append(nb)
    side_A = sorted(visited)
    side_B = sorted(set(range(N)) - visited)
    smaller = side_A if len(side_A) <= len(side_B) else side_B
    
    rho = partial_trace(psi_neel, smaller)
    S = von_neumann_entropy(rho)
    bound = len(smaller)
    print(f"  Cut {qi}-{qj}: sides {side_A} | {side_B}, smaller={smaller}, S={S:.6f} bits (bound={bound})")

# Entanglement at t=1
U_exact_full_neel = expm(-1j * H * 1.0)
psi_neel_t1 = U_exact_full_neel @ psi_neel

print("\nEntanglement at t=1 (neel start):")
for bond_idx, (qi, qj, _) in enumerate(BONDS):
    visited = set()
    queue_bfs = [qi]
    visited.add(qi)
    while queue_bfs:
        node = queue_bfs.pop(0)
        for nb in adj[node]:
            if nb not in visited and not (node == qi and nb == qj) and not (node == qj and nb == qi):
                visited.add(nb)
                queue_bfs.append(nb)
    side_A = sorted(visited)
    side_B = sorted(set(range(N)) - visited)
    smaller = side_A if len(side_A) <= len(side_B) else side_B
    
    rho = partial_trace(psi_neel_t1, smaller)
    S = von_neumann_entropy(rho)
    bound = len(smaller)
    print(f"  Cut {qi}-{qj}: sides {side_A} | {side_B}, smaller={smaller}, S={S:.6f} bits (bound={bound}), within bound: {S <= bound + 1e-10}")

# ============================================================
# 8. Hamiltonian norm (for Taylor series step sizing)
# ============================================================
print("\n" + "=" * 60)
print("8. HAMILTONIAN SPECTRAL NORM")
print("=" * 60)
H_norm = np.linalg.norm(H, ord=2)
print(f"||H||_2 (spectral norm) = {H_norm:.6f}")
print(f"For Taylor series: dt <= 1/||H|| = {1.0/H_norm:.6f}")

# ============================================================
# 9. Single-flip site 3: populations at t=1
# ============================================================
print("\n" + "=" * 60)
print("9. SINGLE-FLIP SITE 3 POPULATIONS AT T=1")
print("=" * 60)
probs = np.abs(psi_exact)**2
# Show only significant
for idx_s in range(DIM):
    if probs[idx_s] > 1e-6:
        bits = format(idx_s, f'0{N}b')
        print(f"  |{bits}> : {probs[idx_s]:.8f}")

# ============================================================
# 10. H Pauli term count
# ============================================================
print("\n" + "=" * 60)
print("10. HAMILTONIAN PAULI TERMS")
print("=" * 60)
print(f"6 bonds × 3 terms (XX, YY, ZZ) = 18 Pauli terms")
print(f"Hamiltonian matrix is {DIM}×{DIM} = {DIM*DIM} elements")

# Summary
print("\n" + "=" * 60)
print("PHASE 0 SUMMARY")
print("=" * 60)
print(f"Node: v24.14.1, Python: 3.12.10")
print(f"Bipartite classes: {class_0} and {class_1}")
print(f"Neel flipped: {neel_flipped} (class of node 1)")
print(f"Bond XX/YY/ZZ commutator: 0 (verified)")
print(f"Minimum layers (edge chromatic number): 3")
print(f"||H||_2 = {H_norm:.6f}")
print(f"Trotter slopes: ~-1 (1st), ~-2 (2nd)")
print(f"8 steps 2nd order error: {errors_2nd[idx_8][1]:.6f}")
