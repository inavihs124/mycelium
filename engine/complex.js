/**
 * complex.js - Minimal complex number arithmetic on Float64Array pairs
 * 
 * A complex vector of length n is stored as two Float64Arrays:
 *   re[i], im[i] for i = 0..n-1
 * 
 * A complex matrix of size n×n is stored as two Float64Arrays of length n*n:
 *   re[i*n+j], im[i*n+j] for row i, column j
 * 
 * All operations are in-place where possible for performance.
 */

/**
 * Create a zero complex vector of length n.
 * @param {number} n
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function cvec(n) {
  return { re: new Float64Array(n), im: new Float64Array(n) };
}

/**
 * Create a zero complex matrix of size n×n.
 * @param {number} n
 * @returns {{re: Float64Array, im: Float64Array, n: number}}
 */
export function cmat(n) {
  return { re: new Float64Array(n * n), im: new Float64Array(n * n), n };
}

/**
 * Copy a complex vector.
 * @param {{re: Float64Array, im: Float64Array}} v
 * @returns {{re: Float64Array, im: Float64Array}}
 */
export function cvecCopy(v) {
  return { re: new Float64Array(v.re), im: new Float64Array(v.im) };
}

/**
 * Copy a complex matrix.
 */
export function cmatCopy(m) {
  return { re: new Float64Array(m.re), im: new Float64Array(m.im), n: m.n };
}

/**
 * Set vector to zero.
 */
export function cvecZero(v) {
  v.re.fill(0);
  v.im.fill(0);
}

/**
 * Inner product <a|b> = Σ conj(a[i]) * b[i]
 * @returns {{re: number, im: number}}
 */
export function cvecDot(a, b) {
  let re = 0, im = 0;
  for (let i = 0; i < a.re.length; i++) {
    // conj(a) * b = (ar - i*ai)(br + i*bi) = ar*br + ai*bi + i(ar*bi - ai*br)
    re += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    im += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return { re, im };
}

/**
 * |<a|b>|^2
 */
export function cvecFidelity(a, b) {
  const d = cvecDot(a, b);
  return d.re * d.re + d.im * d.im;
}

/**
 * ||v||^2
 */
export function cvecNorm2(v) {
  let s = 0;
  for (let i = 0; i < v.re.length; i++) {
    s += v.re[i] * v.re[i] + v.im[i] * v.im[i];
  }
  return s;
}

/**
 * v *= scalar (real)
 */
export function cvecScaleReal(v, s) {
  for (let i = 0; i < v.re.length; i++) {
    v.re[i] *= s;
    v.im[i] *= s;
  }
}

/**
 * v *= (sr + i*si)
 */
export function cvecScale(v, sr, si) {
  for (let i = 0; i < v.re.length; i++) {
    const r = v.re[i], m = v.im[i];
    v.re[i] = r * sr - m * si;
    v.im[i] = r * si + m * sr;
  }
}

/**
 * out += v (accumulate)
 */
export function cvecAdd(out, v) {
  for (let i = 0; i < out.re.length; i++) {
    out.re[i] += v.re[i];
    out.im[i] += v.im[i];
  }
}

/**
 * out = a + b
 */
export function cvecSum(a, b) {
  const n = a.re.length;
  const out = cvec(n);
  for (let i = 0; i < n; i++) {
    out.re[i] = a.re[i] + b.re[i];
    out.im[i] = a.im[i] + b.im[i];
  }
  return out;
}

/**
 * out += scale * v (axpy with complex scale)
 */
export function cvecAxpy(out, sr, si, v) {
  for (let i = 0; i < out.re.length; i++) {
    out.re[i] += sr * v.re[i] - si * v.im[i];
    out.im[i] += sr * v.im[i] + si * v.re[i];
  }
}

/**
 * Matrix-vector multiply: out = M * v
 * M is n×n, v is length n
 */
export function cmatVec(M, v) {
  const n = M.n;
  const out = cvec(n);
  for (let i = 0; i < n; i++) {
    let rr = 0, ri = 0;
    for (let j = 0; j < n; j++) {
      const idx = i * n + j;
      const mr = M.re[idx], mi = M.im[idx];
      const vr = v.re[j], vi = v.im[j];
      rr += mr * vr - mi * vi;
      ri += mr * vi + mi * vr;
    }
    out.re[i] = rr;
    out.im[i] = ri;
  }
  return out;
}

/**
 * Matrix-matrix multiply: out = A * B (both n×n)
 */
export function cmatMul(A, B) {
  const n = A.n;
  const out = cmat(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let rr = 0, ri = 0;
      for (let k = 0; k < n; k++) {
        const ar = A.re[i * n + k], ai = A.im[i * n + k];
        const br = B.re[k * n + j], bi = B.im[k * n + j];
        rr += ar * br - ai * bi;
        ri += ar * bi + ai * br;
      }
      out.re[i * n + j] = rr;
      out.im[i * n + j] = ri;
    }
  }
  return out;
}

/**
 * Identity matrix n×n.
 */
export function cmatIdentity(n) {
  const m = cmat(n);
  for (let i = 0; i < n; i++) {
    m.re[i * n + i] = 1;
  }
  return m;
}

/**
 * Hermitian conjugate (dagger) of a matrix.
 */
export function cmatDagger(M) {
  const n = M.n;
  const out = cmat(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.re[i * n + j] = M.re[j * n + i];
      out.im[i * n + j] = -M.im[j * n + i];
    }
  }
  return out;
}

/**
 * Eigenvalues of a Hermitian matrix (Jacobi method).
 * Returns sorted eigenvalues as Float64Array.
 * Only for small matrices (up to ~8×8 for entropy calculations).
 * @param {{re: Float64Array, im: Float64Array, n: number}} M - Hermitian matrix (will be modified)
 * @returns {Float64Array} eigenvalues sorted ascending
 */
export function hermitianEigenvalues(M) {
  const n = M.n;
  // Convert to real symmetric by checking it's actually Hermitian
  // For a Hermitian matrix, we use the Jacobi eigenvalue algorithm
  // on the equivalent 2n×2n real matrix, or since we only need eigenvalues
  // of small matrices (≤8×8), use a direct approach.
  
  // For small matrices, use iterative QR-like approach
  // We'll use a simple Jacobi rotation method
  
  if (n === 1) {
    return new Float64Array([M.re[0]]);
  }
  
  if (n === 2) {
    // 2×2 Hermitian: [[a, b+ic], [b-ic, d]]
    const a = M.re[0], d = M.re[3];
    const br = M.re[1], bi = M.im[1];
    const babs2 = br * br + bi * bi;
    const trace = a + d;
    const det = a * d - babs2;
    const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
    return new Float64Array([trace / 2 - disc, trace / 2 + disc]);
  }
  
  // General case: Jacobi eigenvalue for Hermitian matrices
  // Work with a copy
  const Are = new Float64Array(M.re);
  const Aim = new Float64Array(M.im);
  
  const maxIter = 100 * n * n;
  const tol = 1e-14;
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0, pi = 0, pj = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const idx = i * n + j;
        const mag = Math.sqrt(Are[idx] * Are[idx] + Aim[idx] * Aim[idx]);
        if (mag > maxVal) {
          maxVal = mag;
          pi = i;
          pj = j;
        }
      }
    }
    
    if (maxVal < tol) break;
    
    // Jacobi rotation to zero out element (pi, pj)
    const ii = pi * n + pi, jj = pj * n + pj;
    const ij = pi * n + pj;
    const aii = Are[ii], ajj = Are[jj];
    const aijr = Are[ij], aiji = Aim[ij];
    const aijMag = Math.sqrt(aijr * aijr + aiji * aiji);
    
    if (aijMag < tol) continue;
    
    // Phase to make a_ij real and positive
    const phaseR = aijr / aijMag;
    const phaseI = -aiji / aijMag;
    
    // Now solve 2×2 real symmetric problem
    const tau = (ajj - aii) / (2 * aijMag);
    const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    
    // Apply rotation to rows and columns pi, pj
    // This is a complex Jacobi rotation
    for (let k = 0; k < n; k++) {
      const ki = k * n + pi;
      const kj = k * n + pj;
      
      // Apply phase first: column pj gets multiplied by phase
      const vr = Are[kj] * phaseR - Aim[kj] * phaseI;
      const vi = Are[kj] * phaseI + Aim[kj] * phaseR;
      
      const newKi_r = c * Are[ki] + s * vr;
      const newKi_i = c * Aim[ki] + s * vi;
      const newKj_r = -s * Are[ki] + c * vr;
      const newKj_i = -s * Aim[ki] + c * vi;
      
      Are[ki] = newKi_r; Aim[ki] = newKi_i;
      Are[kj] = newKj_r; Aim[kj] = newKj_i;
    }
    
    for (let k = 0; k < n; k++) {
      const ik = pi * n + k;
      const jk = pj * n + k;
      
      // Apply conjugate phase to row pj
      const vr = Are[jk] * phaseR + Aim[jk] * phaseI;
      const vi = -Are[jk] * phaseI + Aim[jk] * phaseR;
      
      const newIk_r = c * Are[ik] + s * vr;
      const newIk_i = c * Aim[ik] + s * vi;
      const newJk_r = -s * Are[ik] + c * vr;
      const newJk_i = -s * Aim[ik] + c * vi;
      
      Are[ik] = newIk_r; Aim[ik] = newIk_i;
      Are[jk] = newJk_r; Aim[jk] = newJk_i;
    }
  }
  
  // Eigenvalues are on the diagonal
  const evals = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    evals[i] = Are[i * n + i];
  }
  evals.sort();
  return evals;
}
