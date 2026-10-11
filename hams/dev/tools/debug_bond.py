"""Debug: check the bond operator apply_bond vs expm for bond 1 (1-2, J=0.8)"""
import numpy as np
from scipy.linalg import expm

N = 7
DIM = 1 << N
DELTA = 1.0

BONDS = [
    (0, 1, 1.0), (1, 2, 0.8), (1, 3, 0.8),
    (3, 4, 0.6), (3, 5, 0.6), (5, 6, 0.5),
]

I2 = np.eye(2, dtype=complex)
X  = np.array([[0,1],[1,0]], dtype=complex)
Y  = np.array([[0,-1j],[1j,0]], dtype=complex)
Z  = np.array([[1,0],[0,-1]], dtype=complex)

def kron_n(ops):
    r = ops[0]
    for o in ops[1:]: r = np.kron(r, o)
    return r

def two_body(P, qi, qj, n=N):
    ops = [I2]*n; ops[qi]=P; ops[qj]=P
    return kron_n(ops)

def bond_H(qi, qj, J, delta=DELTA, n=N):
    return J*(two_body(X,qi,qj,n)+two_body(Y,qi,qj,n)+delta*two_body(Z,qi,qj,n))

def single_flip(site, n=N):
    idx = 1 << (n-1-site)
    psi = np.zeros(DIM, dtype=complex); psi[idx]=1
    return psi

def apply_bond(psi, qi, qj, J, theta, n=N):
    """Apply exp(-i*theta*(XX+YY+DELTA*ZZ)) — note: H_b = J*(XX+YY+DELTA*ZZ)
    but theta here should be J*..., so the full exponent is exp(-i*theta*H_normalized)?
    
    Wait — let me re-read the spec carefully.
    The spec says: theta = J_b * f * D, and the closed form applies to 
    exp(-i*theta*(XX+YY+DELTA*ZZ)) — but H_bond = J*(XX+YY+DELTA*ZZ).
    So exp(-i*theta*H_bond) = exp(-i*theta*J*(XX+YY+DELTA*ZZ)).
    That's exp(-i*(J*theta)*(XX+YY+DELTA*ZZ)).
    
    In my apply_bond, I pass theta = J*f*D directly to the closed form.
    The closed form expects the parameter for exp(-i*param*(XX+YY+DELTA*ZZ)).
    So I should pass param = theta (=J*f*D), not J*theta.
    
    But when I call apply_bond(psi, qi, qj, J, theta=J*f*D), I use theta in the closed form.
    
    But the expm check: Hb = bond_H(qi, qj, J) = J*(XX+YY+DELTA*ZZ)
    expm(-i*theta*Hb) = expm(-i*theta*J*(XX+YY+DELTA*ZZ))
    
    My closed form applies exp(-i*theta*(XX+YY+DELTA*ZZ)) (without the J factor).
    
    So the issue is: my closed form IS the operator for (XX+YY+DELTA*ZZ),
    but I should compare to expm(-i*theta*J*(XX+YY+DELTA*ZZ)) = exp(-i*(J*theta)*(XX+YY+DELTA*ZZ)).
    
    Fix: in apply_bond, use theta directly as the parameter, and pass theta=J*f*D.
    Then compare against expm(-i*theta_param*H_unit) where H_unit = (XX+YY+DELTA*ZZ).
    """
    bit_i = n-1-qi; bit_j = n-1-qj
    mask_i = 1<<bit_i; mask_j = 1<<bit_j
    dtheta = DELTA*theta
    phase00 = np.exp(-1j*dtheta)
    phase_off = np.exp(1j*dtheta)
    diag = phase_off * np.cos(2*theta)
    off  = phase_off * (-1j*np.sin(2*theta))
    psi2 = psi.copy()
    for base in range(DIM):
        if base & (mask_i|mask_j): continue
        i00=base; i01=base|mask_j; i10=base|mask_i; i11=base|mask_i|mask_j
        psi2[i00] = phase00 * psi[i00]
        psi2[i11] = phase00 * psi[i11]
        psi2[i01] = diag*psi[i01] + off*psi[i10]
        psi2[i10] = off*psi[i01] + diag*psi[i10]
    return psi2

# Test bond 1 (1-2, J=0.8)
bi = 1; qi, qj, J = BONDS[bi]; theta = 0.1
psi0 = single_flip(3)

# Our closed form: exp(-i*theta*(XX+YY+DELTA*ZZ))
psi_ours = apply_bond(psi0, qi, qj, J, theta)

# Correct expm: exp(-i*theta*H_bond) = exp(-i*theta*J*(XX+YY+DELTA*ZZ))
Hb = bond_H(qi, qj, J)  # J*(XX+YY+DELTA*ZZ)
psi_expm_full = expm(-1j*theta*Hb) @ psi0

# Unit H: just (XX+YY+DELTA*ZZ) without J factor
ops = [I2]*N; ops[qi]=X; ops[qj]=X
XX = kron_n(ops)
ops = [I2]*N; ops[qi]=Y; ops[qj]=Y
YY = kron_n(ops)
ops = [I2]*N; ops[qi]=Z; ops[qj]=Z
ZZ = kron_n(ops)
H_unit = XX + YY + DELTA*ZZ
psi_expm_unit = expm(-1j*theta*H_unit) @ psi0

print(f"Bond {bi}: J={J}, theta={theta}")
print(f"Our - expm(full H with J):  {np.max(np.abs(psi_ours - psi_expm_full)):.2e}")
print(f"Our - expm(unit H no J):    {np.max(np.abs(psi_ours - psi_expm_unit)):.2e}")

# The correct formula: we want exp(-i*theta*H_bond) where H_bond = J*(XX+YY+DELTA*ZZ)
# = exp(-i*(theta*J)*(XX+YY+DELTA*ZZ))
# So closed form needs parameter = theta*J
print("\nWith param = theta*J:")
psi_ours2 = apply_bond(psi0, qi, qj, J, theta*J)
print(f"Our(theta*J) - expm(full H): {np.max(np.abs(psi_ours2 - psi_expm_full)):.2e}")
