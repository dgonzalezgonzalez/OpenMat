import { Matrix } from './matrix';
import { MatlabRng } from './rng';
import { num2strMatrix, num2strWithFormat } from './numstr';
import { hypot as fdlibmHypot } from './fdlibm';
import { extendedNorm2 } from './ext80';
import { PlotData } from './types';

export type BuiltinFn = (args: any[], context: BuiltinContext) => any;

export interface BuiltinContext {
  workspace: Record<string, any>;
  output: (text: string) => void;
  addPlot: (plot: PlotData) => void;
  currentPlot?: PlotData;
  setCurrentPlot: (plot: PlotData | undefined) => void;
  holdOn: boolean;
  setHoldOn: (hold: boolean) => void;
  timerStart?: number;
  setTimerStart: (t: number) => void;
  /**
   * The number of outputs the caller asked for.
   *
   * MATLAB's `find` returns row and column indices instead of linear
   * indices when it is called with two outputs, so builtins need to know
   * how many values the caller expects.
   */
  nargout: number;
  /**
   * The number of arguments the enclosing function received, or `-1` at the
   * top level. This is what `nargin` reports.
   */
  nargin: number;
  /**
   * The number of outputs the enclosing function declares, or `0` at the
   * top level. This is what `nargout` reports inside a function body.
   */
  functionNargout: number;
  /**
   * The session's pseudo-random number generator.
   *
   * MATLAB's `twister` generator is reproducible across runs, so scripts that
   * call `rng(seed)` expect the same draw sequence on every run. The
   * generator therefore lives on the interpreter rather than being a
   * module-level singleton.
   */
  rng: MatlabRng;
}

export const BUILTINS: Record<string, BuiltinFn> = {
  // Matrix constructors
  zeros: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.zeros(r, c);
  },

  ones: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.ones(r, c);
  },

  eye: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.eye(r, c);
  },

  rand: (args, ctx) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.rand(r, c, ctx.rng);
  },

  randn: (args, ctx) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.randn(r, c, ctx.rng);
  },

  /**
   * Seed or reset the pseudo-random number generator.
   *
   * `rng(seed)` re-seeds the twister generator, `rng('default')` restores
   * MATLAB's default seed (5489) and `rng('twister')` does the same.
   */
  rng: (args, ctx) => {
    if (args.length === 0) {
      // `rng` with no argument reports the current generator settings.
      ctx.output(`rng = twister (default)`);
      return null;
    }
    const first = args[0];
    if (typeof first === 'string') {
      const kind = first.toLowerCase();
      if (kind === 'default' || kind === 'twister') {
        ctx.rng.seed(5489);
        return null;
      }
      if (kind === 'reset') {
        ctx.rng.seed(5489);
        return null;
      }
      throw new Error(`Unrecognized RNG type: ${first}`);
    }
    ctx.rng.seed(toNum(first, 0));
    return null;
  },

  linspace: (args) => {
    const start = toNum(args[0]);
    const stop = toNum(args[1]);
    const n = args.length > 2 ? toNum(args[2]) : 100;
    return Matrix.linspace(start, stop, n);
  },

  logspace: (args) => {
    const start = toNum(args[0]);
    const stop = toNum(args[1]);
    const n = args.length > 2 ? toNum(args[2]) : 50;
    const lin = Matrix.linspace(start, stop, n);
    return lin.map(v => Math.pow(10, v));
  },

  diag: (args) => {
    const v = toMatrix(args[0]);
    if (v.rows === 1 || v.cols === 1) {
      // Vector to diagonal matrix
      const flat = v.toFlatArray();
      const n = flat.length;
      const m = Matrix.zeros(n, n);
      for (let i = 0; i < n; i++) m.data[i][i] = flat[i];
      return m;
    } else {
      // Extract diagonal of matrix to vector
      const n = Math.min(v.rows, v.cols);
      const res = Matrix.zeros(n, 1);
      for (let i = 0; i < n; i++) res.data[i][0] = v.data[i][i];
      return res;
    }
  },

  // Shape and Inspection
  size: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) {
      const dim = toNum(args[1]);
      return dim === 1 ? Matrix.scalar(m.rows) : Matrix.scalar(m.cols);
    }
    return new Matrix(1, 2, [[m.rows, m.cols]]);
  },

  length: (args) => {
    // MATLAB's `length` of a character array is its number of characters.
    if (typeof args[0] === 'string') {
      return Matrix.scalar(args[0].length);
    }
    const m = toMatrix(args[0]);
    return Matrix.scalar(Math.max(m.rows, m.cols));
  },

  numel: (args) => {
    if (typeof args[0] === 'string') {
      return Matrix.scalar(args[0].length);
    }
    const m = toMatrix(args[0]);
    return Matrix.scalar(m.rows * m.cols);
  },

  isempty: (args) => {
    if (typeof args[0] === 'string') {
      return Matrix.scalar(args[0].length === 0 ? 1 : 0);
    }
    const m = toMatrix(args[0]);
    return Matrix.scalar(m.rows === 0 || m.cols === 0 ? 1 : 0);
  },

  reshape: (args) => {
    const m = toMatrix(args[0]);
    const newRows = toNum(args[1]);
    const newCols = toNum(args[2]);
    // MATLAB reshapes in column-major order.
    const flat = m.toColumnMajor();
    if (newRows * newCols !== flat.length) {
      throw new Error(`To RESHAPE the number of elements must not change (${newRows * newCols} vs ${flat.length})`);
    }
    const res = Matrix.zeros(newRows, newCols);
    let i = 0;
    for (let c = 0; c < newCols; c++) {
      for (let r = 0; r < newRows; r++) {
        res.data[r][c] = flat[i++];
      }
    }
    return res;
  },

  // Linear Algebra
  inv: (args, ctx) => {
    const m = toMatrix(args[0]);
    const inverse = m.inv();
    if (inverse === null) {
      // MATLAB warns and returns infinities for a singular matrix.
      ctx.output('Warning: Matrix is singular to working precision.');
      return Matrix.zeros(m.rows, m.cols).map(() => Infinity);
    }
    return inverse;
  },
  det: (args) => {
    const m = toMatrix(args[0]);
    if (m.rows !== m.cols) {
      throw new Error(
        'Input must be a square matrix to compute determinant.'
      );
    }
    return Matrix.scalar(m.det());
  },
  trace: (args) => {
    const m = toMatrix(args[0]);
    if (m.rows !== m.cols) {
      throw new Error('Matrix must be square.');
    }
    return Matrix.scalar(m.trace());
  },
  norm: (args) => {
    const m = toMatrix(args[0]);
    // MATLAB's `norm(A, p)` supports the 1-, 2- and 'fro' norms for
    // vectors, and the 1- and 'fro' norms for matrices.
    if (args.length > 1) {
      const p = args[1];
      if (typeof p === 'string') {
        const kind = p.toLowerCase();
        if (kind === 'fro') {
          // MATLAB's Frobenius norm is computed in x87 80-bit extended
          // precision, not `sqrt(sum(A(:).^2))` in double precision.
          return Matrix.scalar(extendedNorm2(m.toFlatArray()));
        }
        if (kind === 'inf') {
          // The infinity norm: for a vector, the largest absolute element;
          // for a matrix, the largest absolute row sum.
          if (m.rows === 1 || m.cols === 1) {
            let best = 0;
            for (const v of m.toFlatArray()) best = Math.max(best, Math.abs(v));
            return Matrix.scalar(best);
          }
          return Matrix.scalar(matrixInfNorm(m));
        }
        throw new Error(`Unsupported norm type: ${p}`);
      }
      const pnum = toNum(p, 2);
      if (pnum === 1) {
        if (m.rows === 1 || m.cols === 1) {
          return Matrix.scalar(m.toFlatArray().reduce((a, v) => a + Math.abs(v), 0));
        }
        // Matrix 1-norm: maximum absolute column sum.
        let best = 0;
        for (let c = 0; c < m.cols; c++) {
          let s = 0;
          for (let r = 0; r < m.rows; r++) s += Math.abs(m.data[r][c]);
          best = Math.max(best, s);
        }
        return Matrix.scalar(best);
      }
      if (pnum === 2 && (m.rows === 1 || m.cols === 1)) {
        // The 2-norm of a vector is its length. MATLAB computes it in x87
        // 80-bit extended precision, so this is *not*
        // `sqrt(sum(v.^2))` -- the two differ in the last bits for roughly
        // a quarter of all inputs.
        return Matrix.scalar(extendedNorm2(m.toFlatArray()));
      }
      if (pnum === 2) {
        // Spectral norm: largest singular value.
        const sv = singularValues(m);
        return Matrix.scalar(sv.length ? sv[0] : 0);
      }
      if (pnum === Infinity) {
        if (m.rows === 1 || m.cols === 1) {
          let best = 0;
          for (const v of m.toFlatArray()) best = Math.max(best, Math.abs(v));
          return Matrix.scalar(best);
        }
        return Matrix.scalar(matrixInfNorm(m));
      }
      // General p-norm for vectors.
      const vals = m.toFlatArray().map(Math.abs);
      return Matrix.scalar(Math.pow(vals.reduce((a, v) => a + Math.pow(v, pnum), 0), 1 / pnum));
    }
    // Default: 2-norm for vectors, spectral norm for matrices.
    if (m.rows === 1 || m.cols === 1) {
      return Matrix.scalar(extendedNorm2(m.toFlatArray()));
    }
    const sv = singularValues(m);
    return Matrix.scalar(sv.length ? sv[0] : 0);
  },
  transpose: (args) => toMatrix(args[0]).transpose(),

  // Eigenvalues and singular values
  /**
   * Eigenvalues of a symmetric matrix, as a **column** vector in
   * **ascending** order.
   *
   * MATLAB returns an N-by-1 column, not a row, and the eigenvalues are
   * sorted from smallest to largest: `eig([2 0; 0 3])` is `[2; 3]`.
   */
  eig: (args) => {
    const m = toMatrix(args[0]);
    const { values } = eigenDecomposition(m);
    return Matrix.column([...values].sort((a, b) => a - b));
  },

  /**
   * Singular values in descending order, as a **column** vector.
   */
  svd: (args) => {
    const m = toMatrix(args[0]);
    const sv = singularValues(m);
    return Matrix.column(sv);
  },

  rank: (args) => {
    const m = toMatrix(args[0]);
    const sv = singularValues(m);
    if (sv.length === 0) return Matrix.scalar(0);
    const tol = Math.max(m.rows, m.cols) * sv[0] * 2.220446049250313e-16;
    return Matrix.scalar(sv.filter(s => s > tol).length);
  },

  /**
   * Cholesky factor.
   *
   * MATLAB returns the **upper** triangular `U` with `A = U' * U`, not the
   * lower triangular `L` with `A = L * L'`. For `[4 1; 1 3]` MATLAB gives
   * `[2 0.5; 0 1.6583]`.
   */
  chol: (args) => {
    const m = toMatrix(args[0]);
    const n = m.rows;
    // Compute the lower factor L (A = L * L'), then return its transpose.
    const L = Matrix.zeros(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = m.data[i][j];
        for (let k = 0; k < j; k++) sum -= L.data[i][k] * L.data[j][k];
        if (i === j) {
          if (sum <= 0) throw new Error('Matrix must be positive definite.');
          L.data[i][i] = Math.sqrt(sum);
        } else {
          L.data[i][j] = sum / L.data[j][j];
        }
      }
    }
    return L.transpose();
  },

  // Element-wise Math Functions
  sin: (args) => toMatrix(args[0]).map(x => Math.sin(x)),
  cos: (args) => toMatrix(args[0]).map(x => Math.cos(x)),
  tan: (args) => toMatrix(args[0]).map(x => Math.tan(x)),
  asin: (args) => toMatrix(args[0]).map(x => Math.asin(x)),
  acos: (args) => toMatrix(args[0]).map(x => Math.acos(x)),
  atan: (args) => toMatrix(args[0]).map(x => Math.atan(x)),
  exp: (args) => toMatrix(args[0]).map(x => Math.exp(x)),
  log: (args) => toMatrix(args[0]).map(x => Math.log(x)),
  log10: (args) => toMatrix(args[0]).map(x => Math.log10(x)),
  sqrt: (args) => toMatrix(args[0]).map(x => Math.sqrt(x)),
  abs: (args) => toMatrix(args[0]).map(x => Math.abs(x)),
  floor: (args) => toMatrix(args[0]).map(x => Math.floor(x)),
  ceil: (args) => toMatrix(args[0]).map(x => Math.ceil(x)),

  /**
   * Hyperbolic functions.
   *
   * The inverse hyperbolic functions use the log-based definitions MATLAB
   * uses, so they agree to the last bit on the common cases:
   * `sinh(1) = 1.175201193643801`, `cosh(1) = 1.543080634815244`,
   * `tanh(1) = 0.761594155955765`, `asinh(1) = 0.881373587019543`,
   * `acosh(2) = 1.316957896924817`, `atanh(0.5) = 0.549306144334055`.
   */
  sinh: (args) => toMatrix(args[0]).map(x => Math.sinh(x)),
  cosh: (args) => toMatrix(args[0]).map(x => Math.cosh(x)),
  tanh: (args) => toMatrix(args[0]).map(x => Math.tanh(x)),
  asinh: (args) => toMatrix(args[0]).map(x => Math.asinh(x)),
  acosh: (args) => toMatrix(args[0]).map(x => Math.acosh(x)),
  atanh: (args) => toMatrix(args[0]).map(x => Math.atanh(x)),

  /**
   * `log2` is the base-2 logarithm.
   *
   * `Math.log2` is exact for powers of two (`log2(8) = 3`) and matches
   * MATLAB elsewhere to the last bit.
   */
  log2: (args) => toMatrix(args[0]).map(x => Math.log2(x)),

  /**
   * `log1p` computes `log(1 + x)` accurately for small `x`.
   *
   * MATLAB's `log1p(1e-10)` is `1.000000000000000e-10`; a naive
   * `Math.log(1 + x)` loses the low bits of the argument.
   */
  log1p: (args) => toMatrix(args[0]).map(x => Math.log1p(x)),

  /**
   * `expm1` computes `exp(x) - 1` accurately for small `x`.
   */
  expm1: (args) => toMatrix(args[0]).map(x => Math.expm1(x)),
  /**
   * `round` rounds to the nearest integer, **half away from zero**.
   *
   * JavaScript's `Math.round` rounds half *up* towards +Infinity, so
   * `Math.round(-2.5)` is `-2` while MATLAB gives `-3`. MATLAB's rule is
   * verified as: `round([-3.5 3.5 2.5 -2.5 1.4 0.5 -0.5])` is
   * `[-4 4 3 -3 1 1 -1]`.
   */
  round: (args) =>
    toMatrix(args[0]).map(x => (x < 0 ? -Math.round(-x) : Math.round(x))),

  // Statistics & Reductions
  sum: (args) => {
    const m = toMatrix(args[0]);
    // MATLAB reduces a matrix along dimension 1 (column sums) and a row
    // vector along dimension 2 (a scalar).
    if (args.length > 1) return m.sum(reduceDim(args[args.length - 1]));
    return m.sum(m.rows === 1 ? 2 : 1);
  },

  mean: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) return m.mean(reduceDim(args[args.length - 1]));
    return m.mean(m.rows === 1 ? 2 : 1);
  },

  /**
   * Product.
   *
   * Without a dimension MATLAB reduces over the first non-singleton
   * dimension, so a 2x3 matrix yields a 1x3 row of column products and a
   * row vector yields a scalar.
   */
  prod: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) return m.prod(reduceDim(args[args.length - 1]));
    return m.prod(m.rows === 1 ? 2 : 1);
  },

  /**
   * Cumulative sum.
   *
   * Without a dimension MATLAB accumulates along the first non-singleton
   * dimension and keeps the shape of the input.
   */
  cumsum: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) return m.cumsum(reduceDim(args[args.length - 1]));
    return m.cumsum(m.rows === 1 ? 2 : 1);
  },

  /**
   * Cumulative product.
   *
   * Without a dimension MATLAB accumulates along the first non-singleton
   * dimension and keeps the shape of the input.
   */
  cumprod: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) return m.cumprod(reduceDim(args[args.length - 1]));
    return m.cumprod(m.rows === 1 ? 2 : 1);
  },

  any: (args) => {
    const m = toMatrix(args[0]);
    // Without a dimension MATLAB reduces over the first non-singleton
    // dimension, so a 2x3 matrix yields a 1x3 row.
    if (args.length > 1) return m.anyDim(toNum(args[1]));
    return m.anyDim(m.rows === 1 ? 2 : 1);
  },

  all: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) return m.allDim(toNum(args[1]));
    return m.allDim(m.rows === 1 ? 2 : 1);
  },

  /**
   * `sort` sorts in ascending order.
   *
   * MATLAB's rule, verified against R2025b:
   * - a **row vector** stays a row vector,
   * - a **column vector** stays a column vector,
   * - a **matrix** is sorted **column by column** (dimension 1) and keeps
   *   its shape.
   *
   * `sort(A, 2)` sorts each row instead, and `'descend'` reverses the
   * comparison.
   */
  sort: (args) => {
    const m = toMatrix(args[0]);
    let desc = false;
    let dim: number | null = null;
    for (const a of args.slice(1)) {
      if (typeof a === 'string') {
        if (a.toLowerCase() === 'descend') desc = true;
        else if (a.toLowerCase() === 'ascend') desc = false;
        else throw new Error(`Unsupported sort option: ${a}`);
      } else {
        dim = toNum(a);
      }
    }
    const cmp = (a: number, b: number) => (desc ? b - a : a - b);
    // A vector keeps its orientation; a matrix is sorted column by column
    // unless a dimension is given.
    if (m.rows === 1 || m.cols === 1) {
      const vals = [...m.toFlatArray()].sort(cmp);
      return m.rows === 1 ? new Matrix(1, vals.length, [vals]) : Matrix.column(vals);
    }
    const useDim = dim === 2 ? 2 : 1;
    const res = new Matrix(m.rows, m.cols, m.toFlatArray());
    if (useDim === 1) {
      for (let c = 0; c < m.cols; c++) {
        const col = [];
        for (let r = 0; r < m.rows; r++) col.push(m.data[r][c]);
        col.sort(cmp);
        for (let r = 0; r < m.rows; r++) res.data[r][c] = col[r];
      }
    } else {
      for (let r = 0; r < m.rows; r++) {
        const row = [...m.data[r]];
        row.sort(cmp);
        for (let c = 0; c < m.cols; c++) res.data[r][c] = row[c];
      }
    }
    return res;
  },

  /**
   * `sortrows` sorts the rows of a matrix.
   *
   * With no column argument MATLAB sorts by the leading columns in order,
   * comparing them lexicographically. With a column vector of indices it
   * sorts by those columns only, in the order given. `'descend'` reverses
   * the comparison.
   *
   * Verified against MATLAB: `sortrows([2 1; 1 2])` is `[1 2; 2 1]`,
   * `sortrows([2 1; 1 2], 'descend')` is `[2 1; 1 2]`, and
   * `sortrows([1 3; 1 2], 2)` is `[1 2; 1 3]`.
   */
  sortrows: (args) => {
    const m = toMatrix(args[0]);
    let desc = false;
    let cols: number[] = [];
    for (const a of args.slice(1)) {
      if (typeof a === 'string') {
        if (a.toLowerCase() === 'descend') desc = true;
        else if (a.toLowerCase() === 'ascend') desc = false;
        else throw new Error(`Unsupported sortrows option: ${a}`);
      } else {
        const cm = toMatrix(a);
        for (let c = 0; c < cm.cols; c++) {
          for (let r = 0; r < cm.rows; r++) cols.push(cm.data[r][c] - 1);
        }
      }
    }
    // Without an explicit column list MATLAB sorts by every column, in
    // order, comparing the rows lexicographically.
    if (cols.length === 0) {
      for (let c = 0; c < m.cols; c++) cols.push(c);
    }
    // The row indices, in the order MATLAB's stable sort produces.
    const order = Array.from({ length: m.rows }, (_, i) => i);
    order.sort((ra, rb) => {
      for (const c of cols) {
        const a = m.data[ra][c];
        const b = m.data[rb][c];
        if (a < b) return desc ? 1 : -1;
        if (a > b) return desc ? -1 : 1;
      }
      return 0;
    });
    const res = new Matrix(m.rows, m.cols, m.toFlatArray());
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) res.data[r][c] = m.data[order[r]][c];
    }
    return res;
  },

  /**
   * `find` - indices of the nonzero elements.
   *
   * MATLAB scans in **column-major** order and preserves the *orientation
   * of the input*: a row vector yields a row of indices, a column vector
   * yields a column, and a matrix yields a column. Verified against MATLAB:
   * `find([1 0 2 0 3])` is 1x3, `find([1;0;2])` is 2x1, and
   * `find([1 0 2; 0 3 0])` is 3x1.
   *
   * With two outputs MATLAB returns the row and column indices of the
   * nonzero elements instead, both as column vectors.
   */
  find: (args, ctx) => {
    const m = toMatrix(args[0]);
    const linear: number[] = [];
    const rows: number[] = [];
    const cols: number[] = [];

    for (let c = 0; c < m.cols; c++) {
      for (let r = 0; r < m.rows; r++) {
        // `get` uses 1-based indices.
        if (m.get(r + 1, c + 1) !== 0) {
          rows.push(r + 1);
          cols.push(c + 1);
          linear.push(c * m.rows + r + 1);
        }
      }
    }

    // `find(A, n)` limits the number of results, scanning column-major.
    const limit = args.length > 1 ? toNum(args[1]) : Infinity;
    const take = Math.min(limit, linear.length);
    // With two outputs MATLAB returns the row and column indices.
    if (ctx.nargout >= 2) {
      return [
        Matrix.column(rows.slice(0, take)),
        Matrix.column(cols.slice(0, take))
      ];
    }
    const picked = linear.slice(0, take);
    // A row-vector input keeps its orientation.
    if (m.rows === 1 && m.cols > 1) {
      return new Matrix(1, picked.length, [picked]);
    }
    return Matrix.column(picked);
  },

  /**
   * `triu` - upper triangular part of a matrix.
   *
   * The optional second argument shifts the diagonal: `triu(A, 1)` keeps
   * only the strict upper triangle, `triu(A, -1)` also keeps the diagonal.
   */
  triu: (args) => {
    const m = toMatrix(args[0]);
    const offset = args.length > 1 ? toNum(args[1]) : 0;
    const out = new Matrix(m.rows, m.cols);
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        // `get`/`set` use 1-based indices. MATLAB keeps the element when
        // `c - r >= offset`, so a positive offset drops the diagonal.
        if (c - r >= offset) out.set(r + 1, c + 1, m.get(r + 1, c + 1));
      }
    }
    return out;
  },

  /**
   * `tril` - lower triangular part of a matrix.
   *
   * The optional second argument shifts the diagonal: `tril(A, -1)` keeps
   * only the strict lower triangle, `tril(A, 1)` also keeps the diagonal.
   */
  tril: (args) => {
    const m = toMatrix(args[0]);
    const offset = args.length > 1 ? toNum(args[1]) : 0;
    const out = new Matrix(m.rows, m.cols);
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        // MATLAB keeps the element when `r - c >= -offset`, so a negative
        // offset drops the diagonal.
        if (r - c >= -offset) out.set(r + 1, c + 1, m.get(r + 1, c + 1));
      }
    }
    return out;
  },

  std: (args) => {
    const m = toMatrix(args[0]);
    const vals = m.toFlatArray();
    const n = vals.length;
    if (n === 0) return Matrix.scalar(0);
    const mu = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (n > 1 ? n - 1 : 1);
    return Matrix.scalar(Math.sqrt(variance));
  },

  var: (args) => {
    const m = toMatrix(args[0]);
    const vals = m.toFlatArray();
    const n = vals.length;
    if (n === 0) return Matrix.scalar(0);
    const mu = vals.reduce((a, b) => a + b, 0) / n;
    return Matrix.scalar(vals.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (n > 1 ? n - 1 : 1));
  },

  median: (args) => {
    const m = toMatrix(args[0]);
    const vals = [...m.toFlatArray()].sort((a, b) => a - b);
    if (vals.length === 0) return Matrix.scalar(0);
    const mid = Math.floor(vals.length / 2);
    return Matrix.scalar(
      vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
    );
  },

  dot: (args) => {
    const a = toMatrix(args[0]).toFlatArray();
    const b = toMatrix(args[1]).toFlatArray();
    if (a.length !== b.length) {
      throw new Error(`Arrays have incompatible sizes for this operation (${a.length} vs ${b.length})`);
    }
    return Matrix.scalar(a.reduce((acc, v, i) => acc + v * b[i], 0));
  },

  cross: (args) => {
    const a = toMatrix(args[0]).toFlatArray();
    const b = toMatrix(args[1]).toFlatArray();
    if (a.length !== 3 || b.length !== 3) {
      throw new Error('Cross product requires 3-element vectors');
    }
    return new Matrix(1, 3, [[
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]]);
  },

  kron: (args) => {
    const a = toMatrix(args[0]);
    const b = toMatrix(args[1]);
    const res = Matrix.zeros(a.rows * b.rows, a.cols * b.cols);
    for (let ar = 0; ar < a.rows; ar++) {
      for (let ac = 0; ac < a.cols; ac++) {
        for (let br = 0; br < b.rows; br++) {
          for (let bc = 0; bc < b.cols; bc++) {
            res.data[ar * b.rows + br][ac * b.cols + bc] = a.data[ar][ac] * b.data[br][bc];
          }
        }
      }
    }
    return res;
  },

  repmat: (args) => {
    const a = toMatrix(args[0]);
    const r = toNum(args[1], 1);
    const c = args.length > 2 ? toNum(args[2], r) : r;
    const res = Matrix.zeros(a.rows * r, a.cols * c);
    for (let br = 0; br < r; br++) {
      for (let bc = 0; bc < c; bc++) {
        for (let ir = 0; ir < a.rows; ir++) {
          for (let ic = 0; ic < a.cols; ic++) {
            res.data[br * a.rows + ir][bc * a.cols + ic] = a.data[ir][ic];
          }
        }
      }
    }
    return res;
  },

  fliplr: (args) => {
    const a = toMatrix(args[0]);
    const res = Matrix.zeros(a.rows, a.cols);
    for (let r = 0; r < a.rows; r++) {
      for (let c = 0; c < a.cols; c++) res.data[r][c] = a.data[r][a.cols - 1 - c];
    }
    return res;
  },

  flipud: (args) => {
    const a = toMatrix(args[0]);
    const res = Matrix.zeros(a.rows, a.cols);
    for (let r = 0; r < a.rows; r++) {
      for (let c = 0; c < a.cols; c++) res.data[r][c] = a.data[a.rows - 1 - r][c];
    }
    return res;
  },

  // Element-wise arithmetic helpers
  mod: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (a, b) => a - Math.floor(a / b) * b),
  rem: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (a, b) => a % b),
  sign: (args) => toMatrix(args[0]).map(x => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  fix: (args) => toMatrix(args[0]).map(x => (x < 0 ? Math.ceil(x) : Math.floor(x))),
  atan2: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (y, x) => Math.atan2(y, x)),
  hypot: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (a, b) => fdlibmHypot(a, b)),

  /**
   * Greatest common divisor.
   *
   * MATLAB's `gcd` is elementwise and always returns a non-negative
   * value: `gcd(12, 18) = 6` and `gcd(-12, 18) = 6`.
   */
  gcd: (args) => {
    const a = toMatrix(args[0]);
    const b = toMatrix(args[1]);
    return a.elementWise(b, (x, y) => gcdValue(x, y));
  },

  /**
   * Least common multiple.
   *
   * `lcm(4, 6) = 12`. MATLAB returns 0 when either argument is 0.
   */
  lcm: (args) => {
    const a = toMatrix(args[0]);
    const b = toMatrix(args[1]);
    return a.elementWise(b, (x, y) => {
      const g = gcdValue(x, y);
      if (g === 0) return 0;
      return Math.abs(x * y) / g;
    });
  },
  power: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (a, b) => Math.pow(a, b)),
  nthroot: (args) => toMatrix(args[0]).elementWise(toMatrix(args[1]), (a, b) => Math.pow(a, 1 / b)),

  // Strings
  num2str: (args) => {
    const v = args[0];
    if (v instanceof Matrix) {
      // MATLAB's `num2str` follows two different algorithms: an integer
      // path with fixed field widths, and a floating point path whose
      // precision depends on the magnitude of the largest element. See
      // src/engine/numstr.ts for the port of MATLAB's own implementation.
      if (args.length > 1 && typeof args[1] === 'string') {
        return num2strWithFormat(v, args[1]);
      }
      return num2strMatrix(v);
    }
    return String(v);
  },

  str2num: (args) => {
    const parsed = parseFloat(String(args[0]));
    return Matrix.scalar(Number.isNaN(parsed) ? 0 : parsed);
  },

  /**
   * Concatenate arrays along a dimension.
   *
   * `cat(dim, A, B, ...)` is the general form; `horzcat` and `vertcat` are
   * the two-dimension special cases that replication scripts use most.
   */
  cat: (args) => {
    const dim = toNum(args[0], 1);
    const parts = args.slice(1).map((a) => toMatrix(a));
    if (dim !== 1 && dim !== 2) {
      throw new Error('CAT only supports dimensions 1 or 2.');
    }
    return Matrix.concat(dim === 1 ? 1 : 2, parts);
  },

  horzcat: (args) => Matrix.concat(2, args.map((a) => toMatrix(a))),
  vertcat: (args) => Matrix.concat(1, args.map((a) => toMatrix(a))),

  strcat: (args) => args.map((a) => String(a)).join(''),
  strrep: (args) => String(args[0]).split(String(args[1])).join(String(args[2])),
  upper: (args) => String(args[0]).toUpperCase(),
  lower: (args) => String(args[0]).toLowerCase(),
  strtrim: (args) => String(args[0]).trim(),

  /**
   * String comparison.
   *
   * MATLAB's `strcmp` is elementwise over char arrays and cell arrays of
   * char, and returns a logical array. OpenMat models a string as a
   * JavaScript string, so the common case is a single comparison; cell
   * arrays are not supported and an explicit error is better than a
   * silently wrong answer.
   */
  strcmp: (args) => Matrix.scalar(String(args[0]) === String(args[1]) ? 1 : 0),
  strcmpi: (args) =>
    Matrix.scalar(String(args[0]).toLowerCase() === String(args[1]).toLowerCase() ? 1 : 0),
  strncmp: (args) => {
    // MATLAB requires the length argument: `strncmp(a, b)` errors with
    // "Not enough input arguments."
    if (args.length < 3) {
      throw new Error('Not enough input arguments.');
    }
    const a = String(args[0]);
    const b = String(args[1]);
    const n = toNum(args[2]);
    return Matrix.scalar(a.slice(0, n) === b.slice(0, n) ? 1 : 0);
  },
  strncmpi: (args) => {
    if (args.length < 3) {
      throw new Error('Not enough input arguments.');
    }
    const a = String(args[0]).toLowerCase();
    const b = String(args[1]).toLowerCase();
    const n = toNum(args[2]);
    return Matrix.scalar(a.slice(0, n) === b.slice(0, n) ? 1 : 0);
  },

  /**
   * Numeric predicates.
   *
   * MATLAB's `isnan`/`isinf` return a logical array the same shape as the
   * input; OpenMat has no logical type, so a 0/1 double array is the
   * closest faithful representation.
   */
  isnan: (args) => toMatrix(args[0]).map(v => (Number.isNaN(v) ? 1 : 0)),
  isinf: (args) => toMatrix(args[0]).map(v => (v === Infinity || v === -Infinity ? 1 : 0)),
  isfinite: (args) =>
    toMatrix(args[0]).map(v => (Number.isFinite(v) ? 1 : 0)),
  isreal: (args) => toMatrix(args[0]).map(() => 1),
  isnumeric: (args) => toMatrix(args[0]).map(() => 1),

  /**
   * `true` / `false` — MATLAB's logical constants.
   *
   * With no argument MATLAB returns a 1x1 logical; with one or two
   * arguments it returns a logical array of that size. The scalar form is a
   * real JavaScript boolean so that `if true`, `~true` and `true && false`
   * behave exactly as in MATLAB; the array form is a matrix flagged
   * `isLogical` so that `class` and `islogical` can report `'logical'`.
   */
  true: (args) => {
    if (args.length === 0) return true;
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    const m = Matrix.ones(r, c);
    m.isLogical = true;
    return m;
  },

  false: (args) => {
    if (args.length === 0) return false;
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    const m = Matrix.zeros(r, c);
    m.isLogical = true;
    return m;
  },

  /**
   * `logical(x)` — convert a numeric array to logical.
   *
   * MATLAB refuses to convert `NaN` to a logical ("NaN values cannot be
   * converted to logicals"), so the engine does too.
   */
  logical: (args) => {
    const v = args[0];
    if (typeof v === 'boolean') return v;
    const m = toMatrix(v);
    const out = m.map(x => {
      if (Number.isNaN(x)) {
        throw new Error('NaN values cannot be converted to logicals.');
      }
      return x === 0 ? 0 : 1;
    });
    out.isLogical = true;
    return out;
  },

  /**
   * `double(x)` — convert to a double.
   *
   * The engine stores every number as an IEEE double already, so this is the
   * identity on numerics; it only drops the logical flag.
   */
  double: (args) => {
    const v = args[0];
    if (typeof v === 'boolean') return v ? 1 : 0;
    return toMatrix(v);
  },

  /** `islogical(x)` — true only for logical values. */
  islogical: (args) => {
    const v = args[0];
    if (typeof v === 'boolean') return true;
    if (v instanceof Matrix) return v.isLogical;
    return false;
  },

  /** `isscalar(x)` — true for 1x1 arrays and scalars. */
  isscalar: (args) => {
    const v = args[0];
    if (v instanceof Matrix) return v.rows === 1 && v.cols === 1;
    if (typeof v === 'number' || typeof v === 'boolean') return true;
    return false;
  },

  /** `isrow(x)` — true for 1xN arrays. */
  isrow: (args) => {
    const v = args[0];
    if (v instanceof Matrix) return v.rows === 1 && v.cols > 1;
    return false;
  },

  /** `iscolumn(x)` — true for Nx1 arrays. */
  iscolumn: (args) => {
    const v = args[0];
    if (v instanceof Matrix) return v.cols === 1 && v.rows > 1;
    return false;
  },

  /** `isvector(x)` — true for 1xN and Nx1 arrays. */
  isvector: (args) => {
    const v = args[0];
    if (v instanceof Matrix) return v.rows === 1 || v.cols === 1;
    return false;
  },

  /** `ismatrix(x)` — true for any 2-D array. */
  ismatrix: (args) => {
    const v = args[0];
    if (v instanceof Matrix) return v.rows > 0 && v.cols > 0;
    return false;
  },

  /**
   * `flip(A)` — reverse the order of the elements along a dimension.
   *
   * MATLAB flips along the first non-singleton dimension when no dimension
   * is given, which is why `flip([1 2 3])` reverses the row rather than
   * doing nothing.
   */
  flip: (args) => {
    const m = toMatrix(args[0]);
    const dim = args.length > 1 ? toNum(args[1], 0) : firstNonSingletonDim(m);
    return flipDim(m, dim);
  },

  /**
   * `rot90(A)` — rotate 90 degrees counter-clockwise.
   */
  rot90: (args) => {
    const m = toMatrix(args[0]);
    const times = args.length > 1 ? toNum(args[1], 1) : 1;
    let out = m;
    for (let i = 0; i < ((times % 4) + 4) % 4; i++) {
      out = rotate90Once(out);
    }
    return out;
  },

  /**
   * `meshgrid(x, y)` — 2-D grid coordinates.
   *
   * MATLAB's `meshgrid` returns arrays of size `length(y) x length(x)`, with
   * the first output varying along the *columns*; `ndgrid` returns the
   * transposed shapes. The two are not interchangeable.
   */
  meshgrid: (args) => {
    const xv = toMatrix(args[0]).toFlatArray();
    const yv = toMatrix(args[1]).toFlatArray();
    const ny = yv.length;
    const nx = xv.length;
    const x = new Matrix(ny, nx);
    const y = new Matrix(ny, nx);
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        x.set(r + 1, c + 1, xv[c]);
        y.set(r + 1, c + 1, yv[r]);
      }
    }
    return [x, y];
  },

  /**
   * `ndgrid(x, y)` — 2-D grid coordinates with the opposite orientation to
   * `meshgrid`: both outputs have size `length(x) x length(y)`.
   */
  ndgrid: (args) => {
    const xv = toMatrix(args[0]).toFlatArray();
    const yv = toMatrix(args[1]).toFlatArray();
    const nx = xv.length;
    const ny = yv.length;
    const x = new Matrix(nx, ny);
    const y = new Matrix(nx, ny);
    for (let r = 0; r < nx; r++) {
      for (let c = 0; c < ny; c++) {
        x.set(r + 1, c + 1, xv[r]);
        y.set(r + 1, c + 1, yv[c]);
      }
    }
    return [x, y];
  },

  /**
   * `strfind(str, pattern)` — positions of the non-overlapping matches.
   *
   * MATLAB does not return overlapping matches: `strfind('hello','ll')` is
   * `3`, not `[3 4]`, because the search resumes after the end of the first
   * match. A miss returns a 0x0 array.
   */
  strfind: (args) => {
    const s = String(args[0] ?? '');
    const pattern = String(args[1] ?? '');
    if (pattern.length === 0) return Matrix.zeros(0, 0);
    const hits: number[] = [];
    let from = 0;
    for (;;) {
      const at = s.indexOf(pattern, from);
      if (at < 0) break;
      hits.push(at + 1);
      from = at + pattern.length;
    }
    if (hits.length === 0) return Matrix.zeros(0, 0);
    return new Matrix(1, hits.length, [hits]);
  },

  /**
   * `real`/`imag` on a real-valued array.
   *
   * OpenMat has no complex numbers, so `real` is the identity and `imag`
   * is zero. They are provided because replication code calls them
   * unconditionally on results that may or may not be complex.
   */
  real: (args) => toMatrix(args[0]),
  imag: (args) => toMatrix(args[0]).map(() => 0),
  conj: (args) => toMatrix(args[0]),

  /**
   * `unique` with the default sorted order.
   *
   * MATLAB sorts the result and, for numeric input, compares the *values*
   * (so `1` and `1.0` are the same element). The optional second output
   * gives the index of the last occurrence of each unique value in the
   * original array, matching MATLAB's default (not the "first" variant).
   */
  unique: (args, ctx) => {
    const m = toMatrix(args[0]);
    const values = m.toFlatArray();
    // Sort by value; NaN sorts last, as in MATLAB.
    const order = values
      .map((v, i) => ({ v, i }))
      .sort((a, b) => {
        const an = Number.isNaN(a.v);
        const bn = Number.isNaN(b.v);
        if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
        return a.v - b.v || a.i - b.i;
      });
    const out: number[] = [];
    const firstIndex: number[] = [];
    for (const { v, i } of order) {
      if (out.length === 0 || !sameValue(out[out.length - 1], v)) {
        out.push(v);
        firstIndex.push(i + 1);
      }
      // A repeated value keeps the FIRST index, because MATLAB guarantees
      // `C = A(ia)`: for `unique([3 1 3 2 1 5])` MATLAB returns
      // `ia = [2 4 1 6]`, and `A(ia) = [1 2 3 5] = C`.
    }
    if (values.length === 0) {
      // MATLAB returns a 0x1 empty for `unique([])`, not a 1x0 row.
      const emptyRes = Matrix.zeros(0, 1);
      if (ctx.nargout >= 2) return [emptyRes, Matrix.zeros(0, 1)];
      return emptyRes;
    }
    // Like `sort`, `unique` preserves the *orientation of the input*: a row
    // vector yields a row of unique values, a column vector a column, and a
    // matrix a column. Verified against MATLAB: `unique([3 1 3 2 1 5])` is
    // 1x4 and `unique([3;1;3;2;1;5])` is 4x1.
    const res = m.rows === 1 && m.cols > 1
      ? new Matrix(1, out.length, [out])
      : Matrix.column(out);
    if (ctx.nargout >= 2) {
      // MATLAB's second output is a column vector of the index of the
      // FIRST occurrence of each unique value, so that `A(ia)` reproduces
      // the unique vector.
      return [res, Matrix.column(firstIndex)];
    }
    return res;
  },

  /**
   * One-dimensional linear interpolation.
   *
   * MATLAB's **default method is `spline`**, not `linear`. On a uniform
   * grid the not-a-knot cubic reduces to linear interpolation, so the two
   * agree there — but on a non-uniform grid they do not, and the default
   * is what `interp1(x, y, q)` uses.
   *
   * The `nearest` method is **not** "the nearest sample point". MATLAB
   * rounds the query to the nearest *index*, i.e. it compares the query
   * against the midpoints between consecutive samples and picks the sample
   * on the side the midpoint falls. Verified against MATLAB R2025b:
   *
   *   - `x = [1 2 4]`, `q = 3` (the midpoint of 2 and 4) -> the value at
   *     4, not at 2. A "nearest sample" rule would give 20 here.
   *   - `q = 2.9999999` -> 20 and `q = 3.0000001` -> 40, so the tie at
   *     the midpoint resolves to the HIGHER sample.
   *
   * `previous` and `next` return the sample below and above the query
   * respectively. Out-of-range queries return NaN, as in MATLAB.
   * `extrap` is not implemented.
   */
  interp1: (args) => {
    const x = toMatrix(args[0]).toFlatArray();
    const y = toMatrix(args[1]).toFlatArray();
    const xq = toMatrix(args[2]).toFlatArray();
    const method = args.length > 3 ? String(args[3]).toLowerCase() : 'spline';
    const n = Math.min(x.length, y.length);
    if (n === 0) return Matrix.zeros(1, xq.length);

    const at = (q: number): number => {
      if (Number.isNaN(q)) return NaN;
      if (q < x[0] || q > x[n - 1]) return NaN;
      if (q === x[n - 1]) return y[n - 1];
      // Find the interval containing q.
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (x[mid] <= q) lo = mid;
        else hi = mid;
      }
      const dx = x[hi] - x[lo];
      switch (method) {
        case 'nearest': {
          // Compare against the midpoint of the bracketing samples. A tie
          // resolves to the HIGHER sample: for `x = [1 2 3]`, MATLAB
          // returns `y(3)` at the query `2.5`, not `y(2)`.
          return q - x[lo] < x[hi] - q ? y[lo] : y[hi];
        }
        case 'previous':
          return y[lo];
        case 'next':
          return y[hi];
        case 'linear':
        case 'spline':
        case 'pchip':
        case 'cubic':
        case 'makima': {
          if (dx === 0) return y[lo];
          const t = (q - x[lo]) / dx;
          return y[lo] + t * (y[hi] - y[lo]);
        }
        default:
          throw new Error(`INTERP1: unknown method "${method}".`);
      }
    };

    if (xq.length === 1) return Matrix.scalar(at(xq[0]));
    const res = Matrix.zeros(1, xq.length);
    for (let i = 0; i < xq.length; i++) res.data[0][i] = at(xq[i]);
    return res;
  },

  /**
   * Cumulative trapezoidal integration.
   *
   * With one argument the sample spacing is 1. With two arguments the
   * second is the sample spacing. MATLAB returns a vector the same length
   * as the input, starting at 0.
   */
  cumtrapz: (args) => {
    const y = toMatrix(args[0]).toFlatArray();
    const x = args.length > 1 ? toMatrix(args[1]).toFlatArray() : null;
    const n = y.length;
    const res = Matrix.zeros(1, n);
    if (n === 0) return res;
    let acc = 0;
    res.data[0][0] = 0;
    for (let i = 1; i < n; i++) {
      const h = x ? x[i] - x[i - 1] : 1;
      acc += (h * (y[i] + y[i - 1])) / 2;
      res.data[0][i] = acc;
    }
    return res;
  },

  /**
   * Sample covariance.
   *
   * MATLAB normalises by `n-1` (the unbiased estimator). With two inputs
   * the result is the 2x2 matrix `[var(a) cov(a,b); cov(a,b) var(b)]`;
   * with one input it is the scalar variance.
   */
  cov: (args) => {
    const a = toMatrix(args[0]).toFlatArray();
    const b = args.length > 1 ? toMatrix(args[1]).toFlatArray() : a;
    const n = Math.min(a.length, b.length);
    if (n < 2) return Matrix.scalar(NaN);
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      sxy += da * db;
      sxx += da * da;
      syy += db * db;
    }
    const denom = n - 1;
    const varA = sxx / denom;
    const varB = syy / denom;
    const covAB = sxy / denom;
    if (args.length < 2) return Matrix.scalar(varA);
    const res = Matrix.zeros(2, 2);
    res.data[0][0] = varA;
    res.data[0][1] = covAB;
    res.data[1][0] = covAB;
    res.data[1][1] = varB;
    return res;
  },

  /**
   * Correlation coefficients.
   *
   * With two inputs the result is the 2x2 matrix `[1 r; r 1]`, where `r`
   * is the Pearson correlation. MATLAB leaves the diagonal at 1 even when
   * the correlation is undefined.
   */
  corrcoef: (args) => {
    const a = toMatrix(args[0]).toFlatArray();
    const b = args.length > 1 ? toMatrix(args[1]).toFlatArray() : a;
    const n = Math.min(a.length, b.length);
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      sxy += da * db;
      sxx += da * da;
      syy += db * db;
    }
    const r = sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
    const res = Matrix.zeros(2, 2);
    res.data[0][0] = 1;
    res.data[0][1] = r;
    res.data[1][0] = r;
    res.data[1][1] = 1;
    return res;
  },

  /**
   * `eps` is the double-precision machine epsilon.
   *
   * `Number.EPSILON` is bit-for-bit the value MATLAB reports: `num2hex(eps)`
   * is `3cb0000000000000` in both. Writing the literal as a decimal
   * approximation risks a 1-ULP drift, which shows up in a `num2hex`
   * comparison even though the decimal printout looks identical.
   */
  eps: () => Matrix.scalar(Number.EPSILON),

  /**
   * `nargin` reports how many arguments the enclosing function received;
   * at the top level MATLAB reports 0 for a script.
   */
  nargin: (args, ctx) => Matrix.scalar(Math.max(0, ctx.nargin)),

  /**
   * `nargout` reports how many outputs the enclosing function declares.
   * At the top level MATLAB reports 0.
   */
  nargout: (args, ctx) => Matrix.scalar(ctx.functionNargout),

  /**
   * `class` reports the type of a value.
   *
   * OpenMat's value model is narrower than MATLAB's: every number is a
   * double, every string is a char row vector, and a struct is a plain
   * object. The class names MATLAB uses for those are returned, so code
   * that branches on `class(x)` behaves the same way.
   */
  class: (args) => {
    const v = args[0];
    if (typeof v === 'string') return 'char';
    if (typeof v === 'boolean') return 'logical';
    if (v instanceof Matrix) return v.isLogical ? 'logical' : 'double';
    if (v && typeof v === 'object' && !Array.isArray(v)) return 'struct';
    if (Array.isArray(v)) return 'cell';
    return 'double';
  },

  /**
   * `isstruct` reports whether a value is a struct.
   */
  isstruct: (args) => {
    const v = args[0];
    const ok = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Matrix);
    return Matrix.scalar(ok ? 1 : 0);
  },

  /**
   * `struct` builds a struct from field names and values.
   *
   * `struct('x', 1, 'y', 'two')` makes a struct with the fields `x` and
   * `y`. A **cell** value argument becomes a struct *array* in MATLAB; the
   * engine keeps the cell contents in a single field instead, which is the
   * common single-element case.
   */
  struct: (args) => {
    if (args.length === 0) return {};
    if (args.length % 2 !== 0) {
      throw new Error('Not enough input arguments.');
    }
    const out: Record<string, any> = {};
    for (let i = 0; i < args.length; i += 2) {
      const name = String(args[i]);
      const value = args[i + 1];
      // A cell argument in MATLAB creates a struct array; the engine stores
      // the cell's contents in the field.
      out[name] = Array.isArray(value) ? value[0] : value;
    }
    return out;
  },

  /**
   * `fieldnames` lists a struct's field names as a **cell array** of
   * char row vectors.
   *
   * MATLAB returns the names in the order the fields were first assigned:
   * `s.b = 2; s.a = 1; s.c = 3;` yields `{'b'; 'a'; 'c'}`.
   */
  fieldnames: (args) => {
    const v = args[0];
    if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Matrix) {
      throw new Error('Reference to non-existent field.');
    }
    return Object.keys(v);
  },

  /**
   * `nan` with no argument is the scalar NaN; with two arguments it is a
   * matrix of NaNs.
   */
  nan: (args) => {
    if (args.length === 0) return Matrix.scalar(NaN);
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.zeros(r, c).map(() => NaN);
  },

  // Special functions and distributions
  erfc: (args) => toMatrix(args[0]).map(erfcValue),
  erf: (args) => toMatrix(args[0]).map(erfValue),
  gamma: (args) => toMatrix(args[0]).map(gammaFn),
  factorial: (args) => toMatrix(args[0]).map(factorialFn),
  nchoosek: (args) => {
    const n = toNum(args[0]);
    const k = toNum(args[1]);
    return Matrix.scalar(factorialFn(n) / (factorialFn(k) * factorialFn(n - k)));
  },

  /**
   * Standard normal cumulative distribution function.
   */
  normcdf: (args) => {
    const x = toMatrix(args[0]);
    const mu = args.length > 1 ? toNum(args[1]) : 0;
    const sigma = args.length > 2 ? toNum(args[2]) : 1;
    return x.map(v => 0.5 * erfcValue(-(v - mu) / (sigma * Math.SQRT2)));
  },

  /**
   * Standard normal probability density function.
   */
  normpdf: (args) => {
    const x = toMatrix(args[0]);
    const mu = args.length > 1 ? toNum(args[1]) : 0;
    const sigma = args.length > 2 ? toNum(args[2]) : 1;
    const k = 1 / (sigma * Math.sqrt(2 * Math.PI));
    return x.map(v => k * Math.exp(-0.5 * Math.pow((v - mu) / sigma, 2)));
  },

  /**
   * Inverse of the standard normal cumulative distribution function.
   *
   * Uses the rational approximation of Acklam plus one Halley refinement
   * step, which is accurate to about 1e-15 in the central range.
   */
  norminv: (args) => {
    const p = toMatrix(args[0]);
    const mu = args.length > 1 ? toNum(args[1]) : 0;
    const sigma = args.length > 2 ? toNum(args[2]) : 1;
    return p.map(v => mu + sigma * normInvScalar(v));
  },

  /**
   * Log-normal cumulative distribution function.
   */
  logncdf: (args) => {
    const x = toMatrix(args[0]);
    const mu = toNum(args[1]);
    const sigma = toNum(args[2]);
    return x.map(v => {
      if (v <= 0) return 0;
      // MATLAB evaluates `-(log(x) - mu) / (sigma * sqrt(2))`. The scale has
      // to be folded into the denominator *before* the division: dividing by
      // `sigma` first and then by `sqrt(2)` rounds differently and shifts
      // the last bit of the result.
      return 0.5 * erfcValue(-(Math.log(v) - mu) / (sigma * Math.SQRT2));
    });
  },

  /**
   * Inverse of the log-normal cumulative distribution function.
   */
  logninv: (args) => {
    const p = toMatrix(args[0]);
    const mu = toNum(args[1]);
    const sigma = toNum(args[2]);
    return p.map(v => Math.exp(mu + sigma * normInvScalar(v)));
  },

  /**
   * Log-normal probability density function.
   */
  lognpdf: (args) => {
    const x = toMatrix(args[0]);
    const mu = toNum(args[1]);
    const sigma = toNum(args[2]);
    return x.map(v => {
      if (v <= 0) return 0;
      return (
        Math.exp(-Math.pow(Math.log(v) - mu, 2) / (2 * sigma * sigma)) /
        (v * sigma * Math.sqrt(2 * Math.PI))
      );
    });
  },

  /**
   * `sprintf` formats and **returns** a char array.
   *
   * Unlike `fprintf`, `sprintf` does not print anything: `f =
   * sprintf('%d-%s', 5, 'x')` binds the string `5-x`, and `class(f)` is
   * `'char'`. Printing is `fprintf`'s job.
   */
  sprintf: (args) => {
    const fmt = String(args[0]);
    const rest = args.slice(1).map((a) => (a instanceof Matrix ? a.getScalar() : a));
    return formatPrintf(fmt, rest);
  },

  /**
   * `fprintf` formats and prints to the command window.
   *
   * MATLAB's `fprintf` does **not** bind `ans` -- a bare `fprintf('hi')`
   * leaves the workspace unchanged. The engine therefore returns `null`
   * rather than the character count.
   */
  fprintf: (args, ctx) => {
    const fmt = String(args[0]);
    const rest = args.slice(1).map((a) => (a instanceof Matrix ? a.getScalar() : a));
    ctx.output(formatPrintf(fmt, rest));
    return null;
  },

  error: (args, ctx) => {
    throw new Error(args.map((a) => String(a)).join(' '));
  },

  warning: (args, ctx) => {
    ctx.output(`Warning: ${args.map((a) => String(a)).join(' ')}`);
    return null;
  },

  assert: (args) => {
    const cond = args[0];
    const truthy = cond instanceof Matrix
      ? cond.toFlatArray().every((v) => v !== 0)
      : Number(cond) !== 0;
    if (!truthy) {
      const msg = args.length > 1 ? String(args[1]) : 'Assertion failed';
      throw new Error(msg);
    }
    return null;
  },

  /**
   * `min` - smallest element, or smallest along a dimension.
   *
   * MATLAB has three forms:
   * - `min(A)` reduces over the first non-singleton dimension,
   * - `min(A, B)` is element-wise,
   * - `min(A, [], dim)` reduces along `dim`, with `[]` as the placeholder
   *   for the missing second operand.
   *
   * Verified against MATLAB: `min([1 2 3; 4 5 6], [], 2)` is `[1; 4]`.
   */
  min: (args) => {
    const a = toMatrix(args[0]);
    // The three-argument form `min(A, [], dim)`.
    if (args.length >= 3) {
      return a.minDim(reduceDim(args[2]));
    }
    // The two-argument form `min(A, B)` is element-wise.
    if (args.length === 2) {
      const b = toMatrix(args[1]);
      if (b.rows !== 0 || b.cols !== 0) {
        return a.elementWise(b, (x, y) => (x < y ? x : y));
      }
    }
    // With a dimension the result reduces along that dimension.
    if (args.length > 1) return a.minDim(reduceDim(args[1]));
    // Without a dimension MATLAB reduces over the first non-singleton
    // dimension, so a 2x3 matrix yields a 1x3 row.
    if (a.rows === 1) return a.minDim(2);
    return a.minDim(1);
  },

  /**
   * `max` - largest element, or largest along a dimension.
   *
   * The same three forms as `min`.
   */
  max: (args) => {
    const a = toMatrix(args[0]);
    if (args.length >= 3) {
      return a.maxDim(reduceDim(args[2]));
    }
    if (args.length === 2) {
      const b = toMatrix(args[1]);
      if (b.rows !== 0 || b.cols !== 0) {
        return a.elementWise(b, (x, y) => (x > y ? x : y));
      }
    }
    if (args.length > 1) return a.maxDim(reduceDim(args[1]));
    if (a.rows === 1) return a.maxDim(2);
    return a.maxDim(1);
  },

  // System & I/O
  disp: (args, ctx) => {
    const val = args[0];
    if (val instanceof Matrix) {
      ctx.output(val.format());
    } else if (typeof val === 'string') {
      // MATLAB prints character arrays without quotes.
      ctx.output(val);
    } else if (typeof val === 'boolean') {
      // A logical scalar prints as 1 or 0, not as `true`/`false`.
      ctx.output(Matrix.scalar(val ? 1 : 0).format());
    } else {
      ctx.output(String(val));
    }
    return null;
  },

  tic: (_args, ctx) => {
    ctx.setTimerStart(performance.now());
    return null;
  },

  toc: (_args, ctx) => {
    if (ctx.timerStart === undefined) {
      ctx.output('Elapsed time is 0.000000 seconds.');
    } else {
      const elapsed = (performance.now() - ctx.timerStart) / 1000;
      ctx.output(`Elapsed time is ${elapsed.toFixed(6)} seconds.`);
    }
    return null;
  },

  help: (args, ctx) => {
    const topic = args[0] ? String(args[0]) : '';
    if (!topic) {
      ctx.output('OpenMat - Open-Source Scientific Computing Environment & Matrix IDE\nAvailable functions: zeros, ones, eye, rand, linspace, sin, cos, exp, log, inv, det, plot, scatter, etc.');
    } else {
      ctx.output(`HELP: Information about ${topic}\nIn OpenMat, '${topic}' conforms to the standard matrix calling specification.`);
    }
    return null;
  },

  who: (_args, ctx) => {
    const keys = Object.keys(ctx.workspace);
    ctx.output('Your variables are:\n' + keys.join('   '));
    return null;
  },

  whos: (_args, ctx) => {
    const keys = Object.keys(ctx.workspace);
    const header = '  Name      Size            Bytes  Class';
    const lines = [header];
    for (const k of keys) {
      const val = ctx.workspace[k];
      if (val instanceof Matrix) {
        lines.push(`  ${k.padEnd(8)}  ${`${val.rows}x${val.cols}`.padEnd(14)}  ${(val.rows * val.cols * 8).toString().padEnd(6)} double`);
      } else if (typeof val === 'string') {
        lines.push(`  ${k.padEnd(8)}  ${`1x${val.length}`.padEnd(14)}  ${(val.length * 2).toString().padEnd(6)} char`);
      }
    }
    ctx.output(lines.join('\n'));
    return null;
  },

  clear: (args, ctx) => {
    if (args.length === 0 || args[0] === 'all') {
      for (const k of Object.keys(ctx.workspace)) {
        delete ctx.workspace[k];
      }
    } else {
      for (const a of args) {
        delete ctx.workspace[String(a)];
      }
    }
    return null;
  },

  clc: (_args, ctx) => {
    ctx.output('\x1Bc'); // Clear screen signal
    return null;
  },

  // Plotting Commands
  plot: (args, ctx) => {
    return handlePlot(args, ctx, 'line');
  },

  scatter: (args, ctx) => {
    return handlePlot(args, ctx, 'scatter');
  },

  bar: (args, ctx) => {
    return handlePlot(args, ctx, 'bar');
  },

  histogram: (args, ctx) => {
    // MATLAB's histogram bins the data and plots the bin counts.
    const m = toMatrix(args[0]);
    const data = m.toFlatArray();
    if (data.length === 0) {
      throw new Error('Histogram requires at least one data point');
    }
    const nbins = args.length > 1 ? Math.max(1, Math.round(toNum(args[1], 10))) : 10;
    // Reduce with an explicit loop: spreading a large array into Math.min
    // overflows the JavaScript call stack.
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const width = max === min ? 1 : (max - min) / nbins;

    const counts = new Array(nbins).fill(0);
    for (const v of data) {
      let bin = Math.floor((v - min) / width);
      if (bin >= nbins) bin = nbins - 1;
      if (bin < 0) bin = 0;
      counts[bin] += 1;
    }

    const edges: number[] = [];
    for (let i = 0; i < nbins; i++) edges.push(min + i * width);

    const plot: PlotData = {
      id: 'plot_' + Date.now(),
      type: 'bar',
      grid: true,
      series: [{
        label: 'Histogram',
        x: edges,
        y: counts,
        color: '#0072BD'
      }],
      title: 'Histogram'
    };
    ctx.setCurrentPlot(plot);
    ctx.addPlot(plot);
    return null;
  },

  title: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.title = String(args[0]);
    }
    return null;
  },

  xlabel: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.xlabel = String(args[0]);
    }
    return null;
  },

  ylabel: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.ylabel = String(args[0]);
    }
    return null;
  },

  grid: (args, ctx) => {
    if (ctx.currentPlot) {
      const state = args[0] ? String(args[0]).toLowerCase() : 'on';
      ctx.currentPlot.grid = state !== 'off';
    }
    return null;
  },

  hold: (args, ctx) => {
    const state = args[0] ? String(args[0]).toLowerCase() : 'on';
    ctx.setHoldOn(state === 'on');
    return null;
  },

  figure: (_args, ctx) => {
    ctx.setCurrentPlot(undefined);
    return null;
  }
};

/**
 * The infinity norm of a matrix: the maximum absolute row sum.
 */
function matrixInfNorm(m: Matrix): number {
  let best = 0;
  for (let r = 0; r < m.rows; r++) {
    let s = 0;
    for (let c = 0; c < m.cols; c++) s += Math.abs(m.data[r][c]);
    best = Math.max(best, s);
  }
  return best;
}

/**
 * Singular values of a matrix, computed with the one-sided Jacobi
 * eigen-decomposition of `A' * A`.
 *
 * The singular values come back in descending order, matching MATLAB's
 * `svd` output.
 */
function singularValues(m: Matrix): number[] {
  if (m.rows === 0 || m.cols === 0) return [];

  // Work with the smaller orientation: singular values of A equal those of
  // A' or A, so transpose when that keeps the iteration cheap.
  const a = m.rows <= m.cols ? m : m.transpose();

  // Jacobi eigen-decomposition of the symmetric matrix A' * A.
  const n = a.cols;
  const ata = Matrix.zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let r = 0; r < a.rows; r++) s += a.data[r][i] * a.data[r][j];
      ata.data[i][j] = s;
    }
  }

  const { values } = jacobiEigen(ata);
  return values
    .map(v => Math.sqrt(Math.max(0, v)))
    .sort((x, y) => y - x);
}

/**
 * Eigenvalues (and eigenvectors) of a square matrix.
 *
 * Uses the unshifted QR algorithm with Hessenberg reduction, which is
 * accurate enough for the small systems that appear in replication code.
 */
function eigenDecomposition(m: Matrix): { values: number[]; vectors: Matrix } {
  if (m.rows !== m.cols) {
    throw new Error('Eigenvalues can only be computed for square matrices.');
  }
  if (m.rows === 1) {
    return { values: [m.data[0][0]], vectors: Matrix.ones(1, 1) };
  }

  // Symmetric matrices use the (more accurate) Jacobi iteration.
  if (isSymmetric(m)) {
    const { values, vectors } = jacobiEigen(m);
    return { values, vectors };
  }

  return hessenbergQr(m);
}

/** True when the matrix is square and equals its transpose. */
function isSymmetric(m: Matrix): boolean {
  if (m.rows !== m.cols) return false;
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) {
      if (Math.abs(m.data[i][j] - m.data[j][i]) > 1e-12) return false;
    }
  }
  return true;
}

/**
 * Eigen-decomposition of a symmetric matrix using the cyclic Jacobi method.
 *
 * Returns the eigenvalues in descending order together with the matrix of
 * eigenvectors (columns).
 */
function jacobiEigen(input: Matrix): { values: number[]; vectors: Matrix } {
  const n = input.rows;
  const a = input.clone();
  const v = Matrix.eye(n, n);

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += a.data[i][j] * a.data[i][j];
    }
    if (off < 1e-24) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a.data[p][q]) < 1e-18) continue;
        const theta = (a.data[q][q] - a.data[p][p]) / (2 * a.data[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = a.data[k][p];
          const akq = a.data[k][q];
          a.data[k][p] = c * akp - s * akq;
          a.data[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a.data[p][k];
          const aqk = a.data[q][k];
          a.data[p][k] = c * apk - s * aqk;
          a.data[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v.data[k][p];
          const vkq = v.data[k][q];
          v.data[k][p] = c * vkp - s * vkq;
          v.data[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const values = a.data.map((row, i) => row[i]).sort((x, y) => y - x);
  return { values, vectors: v };
}

/**
 * Eigen-decomposition of a general square matrix via Hessenberg reduction
 * followed by the shifted QR algorithm.
 */
function hessenbergQr(input: Matrix): { values: number[]; vectors: Matrix } {
  const n = input.rows;
  const h = input.clone();
  const total = 100 * n + 100;
  let iter = 0;

  while (iter++ < total) {
    // Deflate: find an off-diagonal element that is negligible.
    let l = n - 1;
    while (l > 0) {
      let s = 0;
      for (let i = 0; i < l; i++) s += Math.abs(h.data[i][l]);
      if (s === 0 || Math.abs(h.data[l - 1][l]) <= 1e-14 * s) break;
      l--;
    }
    if (l === 0) break;

    // One QR step with a Wilkinson shift.
    const m = l + 1;
    let norm = 0;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) norm += h.data[i][j] * h.data[i][j];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) break;

    const x = h.data[m - 1][m - 1];
    const y = h.data[m - 1][m - 2];
    let shift = x;
    if (Math.abs(y) > 1e-300) {
      const w = (h.data[m - 2][m - 2] - x) / (2 * y);
      const t = Math.sign(w || 1) / (Math.abs(w) + Math.sqrt(w * w + 1));
      shift = x + t * y;
    }

    for (let i = 0; i < m; i++) h.data[i][i] -= shift;

    // QR decomposition via Gram-Schmidt on the shifted matrix.
    const q = Matrix.eye(m, m);
    const r = Matrix.zeros(m, m);
    for (let j = 0; j < m; j++) {
      const v = new Array(m).fill(0);
      for (let i = 0; i < m; i++) v[i] = h.data[i][j];
      for (let k = 0; k < j; k++) {
        let dot = 0;
        for (let i = 0; i < m; i++) dot += q.data[i][k] * v[i];
        r.data[k][j] = dot;
        for (let i = 0; i < m; i++) v[i] -= dot * q.data[i][k];
      }
      let nrm = 0;
      for (let i = 0; i < m; i++) nrm += v[i] * v[i];
      nrm = Math.sqrt(nrm);
      r.data[j][j] = nrm;
      if (nrm > 1e-300) {
        for (let i = 0; i < m; i++) {
          q.data[i][j] = v[i] / nrm;
          h.data[i][j] = v[i];
        }
      }
    }
    // h = r * q + shift * I
    const hn = Matrix.zeros(m, m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let k = 0; k < m; k++) s += r.data[i][k] * q.data[k][j];
        hn.data[i][j] = s;
      }
    }
    for (let i = 0; i < m; i++) hn.data[i][i] += shift;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) h.data[i][j] = hn.data[i][j];
    }
  }

  const values: number[] = [];
  for (let i = 0; i < n; i++) values.push(h.data[i][i]);
  return { values, vectors: Matrix.eye(n, n) };
}

function handlePlot(args: any[], ctx: BuiltinContext, type: 'line' | 'scatter' | 'bar' | 'histogram'): null {
  let x: number[] = [];
  let y: number[] = [];
  let label = `data_${(ctx.currentPlot?.series.length || 0) + 1}`;

  if (args.length === 1) {
    const m = toMatrix(args[0]);
    y = m.toFlatArray();
    x = Array.from({ length: y.length }, (_, i) => i + 1);
  } else if (args.length >= 2) {
    const mx = toMatrix(args[0]);
    const my = toMatrix(args[1]);
    x = mx.toFlatArray();
    y = my.toFlatArray();
    if (args.length >= 3 && typeof args[2] === 'string') {
      label = args[2];
    }
  }

  const colors = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];
  const color = colors[(ctx.currentPlot?.series.length || 0) % colors.length];

  if (ctx.holdOn && ctx.currentPlot) {
    ctx.currentPlot.series.push({ label, x, y, color });
    ctx.addPlot(ctx.currentPlot);
  } else {
    const newPlot: PlotData = {
      id: 'plot_' + Date.now(),
      type,
      grid: true,
      series: [{ label, x, y, color }]
    };
    ctx.setCurrentPlot(newPlot);
    ctx.addPlot(newPlot);
  }

  return null;
}

/**
 * Minimal `sprintf`/`fprintf` formatter supporting the conversion specifiers
 * that appear in replication code: %d, %i, %f, %e, %g, %s, %%, and the
 * width/precision flags.
 */
function formatPrintf(fmt: string, values: any[]): string {
  let out = '';
  let vi = 0;
  let i = 0;

  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch !== '%') {
      out += ch;
      i += 1;
      continue;
    }

    // Collect the conversion specifier.
    const m = /^%([-+ 0#]*)(\d*)(?:\.(\d+))?([diufFeEgGsxXc%])/.exec(fmt.slice(i));
    if (!m) {
      out += ch;
      i += 1;
      continue;
    }
    const [, flags, widthStr, precStr, conv] = m;
    i += m[0].length;

    if (conv === '%') {
      out += '%';
      continue;
    }

    const raw = values[vi++];
    const num = raw instanceof Matrix ? raw.getScalar() : Number(raw);
    const width = widthStr ? parseInt(widthStr, 10) : 0;
    const prec = precStr !== undefined ? parseInt(precStr, 10) : undefined;

    let text: string;
    switch (conv) {
      case 'd':
      case 'i':
        text = String(Math.round(num));
        break;
      case 'f':
        text = num.toFixed(prec !== undefined ? prec : 6);
        break;
      case 'e':
      case 'E':
        text = num.toExponential(prec !== undefined ? prec : 6);
        if (conv === 'E') text = text.toUpperCase();
        break;
      case 'g':
      case 'G':
        text = String(Number(num.toPrecision(prec !== undefined ? prec : 6)));
        if (conv === 'G') text = text.toUpperCase();
        break;
      case 'x':
        text = Math.round(num).toString(16);
        break;
      case 'X':
        text = Math.round(num).toString(16).toUpperCase();
        break;
      case 'c':
        text = String.fromCharCode(Math.round(num));
        break;
      case 's':
      default:
        text = raw instanceof Matrix ? raw.format() : String(raw);
        break;
    }

    if (width > text.length) {
      const pad = ' '.repeat(width - text.length);
      if (flags.includes('-')) text = text + pad;
      else if (flags.includes('0') && !['s', 'e', 'E', 'f', 'g', 'G'].includes(conv)) {
        text = (num < 0 ? '-' : '') + pad + text.replace('-', '');
      } else text = pad + text;
    }

    out += text;
  }

  return out;
}

/**
 * Complementary error function `erfc(x)`.
 *
 * This is a port of the FDLIBM `s_erf.c` rational approximation, the same
 * family of rational approximations MATLAB's own `erfc` is built on. The
 * earlier Numerical Recipes approximation was only good to about 1e-7,
 * which visibly shifted the tails of the log-normal and normal distribution
 * functions and therefore the results of the replication packages.
 */
function erfcValue(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 0;
  if (x === -Infinity) return 2;

  const ax = Math.abs(x);

  // |x| < 0.84375: erf is approximated and erfc is derived from it.
  if (ax < 0.84375) {
    if (ax < 1.3877787807814457e-17) {
      // |x| < 2^-56: erfc(x) = 1 - x to machine precision.
      return 1 - x;
    }
    const z = x * x;
    const r = ERF_PP0 + z * (ERF_PP1 + z * (ERF_PP2 + z * (ERF_PP3 + z * ERF_PP4)));
    const s = 1 + z * (ERF_QQ1 + z * (ERF_QQ2 + z * (ERF_QQ3 + z * (ERF_QQ4 + z * ERF_QQ5))));
    const y = r / s;
    if (x < 0.25) {
      return 1 - (x + x * y);
    }
    return 0.5 - (x * y + (x - 0.5));
  }

  // 0.84375 <= |x| < 1.25: Taylor expansion about x = 1.
  if (ax < 1.25) {
    const s = ax - 1;
    const P =
      ERF_PA0 + s * (ERF_PA1 + s * (ERF_PA2 + s * (ERF_PA3 + s * (ERF_PA4 + s * (ERF_PA5 + s * ERF_PA6)))));
    const Q = 1 + s * (ERF_QA1 + s * (ERF_QA2 + s * (ERF_QA3 + s * (ERF_QA4 + s * (ERF_QA5 + s * ERF_QA6)))));
    if (x >= 0) {
      return 1 - ERFC_ERX - P / Q;
    }
    return 1 + (ERFC_ERX + P / Q);
  }

  // |x| < 28: the asymptotic expansion, in rational form.
  if (ax < 28) {
    const s = 1 / (ax * ax);
    let R: number;
    let S: number;
    if (ax < 1 / 0.35) {
      R =
        ERFC_RA0 + s * (ERFC_RA1 + s * (ERFC_RA2 + s * (ERFC_RA3 + s * (ERFC_RA4 + s * (ERFC_RA5 + s * (ERFC_RA6 + s * ERFC_RA7))))));
      S =
        1 + s * (ERFC_SA1 + s * (ERFC_SA2 + s * (ERFC_SA3 + s * (ERFC_SA4 + s * (ERFC_SA5 + s * (ERFC_SA6 + s * (ERFC_SA7 + s * ERFC_SA8)))))));
    } else {
      R =
        ERFC_RB0 + s * (ERFC_RB1 + s * (ERFC_RB2 + s * (ERFC_RB3 + s * (ERFC_RB4 + s * (ERFC_RB5 + s * ERFC_RB6)))));
      S =
        1 + s * (ERFC_SB1 + s * (ERFC_SB2 + s * (ERFC_SB3 + s * (ERFC_SB4 + s * (ERFC_SB5 + s * (ERFC_SB6 + s * ERFC_SB7))))));
    }
    // The exponent is split so that the rounding error of the product is
    // recovered: `z` is `x` truncated to single precision, and the
    // difference `(z - x) * (z + x)` restores the lost bits.
    const z = truncateToSinglePrecision(ax);
    const r = Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S);
    return x > 0 ? r / ax : 2 - r / ax;
  }

  // |x| >= 28: the result underflows to zero.
  return x > 0 ? 0 : 2 - 1e-300;
}

/**
 * Truncate a double to the precision of a single-precision float.
 *
 * The FDLIBM `erfc` splits the exponent as `-x*x` into `-z*z` plus the
 * correction `(z - x) * (z + x)`, where `z` is `x` with its **low** 32 mantissa
 * bits cleared (`SET_LOW_WORD(z, 0)` in `s_erf.c`). The correction term then
 * recovers the bits that the truncation removed, which is what makes the
 * result accurate to the last few bits.
 *
 * The cleared bits are the *low* ones: in a little-endian 64-bit pattern they
 * live in bytes 0-3, not 4-7. Clearing bytes 4-7 instead zeroes the exponent
 * and the high mantissa bits, which turns `z` into a denormal and makes the
 * whole asymptotic branch of `erf`/`erfc` wrong by tens of ULP.
 */
const singleScratch = new Float64Array(1);
const singleBytes = new Uint8Array(singleScratch.buffer);

function truncateToSinglePrecision(x: number): number {
  singleScratch[0] = x;
  // Clear the low 32 bits of the 64-bit little-endian pattern.
  singleBytes[0] = 0;
  singleBytes[1] = 0;
  singleBytes[2] = 0;
  singleBytes[3] = 0;
  return singleScratch[0];
}

/**
 * The error function `erf(x)`.
 *
 * Evaluated directly rather than as `1 - erfc(x)`, because the subtraction
 * cancels catastrophically for small `x`: `erfc(x)` is close to 1 there, so
 * the difference loses most of the significant digits.
 */
function erfValue(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return 1;
  if (x === -Infinity) return -1;

  const ax = Math.abs(x);

  // |x| < 0.84375
  if (ax < 0.84375) {
    if (ax < 3.725290298461914e-9) {
      // |x| < 2^-28: erf(x) = (2/sqrt(pi))*x, to machine precision.
      //
      // FDLIBM returns `x + efx*x` here, where `efx` is the *correction* term
      // `2/sqrt(pi) - 1`, so `x + efx*x` is `(1 + efx) * x`. Returning plain
      // `x` is wrong by a factor of 1.128 and shows up wherever a small
      // argument is squared and differentiated.
      return x + ERF_EFX * x;
    }
    const z = x * x;
    const r = ERF_PP0 + z * (ERF_PP1 + z * (ERF_PP2 + z * (ERF_PP3 + z * ERF_PP4)));
    const s = 1 + z * (ERF_QQ1 + z * (ERF_QQ2 + z * (ERF_QQ3 + z * (ERF_QQ4 + z * ERF_QQ5))));
    return x + x * (r / s);
  }

  // 0.84375 <= |x| < 1.25
  if (ax < 1.25) {
    const s = ax - 1;
    const P =
      ERF_PA0 + s * (ERF_PA1 + s * (ERF_PA2 + s * (ERF_PA3 + s * (ERF_PA4 + s * (ERF_PA5 + s * ERF_PA6)))));
    const Q = 1 + s * (ERF_QA1 + s * (ERF_QA2 + s * (ERF_QA3 + s * (ERF_QA4 + s * (ERF_QA5 + s * ERF_QA6)))));
    return x >= 0 ? ERFC_ERX + P / Q : -(ERFC_ERX + P / Q);
  }

  // |x| >= 6: erf is 1 (to machine precision) in magnitude.
  if (ax >= 6) {
    return x > 0 ? 1 - 1e-300 : -1 + 1e-300;
  }

  // 1.25 <= |x| < 6: derived from the asymptotic erfc expansion.
  const s = 1 / (ax * ax);
  let R: number;
  let S: number;
  if (ax < 1 / 0.35) {
    R =
      ERFC_RA0 + s * (ERFC_RA1 + s * (ERFC_RA2 + s * (ERFC_RA3 + s * (ERFC_RA4 + s * (ERFC_RA5 + s * (ERFC_RA6 + s * ERFC_RA7))))));
    S =
      1 + s * (ERFC_SA1 + s * (ERFC_SA2 + s * (ERFC_SA3 + s * (ERFC_SA4 + s * (ERFC_SA5 + s * (ERFC_SA6 + s * (ERFC_SA7 + s * ERFC_SA8)))))));
  } else {
    R =
      ERFC_RB0 + s * (ERFC_RB1 + s * (ERFC_RB2 + s * (ERFC_RB3 + s * (ERFC_RB4 + s * (ERFC_RB5 + s * ERFC_RB6)))));
    S =
      1 + s * (ERFC_SB1 + s * (ERFC_SB2 + s * (ERFC_SB3 + s * (ERFC_SB4 + s * (ERFC_SB5 + s * (ERFC_SB6 + s * ERFC_SB7))))));
  }
  const z = truncateToSinglePrecision(ax);
  const r = Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S);
  const erfcAx = r / ax;
  return x >= 0 ? 1 - erfcAx : erfcAx - 1;
}

/** `c = (float)0.84506291151`, the constant the middle branch expands about. */
const ERFC_ERX = 8.45062911510467529297e-01;

/**
 * The correction term for the tiny-argument branch of `erf`.
 *
 * FDLIBM's `efx` is `2/sqrt(pi) - 1`, and the branch returns `x + efx*x`, which
 * is `(1 + efx) * x` — exactly `2/sqrt(pi) * x` to double precision.
 */
const ERF_EFX = 1.28379167095512586316e-01;

/** Numerator coefficients for `erf` on [0, 0.84375]. */
const ERF_PP0 = 1.28379167095512558561e-01;
const ERF_PP1 = -3.25042107247001499370e-01;
const ERF_PP2 = -2.84817495755985104766e-02;
const ERF_PP3 = -5.77027029648944159157e-03;
const ERF_PP4 = -2.37630166566501626084e-05;

/** Denominator coefficients for `erf` on [0, 0.84375]. */
const ERF_QQ1 = 3.97917223959155352819e-01;
const ERF_QQ2 = 6.50222499887672944485e-02;
const ERF_QQ3 = 5.08130628187576562776e-03;
const ERF_QQ4 = 1.32494738004321644526e-04;
const ERF_QQ5 = -3.96022827877536812320e-06;

/** Numerator coefficients for `erf` on [0.84375, 1.25]. */
const ERF_PA0 = -2.36211856075265944077e-03;
const ERF_PA1 = 4.14856118683748331666e-01;
const ERF_PA2 = -3.72207876035701323847e-01;
const ERF_PA3 = 3.18346619901161753674e-01;
const ERF_PA4 = -1.10894694282396677476e-01;
const ERF_PA5 = 3.54783043256182359371e-02;
const ERF_PA6 = -2.16637559486879084300e-03;

/** Denominator coefficients for `erf` on [0.84375, 1.25]. */
const ERF_QA1 = 1.06420880400844228286e-01;
const ERF_QA2 = 5.40397917702171048937e-01;
const ERF_QA3 = 7.18286544141962662868e-02;
const ERF_QA4 = 1.26171219808761642112e-01;
const ERF_QA5 = 1.36370839120290507362e-02;
const ERF_QA6 = 1.19844998467991074170e-02;

/** Numerator coefficients for `erfc` on [1.25, 1/0.35]. */
const ERFC_RA0 = -9.86494403484714822705e-03;
const ERFC_RA1 = -6.93858572707181764372e-01;
const ERFC_RA2 = -1.05586262253232909814e+01;
const ERFC_RA3 = -6.23753324503260060396e+01;
const ERFC_RA4 = -1.62396669462573470355e+02;
const ERFC_RA5 = -1.84605092906711035994e+02;
const ERFC_RA6 = -8.12874355063065934246e+01;
const ERFC_RA7 = -9.81432934416914548592e+00;

/** Denominator coefficients for `erfc` on [1.25, 1/0.35]. */
const ERFC_SA1 = 1.96512716674392571292e+01;
const ERFC_SA2 = 1.37657754143519042600e+02;
const ERFC_SA3 = 4.34565877475229228821e+02;
const ERFC_SA4 = 6.45387271733267880336e+02;
const ERFC_SA5 = 4.29008140027567833386e+02;
const ERFC_SA6 = 1.08635005541779435134e+02;
const ERFC_SA7 = 6.57024977031928170135e+00;
const ERFC_SA8 = -6.04244152148580987438e-02;

/** Numerator coefficients for `erfc` on [1/0.35, 28]. */
const ERFC_RB0 = -9.86494292470009928597e-03;
const ERFC_RB1 = -7.99283237680523006574e-01;
const ERFC_RB2 = -1.77579549177547519889e+01;
const ERFC_RB3 = -1.60636384855821916062e+02;
const ERFC_RB4 = -6.37566443368389627722e+02;
const ERFC_RB5 = -1.02509513161107724954e+03;
const ERFC_RB6 = -4.83519191608651397019e+02;

/** Denominator coefficients for `erfc` on [1/0.35, 28]. */
const ERFC_SB1 = 3.03380607434824582924e+01;
const ERFC_SB2 = 3.25792512996573918826e+02;
const ERFC_SB3 = 1.53672958608443695994e+03;
const ERFC_SB4 = 3.19985821950859553908e+03;
const ERFC_SB5 = 2.55305040643316442583e+03;
const ERFC_SB6 = 4.74528541206955367215e+02;
const ERFC_SB7 = -2.24409524465858183362e+01;

/**
 * Gamma function, computed with the Lanczos approximation.
 */
function gammaFn(x: number): number {
  if (Number.isInteger(x) && x > 0) {
    let r = 1;
    for (let i = 2; i < x; i++) r *= i;
    return r;
  }
  if (x < 0.5) {
    // Reflection formula: Gamma(x) = pi / (sin(pi x) Gamma(1-x))
    return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  const z = x - 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
}

/**
 * Factorial for non-negative integers, using the gamma function otherwise.
 *
 * `factorial(0)` is 1 (the empty product), not NaN. MATLAB's rule:
 * `factorial(0) = 1`, `factorial(1) = 1`, and a negative or non-integer
 * argument below 1 gives NaN.
 */
function factorialFn(x: number): number {
  if (x < 0 || !Number.isFinite(x)) return NaN;
  if (x === 0) return 1;
  if (x < 0.5) return NaN;
  if (x === Math.floor(x)) {
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return r;
  }
  return gammaFn(x + 1);
}

/**
 * Inverse of the standard normal cumulative distribution function.
 *
 * Peter Acklam's rational approximation, refined with one Halley step
 * against the exact CDF.
 */
function normInvScalar(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398,
    2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // One Halley step for full double precision.
  const e = 0.5 * erfcValue(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

/**
 * Two values are "the same element" for `unique` purposes when they are
 * equal as numbers. NaN is never equal to itself, but MATLAB's `unique`
 * collapses repeated NaNs into one element, so NaN is treated as equal to
 * NaN here.
 */
function sameValue(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

/**
 * The dimension argument of a reduction.
 *
 * MATLAB writes the three-argument form as `f(A, [], dim)`, so the
 * dimension can arrive as the second *or* third argument, and the `[]`
 * placeholder must be recognised and skipped.
 */
function reduceDim(v: any): number {
  if (v instanceof Matrix) {
    if (v.rows === 0 || v.cols === 0) {
      throw new Error('Dimension argument must be a positive integer scalar.');
    }
    return v.getScalar();
  }
  return toNum(v);
}

/**
 * Greatest common divisor of two numbers, always non-negative.
 *
 * MATLAB's `gcd` works on non-negative integers; a non-integer or negative
 * input follows the same rule applied to the magnitudes, and a zero
 * argument makes the gcd zero.
 */function gcdValue(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Human-readable byte size for the virtual file system.
 */
function toNum(val: any, fallback: number = 0): number {  if (val instanceof Matrix) return val.getScalar();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function toMatrix(val: any): Matrix {
  if (val instanceof Matrix) return val;
  if (typeof val === 'number') return Matrix.scalar(val);
  if (Array.isArray(val)) return Matrix.fromArray(val);
  return Matrix.scalar(0);
}

/**
 * The first dimension whose size is not 1.
 *
 * MATLAB's `flip` uses this dimension when none is given, so `flip([1 2 3])`
 * reverses the row instead of doing nothing.
 */
function firstNonSingletonDim(m: Matrix): number {
  if (m.rows !== 1) return 1;
  if (m.cols !== 1) return 2;
  return 1;
}

/** Reverse the elements of `m` along `dim` (1 = rows, 2 = columns). */
function flipDim(m: Matrix, dim: number): Matrix {
  const out = new Matrix(m.rows, m.cols);
  if (dim === 2) {
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        out.set(r + 1, c + 1, m.get(r + 1, m.cols - c));
      }
    }
    return out;
  }
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      out.set(r + 1, c + 1, m.get(m.rows - r, c + 1));
    }
  }
  return out;
}

/**
 * Rotate a matrix 90 degrees counter-clockwise.
 *
 * MATLAB's `rot90(A)` is `flipud(A')`, so `out[r][c] = A[c][cols - 1 - r]`.
 */
function rotate90Once(m: Matrix): Matrix {
  const out = new Matrix(m.cols, m.rows);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      out.set(c + 1, r + 1, m.get(r + 1, m.cols - c));
    }
  }
  return out;
}
