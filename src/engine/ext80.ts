/**
 * x87 80-bit extended precision.
 *
 * MATLAB's `norm(v, 2)` — and `norm(A, 'fro')` — do **not** compute
 * `sqrt(sum(v.^2))` in double precision. Measured against MATLAB R2025b on
 * 1066 reference cases (random vectors of length 1..3000, edge cases and
 * large vectors up to 100 000 elements):
 *
 * | algorithm                                            | bit-exact |
 * |------------------------------------------------------|-----------|
 * | x87 80-bit sum/sqrt of the 80-bit squares            | 1066/1066 |
 * | correctly rounded sqrt of the *exact* sum of squares |  1060/1066 |
 * | `sqrt(sum(v.^2))` in double precision                 |   374/500 |
 * | BLAS `dnrm2` scaled accumulation                      |   261/500 |
 * | folding `hypot` over the elements                     |   218/500 |
 *
 * The 80-bit hypothesis was confirmed by a case where MATLAB's own answer
 * differs by one ulp from the correctly rounded exact value: MATLAB returns
 * `40b0d3ca73b81248`, the exact value rounds to `40b0d3ca73b81249`, and only
 * the 80-bit pipeline reproduces MATLAB's `...248`.
 *
 * On x86-64 macOS the C compiler's `long double` *is* the x87 80-bit format,
 * so MATLAB's `norm` accumulates in `long double`. This module reproduces that
 * format exactly: a sign, an exponent and a **64-bit** significand, with
 * round-to-nearest-even at every operation.
 *
 * A value is stored as `{ neg, e, m }` with
 *
 *     value = (-1)^neg * m * 2^(e - 63)     and     2^63 <= m < 2^64
 *
 * so `e` is the unbiased binary exponent of the value.
 *
 * The intermediate rounding is load-bearing. Accumulating the 64-bit squares
 * *exactly* and rounding only once at the end reproduces MATLAB for just
 * 143 of 1060 cases; rounding to 64 bits after **every** add reproduces
 * 1060 of 1060. The accumulator therefore has to be renormalised after each
 * element, which is what makes this slower than a plain double-precision sum.
 */

const scratch = new ArrayBuffer(8);
const scratchF64 = new Float64Array(scratch);
const scratchU32 = new Uint32Array(scratch);

/** An 80-bit extended precision value. */
interface Ext {
  neg: boolean;
  /** Unbiased binary exponent: `value = (-1)^neg * m * 2^(e - 63)`. */
  e: number;
  /** The 64-bit significand, always in `[2^63, 2^64)` for finite values. */
  m: bigint;
}

const ZERO: Ext = { neg: false, e: 0, m: 0n };

/** The number of bits in a non-negative BigInt. */
function bitLength(v: bigint): number {
  if (v <= 0n) return 0;
  // `toString(2)` allocates a string proportional to the value; this runs once
  // per element of a vector, so count the bits in 32-bit chunks instead.
  let n = 0;
  let x = v;
  while (x > 0xffffffffn) {
    x >>= 32n;
    n += 32;
  }
  return n + (32 - Math.clz32(Number(x)));
}

/**
 * The smallest 64-bit significand whose square needs 128 bits.
 *
 * `sqrt(2) * 2**63` rounded up. A significand at or above this has a 128-bit
 * square; below it the square is 127 bits. Knowing the width up front avoids
 * a generic bit count in the hot loop.
 */
const SQRT2_2_63 = 13043817825332782213n;

/** `2**64` — one past the largest 64-bit significand. */
const TWO64 = 1n << 64n;

/** `2**64 - 1` — the low 64 bits of a BigInt. */
const MASK64 = TWO64 - 1n;

/** `2**63` — half an ulp of a 64-bit significand. */
const HALF64 = 1n << 63n;

/** `2**63 - 1` — the low 63 bits of a BigInt. */
const MASK63 = HALF64 - 1n;

/** `2**62` — half an ulp of a 63-bit significand. */
const HALF63 = 1n << 62n;

/**
 * Round `m * 2^s` to a 64-bit significand and return the normalised pair.
 *
 * The result satisfies `value = m' * 2^(e - 63)` with `2^63 <= m' < 2^64`,
 * and the rounding is round-to-nearest-even.
 */
function normalize64(m: bigint, s: number): { m: bigint; e: number } {
  const bl = bitLength(m);
  if (bl === 0) return { m: 0n, e: 0 };
  if (bl < 64) {
    return { m: m << BigInt(64 - bl), e: s - (64 - bl) + 63 };
  }
  if (bl > 64) {
    const sh = BigInt(bl - 64);
    const q = m >> sh;
    const r = m - (q << sh);
    const half = 1n << (sh - 1n);
    // Round to nearest, ties to even.
    const qq = r > half || (r === half && (q & 1n) === 1n) ? q + 1n : q;
    if (qq >= TWO64) {
      // The rounding carried into a 2**64 significand: renormalise.
      return { m: qq >> 1n, e: s + Number(sh) + 1 + 63 };
    }
    return { m: qq, e: s + Number(sh) + 63 };
  }
  return { m, e: s + 63 };
}

/** Lift a double into the 80-bit format. */
function extFromDouble(x: number): Ext {
  scratchF64[0] = x;
  const hi = scratchU32[1];
  const lo = scratchU32[0];
  const neg = (hi >>> 31) === 1;
  const biased = (hi >>> 20) & 0x7ff;
  const frac = BigInt(lo >>> 0) | (BigInt(hi & 0xfffff) << 32n);
  if (biased === 0) {
    if (frac === 0n) return { neg, e: 0, m: 0n };
    // Subnormal: value = frac * 2**-1074. Normalise the significand.
    const k = bitLength(frac) - 1;
    return { neg, e: k - 1074, m: frac << BigInt(63 - k) };
  }
  // Normal: value = ((1<<52) | frac) * 2**(exp - 52).
  return { neg, e: biased - 1023, m: ((1n << 52n) | frac) << 11n };
}

/** The 80-bit product `a * a`. */
function extSquare(a: Ext): Ext {
  if (a.m === 0n) return ZERO;
  // `a` has the value `m * 2**(e - 63)`, so `a**2` is `m**2 * 2**(2e - 126)`.
  // `normalize64` rounds the 127/128-bit product to a 64-bit significand and
  // adjusts the exponent to match.
  const r = normalize64(a.m * a.m, 2 * (a.e - 63));
  return { neg: false, e: r.e, m: r.m };
}

/**
 * The 80-bit sum `a + b`.
 *
 * The magnitudes are combined exactly (as BigInts) and rounded once, so no
 * precision is lost to cancellation.
 */
function extAdd(a: Ext, b: Ext): Ext {
  if (a.m === 0n) return b;
  if (b.m === 0n) return a;
  const big = a.e >= b.e ? a : b;
  const small = a.e >= b.e ? b : a;
  // Beyond 191 bits of exponent gap the smaller operand is strictly below
  // half an ulp of the larger one and cannot affect the rounding.
  if (big.e - small.e >= 191) return big;
  const s = Math.min(a.e - 63, b.e - 63);
  const A = a.m << BigInt(a.e - 63 - s);
  const B = b.m << BigInt(b.e - 63 - s);
  let mag: bigint;
  let neg: boolean;
  if (a.neg === b.neg) {
    mag = A + B;
    neg = a.neg;
  } else if (A >= B) {
    mag = A - B;
    neg = a.neg;
  } else {
    mag = B - A;
    neg = b.neg;
  }
  if (mag === 0n) return ZERO;
  const r = normalize64(mag, s);
  return { neg, e: r.e, m: r.m };
}

/** The integer square root of a non-negative BigInt. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLength(n) + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  return x;
}

/**
 * The 80-bit square root.
 *
 * The significand is computed exactly with an integer square root: `T` is the
 * truncated root and `r` the remainder, and the root is rounded up exactly
 * when `r > T`. A tie (the root landing precisely halfway) is impossible,
 * because the radicand is an integer while the midpoint of two consecutive
 * integers is not.
 */
function extSqrt(a: Ext): Ext {
  if (a.m === 0n) return ZERO;
  const p = a.e - 63;
  // `sqrt(m * 2**p)`: fold a factor of two into the significand when `p` is
  // odd so that the root's significand always lands in `[2^63, 2^64)`.
  const even = p % 2 === 0;
  const n = even ? a.m : a.m << 1n;
  const s = even ? 32 : 31;
  const radicand = n << BigInt(2 * s);
  const t = isqrt(radicand);
  const rem = radicand - t * t;
  const q = rem > t ? t + 1n : t;
  const base = (even ? p / 2 : (p - 1) / 2) - s;
  if (q >= TWO64) {
    // q === 2**64 exactly: renormalise.
    return { neg: false, e: base + 1 + 63, m: q >> 1n };
  }
  return { neg: false, e: base + 63, m: q };
}

/** Assemble a double from its sign, biased exponent and 52-bit fraction. */
function assemble(neg: boolean, biasedExp: number, frac: bigint): number {
  scratchU32[1] =
    (((neg ? 1 : 0) << 31) | ((biasedExp & 0x7ff) << 20) | Number(frac >> 32n)) >>> 0;
  scratchU32[0] = Number(frac & 0xffffffffn) >>> 0;
  return scratchF64[0];
}

/** Round the 80-bit value down to a double. */
function extToDouble(a: Ext): number {
  if (a.m === 0n) return a.neg ? -0 : 0;
  let e = a.e;
  let m = a.m;
  if (e > 1023) return a.neg ? -Infinity : Infinity;
  if (e >= -1022) {
    // Normal double: the 64-bit significand is rounded to 53 bits.
    const sh = 11n;
    const q = m >> sh;
    const r = m & ((1n << sh) - 1n);
    const half = 1n << 10n;
    let m53 = r > half || (r === half && (q & 1n) === 1n) ? q + 1n : q;
    if (m53 === 1n << 53n) {
      m53 >>= 1n;
      e += 1;
      if (e > 1023) return a.neg ? -Infinity : Infinity;
    }
    return assemble(a.neg, e + 1023, m53 - (1n << 52n));
  }
  // Subnormal double: value = frac * 2**-1074.
  const d = BigInt(-(e + 1011));
  const q = d >= 64n ? 0n : m >> d;
  const r = d >= 64n ? m : m & ((1n << d) - 1n);
  const half = 1n << (d - 1n);
  const frac = r > half || (r === half && (q & 1n) === 1n) ? q + 1n : q;
  if (frac >= 1n << 52n) {
    // Rounded up into the smallest normal.
    return assemble(a.neg, 1, 0n);
  }
  return assemble(a.neg, 0, frac);
}

/**
 * The 2-norm (Euclidean length) of a vector, matching MATLAB bit for bit.
 *
 * This reproduces MATLAB's x87 80-bit pipeline: every square is computed and
 * rounded to 64 significand bits, the squares are accumulated in 80-bit
 * precision, and the square root is taken in 80-bit precision before a
 * single final rounding to a double.
 *
 * The loop is written out flat rather than in terms of `Ext` objects: this
 * runs once per element of the vector, and allocating three short-lived
 * objects per element cost more than the arithmetic did.
 */
export function extendedNorm2(values: number[]): number {
  if (values.length === 0) return 0;
  let hasNaN = false;
  let hasInf = false;
  for (const v of values) {
    if (Number.isNaN(v)) {
      hasNaN = true;
    } else if (!isFinite(v)) {
      hasInf = true;
    }
  }
  if (hasNaN) return NaN;
  if (hasInf) return Infinity;

  // The running 80-bit accumulator: `accM * 2**(accE - 63)`.
  let accM = 0n;
  let accE = 0;
  // The 64-bit significand of the square of the current element.
  let sqM = 0n;
  let sqE = 0;

  for (const v of values) {
    if (v === 0) continue;

    // --- decompose the double into a 64-bit significand and an exponent ---
    scratchF64[0] = v;
    const hi = scratchU32[1];
    const lo = scratchU32[0];
    const biased = (hi >>> 20) & 0x7ff;
    let m: bigint;
    let e: number;
    if (biased === 0) {
      // Subnormal: rare, so take the generic path.
      const d = extFromDouble(v);
      m = d.m;
      e = d.e;
    } else {
      e = biased - 1023;
      // The 64-bit significand is ((1<<52) | frac) << 11.
      const sigHi = (0x80000000 | ((hi & 0xfffff) << 11) | (lo >>> 21)) >>> 0;
      const sigLo = (lo << 11) >>> 0;
      m = (BigInt(sigHi) << 32n) | BigInt(sigLo);
    }

    // --- square it, rounding the exact 127/128-bit product to 64 bits ---
    const p = m * m;
    if (m >= SQRT2_2_63) {
      // 128-bit product: the significand is `p >> 64`.
      const q = p >> 64n;
      const r = p & MASK64;
      const q2 = r > HALF64 || (r === HALF64 && (q & 1n) === 1n) ? q + 1n : q;
      if (q2 >= TWO64) {
        sqM = 1n << 63n;
        sqE = 2 * e + 2;
      } else {
        sqM = q2;
        sqE = 2 * e + 1;
      }
    } else {
      // 127-bit product: the significand is `p >> 63`.
      const q = p >> 63n;
      const r = p & MASK63;
      const q2 = r > HALF63 || (r === HALF63 && (q & 1n) === 1n) ? q + 1n : q;
      if (q2 >= TWO64) {
        sqM = 1n << 63n;
        sqE = 2 * e + 1;
      } else {
        sqM = q2;
        sqE = 2 * e;
      }
    }

    // --- accumulate, rounding to 64 bits after every add ---
    if (accM === 0n) {
      accM = sqM;
      accE = sqE;
      continue;
    }
    if (accE === sqE) {
      // The common case: the sum of two 64-bit significands is 64 or 65 bits.
      const mag = accM + sqM;
      if (mag < TWO64) {
        accM = mag;
      } else {
        // 65 bits: the value is `mag * 2**(accE - 63)`, so dropping the low
        // bit moves the exponent up by one. Round to nearest, ties to even.
        const q = mag >> 1n;
        const r = mag & 1n;
        const q2 = r === 1n && (q & 1n) === 1n ? q + 1n : q;
        if (q2 >= TWO64) {
          // The rounding carried into a 2**64 significand: renormalise, which
          // moves the exponent up by two.
          accM = 1n << 63n;
          accE += 2;
        } else {
          accM = q2;
          accE += 1;
        }
      }
      continue;
    }
    // Different exponents: align on the smaller one and round once.
    const bigE = accE >= sqE ? accE : sqE;
    const smallE = accE >= sqE ? sqE : accE;
    if (bigE - smallE >= 191) {
      // The smaller operand is below half an ulp of the larger one.
      if (sqE > accE) {
        accM = sqM;
        accE = sqE;
      }
      continue;
    }
    const scale = smallE - 63;
    const A = accM << BigInt(accE - 63 - scale);
    const B = sqM << BigInt(sqE - 63 - scale);
    const r = normalize64(A + B, scale);
    accM = r.m;
    accE = r.e;
  }

  if (accM === 0n) return 0;
  return extToDouble(extSqrt({ neg: false, e: accE, m: accM }));
}
