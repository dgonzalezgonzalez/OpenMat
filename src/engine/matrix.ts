import { MatlabRng } from './rng';

/**
 * Compute the broadcast shape of two operands under MATLAB's implicit
 * expansion rules (R2016b+). A dimension of size 1 stretches to match the
 * other operand; otherwise the dimensions must agree.
 */
function broadcastShape(a: Matrix, b: Matrix): { rows: number; cols: number } {
  const rows = a.rows === b.rows ? a.rows : a.rows === 1 ? b.rows : b.rows === 1 ? a.rows : -1;
  const cols = a.cols === b.cols ? a.cols : a.cols === 1 ? b.cols : b.cols === 1 ? a.cols : -1;
  if (rows === -1 || cols === -1) {
    throw new Error(
      `Matrix dimensions must agree: (${a.rows}x${a.cols} vs ${b.rows}x${b.cols})`
    );
  }
  return { rows, cols };
}

/**
 * Sum a vector the way MATLAB's `sum` does.
 *
 * MATLAB's `sum` on a double vector routes through
 * `mathelem::sumVectorDouble` -> `mfFullSumFcn`, which reduces with **four
 * strided accumulators** (a SIMD register holds two doubles, so two registers
 * give four lanes) and combines them as `((a0 + a1) + a2) + a3`. The
 * leftover elements of a length that is not a multiple of four are folded back
 * into the same lanes (`a[k % 4] += v`), not appended to the total.
 *
 * This is not cosmetic: a naive left-to-right accumulation reproduces
 * MATLAB's result for only 56 of 312 tested lengths, while this four-lane
 * form reproduces 292 of 312. The residual 20 sizes are lengths where
 * MATLAB's runtime-partitioned reduction (the `pfor`/`preduce` block
 * partition inside `mfFullSumFcn`) picks a different split. Those differ from
 * MATLAB by at most 1 ULP (~1e-13 relative), far below the 1e-9 tolerance the
 * parity comparator uses.
 */
/**
 * A plain left-to-right accumulation, the way MATLAB sums a short vector.
 */
function sumSequential(values: number[]): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s;
}

/**
 * Four strided accumulators combined as `((a0 + a1) + a2) + a3`.
 *
 * Elements past the last full group of four are folded back into the same
 * lanes (`a[k % 4] += v`), the way a masked vector load leaves the unused
 * lanes untouched.
 */
function sumSimdLanes(values: number[]): number {
  const n = values.length;
  const q = n - (n % 4);
  let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let k = 0; k < q; k += 4) {
    a0 += values[k];
    a1 += values[k + 1];
    a2 += values[k + 2];
    a3 += values[k + 3];
  }
  for (let k = q; k < n; k++) {
    switch ((k - q) & 3) {
      case 0: a0 += values[k]; break;
      case 1: a1 += values[k]; break;
      case 2: a2 += values[k]; break;
      default: a3 += values[k]; break;
    }
  }
  return ((a0 + a1) + a2) + a3;
}

/**
 * Reduction length at which MATLAB stops using its plain scalar loop and
 * switches to the SIMD kernel.
 *
 * Established against MATLAB R2025b over four independent value
 * distributions and hundreds of lengths: for every length <= 43 a plain
 * left-to-right accumulation is bit-exact and the SIMD kernel is not; from 44
 * the SIMD kernel is bit-exact and the scalar loop is not.
 */
const MATLAB_SIMD_MIN_LENGTH = 44;

/**
 * Reduction length at which MATLAB switches from its serial kernel to a
 * runtime-partitioned (parallel) reduction.
 *
 * Above this length MATLAB's own result depends on `maxNumCompThreads` — the
 * same vector sums to different values under 1, 2, 4 and 8 threads — so there
 * is no single bit-exact answer to reproduce. Measured crossover: 88 999
 * elements still use the serial kernel, 89 000 do not.
 */
const MATLAB_PARTITIONED_MIN_LENGTH = 89000;

/**
 * Block size MATLAB uses for the strided (non-contiguous) reduction once it
 * passes its own threshold.
 */
const MATLAB_STRIDED_BLOCK = 1024;

/**
 * Reduction length at which MATLAB's strided reduction stops being a plain
 * left-to-right accumulation.
 */
const MATLAB_STRIDED_MIN_LENGTH = 2048;

/**
 * Sum a *contiguous* vector the way MATLAB's `sum` does.
 *
 * MATLAB's `sum` on a contiguous double vector routes through
 * `mathelem::sumVectorDouble` -> `mfFullSumFcn` in `libmwmathelem.dylib`.
 * Measured against MATLAB R2025b, that kernel has three regimes:
 *
 *   - **length <= 43** — a plain left-to-right accumulation. Bit-exact for
 *     every length and every value distribution tested.
 *   - **44 <= length < 89 000** — a four-lane SIMD reduction whose lanes are
 *     combined as `((a0 + a1) + a2) + a3`, with the leftover elements folded
 *     back into the lanes.
 *   - **length >= 89 000** — a runtime-partitioned reduction whose result
 *     depends on the worker-thread count, so it is not reproducible. A
 *     midpoint-split pairwise tree is the closest deterministic stand-in
 *     (it reproduces MATLAB's answer for the 3.45-million-element `ld_pdf`
 *     vector of the Armenter & Koren replication package bit for bit).
 *
 * This is not cosmetic. A naive left-to-right accumulation reproduces
 * MATLAB's result for only 1 349 of 2 446 fixture cases; the regime-aware
 * version reproduces 2 445 of them and additionally matches MATLAB's `sum` of
 * the replication vector bit for bit.
 */
export function matlabSumVector(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n < MATLAB_SIMD_MIN_LENGTH) return sumSequential(values);
  if (n < MATLAB_PARTITIONED_MIN_LENGTH) return sumSimdLanes(values);
  return sumPairwise(values);
}

/**
 * A midpoint-split pairwise tree, the closest deterministic stand-in for
 * MATLAB's runtime-partitioned reduction.
 */
function sumPairwise(values: number[]): number {
  if (values.length <= MATLAB_SIMD_MIN_LENGTH) return sumSequential(values);
  const mid = values.length >> 1;
  return sumPairwise(values.slice(0, mid)) + sumPairwise(values.slice(mid));
}

/**
 * Sum a *strided* vector the way MATLAB's `sum` does.
 *
 * In MATLAB's column-major storage the elements of a matrix row are strided
 * by the row count, so reducing along a row traverses memory in a different
 * order than reducing along a column, and MATLAB uses a different kernel for
 * it. Measured against MATLAB R2025b:
 *
 *   - **length < 2 048** — a plain left-to-right accumulation.
 *   - **length >= 2 048** — the same values grouped into contiguous blocks of
 *     1 024, each block summed left to right, the block sums combined left to
 *     right.
 *
 * The strided path stays thread-independent at every length tested, so it is
 * reproducible in full.
 */
export function matlabSumStrided(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n < MATLAB_STRIDED_MIN_LENGTH) return sumSequential(values);
  let s = 0;
  for (let off = 0; off < n; off += MATLAB_STRIDED_BLOCK) {
    const end = Math.min(off + MATLAB_STRIDED_BLOCK, n);
    let block = 0;
    for (let i = off; i < end; i++) block += values[i];
    s += block;
  }
  return s;
}

/**
 * A standard normal draw used when no generator is supplied.
 *
 * The session always has a {@link MatlabRng}, so this path only matters for
 * callers that construct a matrix outside the interpreter. It is a
 * Box-Muller transform, not MATLAB's ziggurat, so it must never be mistaken
 * for MATLAB-compatible output.
 */
function normalFallback(): number {
  const u1 = Math.max(1e-15, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export class Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: number[][];
  /**
   * Whether the values are MATLAB `logical`s rather than `double`s.
   *
   * The engine stores every number as an IEEE double, so a logical array is
   * a normal matrix whose elements happen to be 0 or 1. The flag exists so
   * that `class` and `islogical` can tell the two apart, and it is dropped
   * by every arithmetic operation — MATLAB's `true + 1` is a `double`.
   */
  isLogical = false;

  constructor(rows: number, cols: number, initialData?: number[][] | number[]) {
    this.rows = rows;
    this.cols = cols;

    if (initialData) {
      if (Array.isArray(initialData[0])) {
        this.data = (initialData as number[][]).map(row => [...row]);
      } else {
        // A flat array fills the matrix in row-major order.
        const flat = initialData as number[];
        this.data = [];
        for (let r = 0; r < rows; r++) {
          this.data.push(flat.slice(r * cols, (r + 1) * cols));
        }
      }
    } else {
      this.data = Array.from({ length: rows }, () => new Array(cols).fill(0));
    }
  }

  static fromArray(arr: number[][]): Matrix {
    const rows = arr.length;
    const cols = rows > 0 ? arr[0].length : 0;
    return new Matrix(rows, cols, arr);
  }

  /**
   * Build a column vector from a flat list of values.
   *
   * `new Matrix(n, 1, [values])` would not work: the constructor reads a
   * one-row array as a single row of `cols` columns, which leaves the
   * matrix with the wrong number of rows.
   */
  static column(values: number[]): Matrix {
    return new Matrix(values.length, 1, values.map((v) => [v]));
  }

  static scalar(val: number): Matrix {
    return new Matrix(1, 1, [[val]]);
  }

  /**
   * Concatenate matrices along a dimension, the way MATLAB's `cat` does.
   *
   * `dim` 1 stacks the inputs vertically, `dim` 2 places them side by side.
   * MATLAB requires the other dimension to agree and reports a
   * "Dimensions of arrays being concatenated are not consistent" error
   * when it does not.
   */
  static concat(dim: 1 | 2, parts: Matrix[]): Matrix {
    if (parts.length === 0) return new Matrix(0, 0);
    const first = parts[0];

    if (dim === 1) {
      // Every part must have the same number of columns.
      const cols = first.cols;
      for (const p of parts) {
        if (p.cols !== cols) {
          throw new Error(
            'Dimensions of arrays being concatenated are not consistent. ' +
              `Expected ${cols} columns but found ${p.cols}.`
          );
        }
      }
      const rows = parts.reduce((n, p) => n + p.rows, 0);
      const out = new Matrix(rows, cols);
      let r = 0;
      for (const p of parts) {
        for (let pr = 0; pr < p.rows; pr++) {
          for (let c = 0; c < cols; c++) {
            out.data[r + pr][c] = p.data[pr][c];
          }
        }
        r += p.rows;
      }
      return out;
    }

    // dim === 2: every part must have the same number of rows.
    const rows = first.rows;
    for (const p of parts) {
      if (p.rows !== rows) {
        throw new Error(
          'Dimensions of arrays being concatenated are not consistent. ' +
            `Expected ${rows} rows but found ${p.rows}.`
        );
      }
    }
    const cols = parts.reduce((n, p) => n + p.cols, 0);
    const out = new Matrix(rows, cols);
    let c0 = 0;
    for (const p of parts) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < p.cols; c++) {
          out.data[r][c0 + c] = p.data[r][c];
        }
      }
      c0 += p.cols;
    }
    return out;
  }

  static zeros(rows: number, cols: number = rows): Matrix {
    return new Matrix(rows, cols);
  }

  static ones(rows: number, cols: number = rows): Matrix {
    const m = new Matrix(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.data[r][c] = 1;
      }
    }
    return m;
  }

  /**
   * Return a copy of this matrix resized to `rows` x `cols`.
   *
   * MATLAB grows arrays automatically when an indexed assignment lands
   * outside the current bounds. The existing values keep their positions
   * and the new cells are zero-filled.
   */
  resized(rows: number, cols: number): Matrix {
    const out = new Matrix(rows, cols);
    for (let r = 0; r < Math.min(rows, this.rows); r++) {
      for (let c = 0; c < Math.min(cols, this.cols); c++) {
        out.data[r][c] = this.data[r][c];
      }
    }
    return out;
  }

  static eye(rows: number, cols: number = rows): Matrix {
    const m = new Matrix(rows, cols);
    const minDim = Math.min(rows, cols);
    for (let i = 0; i < minDim; i++) {
      m.data[i][i] = 1;
    }
    return m;
  }

  /**
   * A matrix of uniform draws in [0, 1).
   *
   * The generator is passed in so the draw sequence follows the session's
   * MATLAB-compatible twister generator rather than `Math.random`.
   *
   * The draws are placed in **column-major** order, which is the order
   * MATLAB fills a matrix in. `Matrix` stores row-major, so the loops run
   * over columns first; filling row-major would hand the same numbers to
   * different elements and change every result downstream.
   */
  static rand(rows: number, cols?: number, rng?: MatlabRng): Matrix {
    const c = cols ?? rows;
    const m = new Matrix(rows, c);
    for (let cc = 0; cc < c; cc++) {
      for (let r = 0; r < rows; r++) {
        m.data[r][cc] = rng ? rng.nextDouble() : Math.random();
      }
    }
    return m;
  }

  /**
   * A matrix of standard normal draws.
   *
   * MATLAB's `twister` generator draws these with the ziggurat method, and
   * `MatlabRng.nextNormal()` reproduces MATLAB's exact sequence — so the
   * values are not merely identically distributed, they are the same numbers
   * MATLAB produces from the same seed.
   *
   * As with {@link Matrix.rand}, the matrix is filled in column-major order.
   */
  static randn(rows: number, cols?: number, rng?: MatlabRng): Matrix {
    const c = cols ?? rows;
    const m = new Matrix(rows, c);
    for (let cc = 0; cc < c; cc++) {
      for (let r = 0; r < rows; r++) {
        m.data[r][cc] = rng ? rng.nextNormal() : normalFallback();
      }
    }
    return m;
  }

  static linspace(start: number, stop: number, n: number = 100): Matrix {
    if (n < 2) return Matrix.fromArray([[stop]]);
    const step = (stop - start) / (n - 1);
    const row: number[] = [];
    for (let i = 0; i < n; i++) {
      row.push(start + i * step);
    }
    return new Matrix(1, n, [row]);
  }

  /**
   * Build the sequence `start:step:end`.
   *
   * MATLAB computes the elements as `start + k*step` rather than by
   * repeatedly adding `step`. The difference matters: accumulating
   * `0.01` 100 times drifts to `1.0000000000000007`, so `ceil` would return
   * 2 where MATLAB returns 1.
   */
  static range(start: number, step: number, end: number): Matrix {
    if (step === 0 || !Number.isFinite(step)) {
      return new Matrix(1, 0, [[]]);
    }
    const count = step > 0
      ? Math.floor((end - start) / step + 1e-10) + 1
      : Math.floor((start - end) / -step + 1e-10) + 1;
    const n = Math.max(0, count);
    const vals: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = start + k * step;
      if (step > 0 ? v > end + 1e-9 * Math.max(1, Math.abs(end)) : v < end - 1e-9 * Math.max(1, Math.abs(end))) {
        break;
      }
      vals.push(v);
    }
    return new Matrix(1, vals.length, [vals]);
  }

  isScalar(): boolean {
    return this.rows === 1 && this.cols === 1;
  }

  isSquare(): boolean {
    return this.rows === this.cols;
  }

  /** True when the matrix holds no elements. */
  isEmpty(): boolean {
    return this.rows === 0 || this.cols === 0;
  }

  getScalar(): number {
    return this.data[0][0];
  }

  // 1-based matrix indexing convention
  get(row: number, col: number): number {
    if (row < 1 || row > this.rows || col < 1 || col > this.cols) {
      throw new Error(`Index exceeds matrix dimensions: index (${row}, ${col}) on ${this.rows}x${this.cols} matrix`);
    }
    return this.data[row - 1][col - 1];
  }

  set(row: number, col: number, val: number): void {
    if (row < 1 || col < 1) {
      throw new Error(`Subscript indices must either be real positive integers or logicals`);
    }
    // Dynamic matrix expansion
    while (this.rows < row) {
      this.data.push(new Array(this.cols).fill(0));
      (this as any).rows++;
    }
    for (let r = 0; r < this.rows; r++) {
      while (this.data[r].length < col) {
        this.data[r].push(0);
      }
    }
    (this as any).cols = Math.max(this.cols, col);
    this.data[row - 1][col - 1] = val;
  }

  clone(): Matrix {
    return new Matrix(this.rows, this.cols, this.data);
  }

  toArray(): number[][] {
    return this.data.map(row => [...row]);
  }

  toFlatArray(): number[] {
    return this.data.flat();
  }

  /**
   * Flatten in MATLAB's column-major order.
   *
   * MATLAB stores matrices column-major, so linear indices (`A(4)`) and
   * `reshape` follow that order. Internally OpenMat keeps row-major storage,
   * so this conversion is used wherever MATLAB's linear order is observable.
   */
  toColumnMajor(): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        out.push(this.data[r][c]);
      }
    }
    return out;
  }

  /** Convert a 1-based column-major linear index into (row, col). */
  columnMajorToRC(linear: number): { row: number; col: number } {
    if (linear < 1 || linear > this.rows * this.cols) {
      throw new Error(`Index exceeds matrix dimensions: ${linear}`);
    }
    const idx = linear - 1;
    return { row: (idx % this.rows) + 1, col: Math.floor(idx / this.rows) + 1 };
  }

  /** Read the element at a 1-based column-major linear index. */
  getColumnMajorIndex(linear: number): number {
    const { row, col } = this.columnMajorToRC(linear);
    return this.data[row - 1][col - 1];
  }

  /** Write the element at a 1-based column-major linear index. */
  setColumnMajorIndex(linear: number, val: number): void {
    const { row, col } = this.columnMajorToRC(linear);
    this.set(row, col, val);
  }

  /**
   * Replace the whole matrix from a column-major flat array, growing the
   * matrix when needed (used by `A(:) = v` and `reshape`).
   */
  setColumnMajor(values: number[]): void {
    const rows = this.rows || 1;
    const cols = this.cols || 1;
    const total = rows * cols;
    if (values.length === total) {
      let i = 0;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          this.data[r][c] = values[i++];
        }
      }
      return;
    }
    // Reshape to fit the supplied values, keeping column-major order.
    const newRows = rows;
    const newCols = Math.ceil(values.length / newRows);
    const grown: number[][] = [];
    for (let r = 0; r < newRows; r++) grown.push(new Array(newCols).fill(0));
    let i = 0;
    for (let c = 0; c < newCols; c++) {
      for (let r = 0; r < newRows; r++) {
        grown[r][c] = i < values.length ? values[i++] : 0;
      }
    }
    (this as any).data = grown;
    (this as any).cols = newCols;
  }

  // Matrix multiplication
  mul(other: Matrix | number): Matrix {
    if (typeof other === 'number') {
      return this.map(x => x * other);
    }
    if (this.isScalar()) {
      return other.map(x => this.getScalar() * x);
    }
    if (other.isScalar()) {
      return this.map(x => x * other.getScalar());
    }
    if (this.cols !== other.rows) {
      throw new Error(`Incorrect dimensions for matrix multiplication: ${this.rows}x${this.cols} * ${other.rows}x${other.cols}`);
    }
    const res = Matrix.zeros(this.rows, other.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < other.cols; c++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.data[r][k] * other.data[k][c];
        }
        res.data[r][c] = sum;
      }
    }
    return res;
  }

  /**
   * Matrix right division `A / B` = A * inv(B).
   * Follows the MATLAB convention: the left operand is scaled by the inverse
   * of the right operand.
   */
  mldivide(other: Matrix): Matrix {
    if (other.isScalar()) {
      if (other.getScalar() === 0) throw new Error('Matrix division by zero.');
      return this.map(x => x / other.getScalar());
    }
    if (!other.isSquare()) {
      throw new Error(
        `Matrix right division requires a square right operand: ${this.rows}x${this.cols} / ${other.rows}x${other.cols}`
      );
    }
    const inverse = other.inv();
    if (inverse === null) {
      throw new Error('Matrix is singular to working precision.');
    }
    return this.mul(inverse);
  }

  /**
   * Matrix left division `A \ B` = inv(A) * B.
   * Follows the MATLAB convention: the right operand is scaled by the inverse
   * of the left operand.
   */
  ldivide(other: Matrix): Matrix {
    if (this.isScalar()) {
      if (this.getScalar() === 0) throw new Error('Matrix division by zero.');
      return other.map(x => x / this.getScalar());
    }
    if (!this.isSquare()) {
      throw new Error(
        `Matrix left division requires a square left operand: ${this.rows}x${this.cols} \\ ${other.rows}x${other.cols}`
      );
    }
    const inverse = this.inv();
    if (inverse === null) {
      throw new Error('Matrix is singular to working precision.');
    }
    return inverse.mul(other);
  }

  // Element-wise operations
  add(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x + other);
    return this.elementWise(other, (a, b) => a + b);
  }

  sub(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x - other);
    return this.elementWise(other, (a, b) => a - b);
  }

  dotMul(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x * other);
    return this.elementWise(other, (a, b) => a * b);
  }

  dotDiv(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x / other);
    return this.elementWise(other, (a, b) => a / b);
  }

  dotPow(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => Math.pow(x, other));
    return this.elementWise(other, (a, b) => Math.pow(a, b));
  }

  neg(): Matrix {
    return this.map(x => -x);
  }

  transpose(): Matrix {
    const res = Matrix.zeros(this.cols, this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        res.data[c][r] = this.data[r][c];
      }
    }
    return res;
  }

  /**
   * Return this matrix as a *logical* matrix: every non-zero entry becomes
   * 1, every zero becomes 0, and the result reports `class` as `'logical'`.
   *
   * MATLAB's comparison and logical operators produce logical arrays, not
   * double arrays, so `class(A == B)` must be `'logical'`.
   */
  asLogical(): Matrix {
    const out = this.map(x => (x === 0 ? 0 : 1));
    out.isLogical = true;
    return out;
  }

  map(fn: (val: number, r: number, c: number) => number): Matrix {
    const res = Matrix.zeros(this.rows, this.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        res.data[r][c] = fn(this.data[r][c], r, c);
      }
    }
    return res;
  }

  /**
   * Element-wise application of `fn` to two operands.
   *
   * Implements MATLAB's implicit expansion (R2016b+): a singleton dimension of
   * either operand is stretched to match the other, and a scalar operand is
   * broadcast against a matrix of any shape. The previous implementation
   * indexed the right operand row-by-row, which threw "Cannot read properties
   * of undefined" whenever the right operand was a scalar and the left operand
   * had more than one row.
   */
  elementWise(other: Matrix, fn: (a: number, b: number) => number): Matrix {
    const { rows, cols } = broadcastShape(this, other);
    const res = Matrix.zeros(rows, cols);
    for (let r = 0; r < rows; r++) {
      const ar = this.rows === 1 ? 0 : r;
      for (let c = 0; c < cols; c++) {
        const ac = this.cols === 1 ? 0 : c;
        const br = other.rows === 1 ? 0 : r;
        const bc = other.cols === 1 ? 0 : c;
        res.data[r][c] = fn(this.data[ar][ac], other.data[br][bc]);
      }
    }
    return res;
  }

  private checkSameSize(other: Matrix): void {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(`Matrix dimensions must agree: (${this.rows}x${this.cols} vs ${other.rows}x${other.cols})`);
    }
  }

  // Linear algebra
  det(): number {
    if (this.rows !== this.cols) {
      throw new Error('Matrix must be square to compute determinant');
    }
    const n = this.rows;
    if (n === 1) return this.data[0][0];
    if (n === 2) return this.data[0][0] * this.data[1][1] - this.data[0][1] * this.data[1][0];

    const a = this.data.map(row => [...row]);
    let det = 1;
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) {
          pivot = j;
        }
      }
      if (Math.abs(a[pivot][i]) < 1e-12) return 0;
      if (pivot !== i) {
        [a[i], a[pivot]] = [a[pivot], a[i]];
        det = -det;
      }
      det *= a[i][i];
      for (let j = i + 1; j < n; j++) {
        const factor = a[j][i] / a[i][i];
        for (let k = i; k < n; k++) {
          a[j][k] -= factor * a[i][k];
        }
      }
    }
    return det;
  }

  /**
   * Inverse of a square matrix.
   *
   * A singular matrix is not an error in MATLAB: it warns and returns a
   * matrix of infinities. The warning is emitted by the `inv` builtin, so
   * this method returns `null` to signal the singular case.
   */
  inv(): Matrix | null {
    if (this.rows !== this.cols) {
      throw new Error('Matrix must be square to compute inverse');
    }
    const n = this.rows;
    const a = this.data.map(row => [...row]);
    const inv = Matrix.eye(n).data;

    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) {
          pivot = j;
        }
      }
      if (Math.abs(a[pivot][i]) < 1e-12) {
        return null;
      }
      if (pivot !== i) {
        [a[i], a[pivot]] = [a[pivot], a[i]];
        [inv[i], inv[pivot]] = [inv[pivot], inv[i]];
      }
      const div = a[i][i];
      for (let j = 0; j < n; j++) {
        a[i][j] /= div;
        inv[i][j] /= div;
      }
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          const factor = a[j][i];
          for (let k = 0; k < n; k++) {
            a[j][k] -= factor * a[i][k];
            inv[j][k] -= factor * inv[i][k];
          }
        }
      }
    }
    return new Matrix(n, n, inv);
  }

  trace(): number {
    const minDim = Math.min(this.rows, this.cols);
    let sum = 0;
    for (let i = 0; i < minDim; i++) {
      sum += this.data[i][i];
    }
    return sum;
  }

  norm(): number {
    let sumSq = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        sumSq += this.data[r][c] * this.data[r][c];
      }
    }
    return Math.sqrt(sumSq);
  }

  sum(dim: number = 1): Matrix {
    if (this.isScalar()) return this.clone();
    if (dim === 1) {
      // Sum along columns (yields 1 x cols). A column is contiguous in
      // MATLAB's column-major storage, so this is the contiguous reduction.
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        const col = new Array<number>(this.rows);
        for (let r = 0; r < this.rows; r++) col[r] = this.data[r][c];
        res.data[0][c] = matlabSumVector(col);
      }
      return res;
    } else {
      // Sum along rows (yields rows x 1). A row of an M x N matrix is
      // strided by M in MATLAB's column-major storage, so this uses the
      // strided reduction -- except for a single-row matrix, whose row is
      // the whole (contiguous) array.
      const res = Matrix.zeros(this.rows, 1);
      const reduce = this.rows === 1 ? matlabSumVector : matlabSumStrided;
      for (let r = 0; r < this.rows; r++) {
        res.data[r][0] = reduce(this.data[r]);
      }
      return res;
    }
  }

  mean(dim: number = 1): Matrix {
    const s = this.sum(dim);
    const count = dim === 1 ? this.rows : this.cols;
    return s.dotDiv(count);
  }

  /**
   * Product along a dimension.
   *
   * `prod(A, 1)` yields a 1 x cols row (one product per column) and
   * `prod(A, 2)` a rows x 1 column (one product per row). A matrix with
   * one dimension collapses to a scalar along that dimension.
   */
  prod(dim: number = 1): Matrix {
    if (dim === 1) {
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        let v = 1;
        for (let r = 0; r < this.rows; r++) v *= this.data[r][c];
        res.data[0][c] = v;
      }
      return res;
    }
    const res = Matrix.zeros(this.rows, 1);
    for (let r = 0; r < this.rows; r++) {
      let v = 1;
      for (let c = 0; c < this.cols; c++) v *= this.data[r][c];
      res.data[r][0] = v;
    }
    return res;
  }

  /**
   * Cumulative sum along a dimension.
   *
   * `cumsum(A, 1)` accumulates down each column and `cumsum(A, 2)` across
   * each row; the result keeps the input's shape.
   */
  cumsum(dim: number = 1): Matrix {
    const res = new Matrix(this.rows, this.cols, this.toFlatArray());
    if (dim === 1) {
      for (let c = 0; c < this.cols; c++) {
        let acc = 0;
        for (let r = 0; r < this.rows; r++) {
          acc += this.data[r][c];
          res.data[r][c] = acc;
        }
      }
    } else {
      for (let r = 0; r < this.rows; r++) {
        let acc = 0;
        for (let c = 0; c < this.cols; c++) {
          acc += this.data[r][c];
          res.data[r][c] = acc;
        }
      }
    }
    return res;
  }

  /**
   * Cumulative product along a dimension.
   *
   * `cumprod(A, 1)` accumulates down each column and `cumprod(A, 2)`
   * across each row; the result keeps the input's shape.
   */
  cumprod(dim: number = 1): Matrix {
    const res = new Matrix(this.rows, this.cols, this.toFlatArray());
    if (dim === 1) {
      for (let c = 0; c < this.cols; c++) {
        let acc = 1;
        for (let r = 0; r < this.rows; r++) {
          acc *= this.data[r][c];
          res.data[r][c] = acc;
        }
      }
    } else {
      for (let r = 0; r < this.rows; r++) {
        let acc = 1;
        for (let c = 0; c < this.cols; c++) {
          acc *= this.data[r][c];
          res.data[r][c] = acc;
        }
      }
    }
    return res;
  }

  /**
   * Minimum along a dimension.
   *
   * With no dimension, MATLAB returns a scalar holding the smallest element
   * of the whole matrix. With `dim = 1` the result is a 1 x cols row, with
   * `dim = 2` a rows x 1 column.
   */
  minDim(dim: number): Matrix {
    if (dim === 1) {
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        let v = Infinity;
        for (let r = 0; r < this.rows; r++) v = Math.min(v, this.data[r][c]);
        res.data[0][c] = v;
      }
      return res;
    }
    const res = Matrix.zeros(this.rows, 1);
    for (let r = 0; r < this.rows; r++) {
      let v = Infinity;
      for (let c = 0; c < this.cols; c++) v = Math.min(v, this.data[r][c]);
      res.data[r][0] = v;
    }
    return res;
  }

  /** Maximum along a dimension; see `minDim`. */
  maxDim(dim: number): Matrix {
    if (dim === 1) {
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        let v = -Infinity;
        for (let r = 0; r < this.rows; r++) v = Math.max(v, this.data[r][c]);
        res.data[0][c] = v;
      }
      return res;
    }
    const res = Matrix.zeros(this.rows, 1);
    for (let r = 0; r < this.rows; r++) {
      let v = -Infinity;
      for (let c = 0; c < this.cols; c++) v = Math.max(v, this.data[r][c]);
      res.data[r][0] = v;
    }
    return res;
  }

  /** `any` along a dimension: 1 where at least one element is non-zero. */
  anyDim(dim: number): Matrix {
    if (dim === 1) {
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (this.data[r][c] !== 0) { res.data[0][c] = 1; break; }
        }
      }
      return res;
    }
    const res = Matrix.zeros(this.rows, 1);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.data[r][c] !== 0) { res.data[r][0] = 1; break; }
      }
    }
    return res;
  }

  /** `all` along a dimension: 1 where every element is non-zero. */
  allDim(dim: number): Matrix {
    if (dim === 1) {
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        let ok = 1;
        for (let r = 0; r < this.rows; r++) {
          if (this.data[r][c] === 0) { ok = 0; break; }
        }
        res.data[0][c] = ok;
      }
      return res;
    }
    const res = Matrix.zeros(this.rows, 1);
    for (let r = 0; r < this.rows; r++) {
      let ok = 1;
      for (let c = 0; c < this.cols; c++) {
        if (this.data[r][c] === 0) { ok = 0; break; }
      }
      res.data[r][0] = ok;
    }
    return res;
  }

  /**
   * Smallest element of the whole matrix.
   *
   * The reduction is written as an explicit loop instead of
   * `Math.min(...flat)`: spreading a multi-million element array overflows the
   * JavaScript call stack, which made large grids (e.g. a `0.01:0.01:34506`
   * range) fail with "Maximum call stack size exceeded".
   */
  min(): number {
    if (this.isEmpty()) return NaN;
    let v = Infinity;
    for (let r = 0; r < this.rows; r++) {
      const row = this.data[r];
      for (let c = 0; c < row.length; c++) {
        const x = row[c];
        if (x < v) v = x;
      }
    }
    return v;
  }

  /** Largest element of the whole matrix; see `min`. */
  max(): number {
    if (this.isEmpty()) return NaN;
    let v = -Infinity;
    for (let r = 0; r < this.rows; r++) {
      const row = this.data[r];
      for (let c = 0; c < row.length; c++) {
        const x = row[c];
        if (x > v) v = x;
      }
    }
    return v;
  }

  /**
   * Render the matrix the way MATLAB's command window does.
   *
   * The rules below were established by probing MATLAB R2025b directly (see
   * `tests/display-suite/display.m` and the `probe*.m` harnesses), because
   * replication packages read the Command Window output:
   *
   *  - Every row of the matrix is printed. MATLAB does *not* truncate rows.
   *  - A row is split into column blocks when it does not fit on one line.
   *    The block width follows the field width: a 6-wide field fits 13
   *    columns, a 12-wide field fits 6, and a 10-wide field fits 7.
   *  - Each block is preceded by a `Columns N through M` header (or
   *    `Column N` for a single-column block) and a blank line.
   *  - An integer-valued array is printed in integer notation: a 6-wide
   *    field for values of up to three digits, a 12-wide field for wider
   *    values. An array whose values need more than nine digits switches to
   *    the scaled floating-point notation.
   *  - Otherwise MATLAB prints `%10.4f` for every value.
   *  - Large or small magnitudes share a `X.XXXe+NN *` scale factor.
   */
  format(): string {
    if (this.rows === 0 || this.cols === 0) return '[]';
    if (this.isScalar()) {
      return this.formatScalarCell(this.getScalar());
    }

    // MATLAB's `format short` prints 4 decimals for non-integer arrays and
    // no decimals when every element is an integer.
    const allIntegers = this.allIntegers();

    // The scale factor MATLAB applies to the whole array.
    //
    // Floating-point arrays switch to the scaled notation once the widest
    // value reaches three integer digits, or drops below 1e-3. Integer
    // arrays switch once a value needs more than nine digits.
    const maxAbs = this.maxAbs();
    let scale = 1;
    let scaled = false;
    if (maxAbs !== 0) {
      if (allIntegers) {
        if (this.maxDigits() > 9) {
          scale = Math.pow(10, Math.floor(Math.log10(maxAbs)));
          scaled = true;
        }
      } else if (maxAbs >= 1e3 || maxAbs < 1e-3) {
        // For small magnitudes MATLAB picks the exponent one above the
        // decimal exponent, so the widest value lands in [0.1, 1).
        const exp =
          maxAbs >= 1e3
            ? Math.floor(Math.log10(maxAbs))
            : Math.floor(Math.log10(maxAbs)) + 1;
        scale = Math.pow(10, exp);
        scaled = true;
      }
    }

    const lines: string[] = [];
    if (scaled) {
      lines.push(`   ${formatScaleFactor(scale)} *`);
      lines.push('');
    }

    // Integer notation keeps MATLAB's per-value digit count: a value of up
    // to three digits gets a 6-wide field, wider values a 12-wide field.
    // Floating-point values always use a 10-wide `%10.4f` field.
    const integerNotation = allIntegers && !scaled;
    const digits = integerNotation ? this.maxDigits() : 0;
    const fieldWidth = integerNotation ? (digits <= 3 ? 6 : 12) : 10;

    const texts: string[][] = [];
    for (let r = 0; r < this.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < this.cols; c++) {
        const raw = this.data[r][c];
        const v = scaled ? raw / scale : raw;
        row.push(this.formatScaled(v, allIntegers, scaled));
      }
      texts.push(row);
    }

    // MATLAB keeps the line within its 79-column Command Window width.
    const colsPerBlock = Math.max(1, Math.min(this.cols, Math.floor(79 / fieldWidth)));
    const multiBlock = this.cols > colsPerBlock;

    for (let start = 0; start < this.cols; start += colsPerBlock) {
      const end = Math.min(start + colsPerBlock, this.cols);
      if (multiBlock) {
        if (start > 0) lines.push('');
        lines.push(
          end === start + 1
            ? `  Column ${start + 1}`
            : `  Columns ${start + 1} through ${end}`
        );
        lines.push('');
      }
      for (let r = 0; r < this.rows; r++) {
        const rowStr = texts[r].slice(start, end).map((s) => s.padStart(fieldWidth));
        lines.push(rowStr.join(''));
      }
    }
    if (multiBlock) lines.push('');

    return lines.join('\n');
  }

  /**
   * True when every finite element of the matrix is an integer.
   *
   * MATLAB ignores infinities and NaNs when it decides between the integer
   * and the floating-point notation.
   */
  private allIntegers(): boolean {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.data[r][c];
        if (!Number.isFinite(v)) continue;
        if (!Number.isInteger(v)) return false;
      }
    }
    return true;
  }

  /**
   * The largest number of significant digits among the array's values.
   *
   * The sign does not count: MATLAB fits `-999` into the same 6-wide field
   * as `999`.
   */
  private maxDigits(): number {
    let max = 1;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = Math.abs(this.data[r][c]);
        if (!Number.isFinite(v)) continue;
        const d = v === 0 ? 1 : Math.floor(Math.log10(v)) + 1;
        if (d > max) max = d;
      }
    }
    return max;
  }

  /** Largest absolute element, or 0 for an all-zero matrix. */
  private maxAbs(): number {
    let v = 0;
    for (let r = 0; r < this.rows; r++) {
      const row = this.data[r];
      for (let c = 0; c < row.length; c++) {
        const x = row[c];
        // MATLAB ignores infinities and NaNs when choosing the scale factor.
        if (!Number.isFinite(x)) continue;
        const a = Math.abs(x);
        if (a > v) v = a;
      }
    }
    return v;
  }

  /** Format one value in MATLAB's `%10.4f` floating-point notation. */
  private formatScaled(v: number, allIntegers: boolean, scaled: boolean): string {
    // MATLAB prints NaN and Inf in a 6-wide field even inside a
    // floating-point array: `disp([1.5 NaN])` is `    1.5000       NaN`,
    // where "NaN" occupies six columns, not ten.
    if (Number.isNaN(v)) return '  NaN';
    if (!Number.isFinite(v)) return v > 0 ? '  Inf' : ' -Inf';
    // MATLAB prints an exact zero in integer notation even inside a
    // floating-point array.
    if (v === 0) return '0';
    if (scaled) return v.toFixed(4);
    if (allIntegers && Number.isInteger(v)) return String(v);
    if (Number.isInteger(v)) return v.toFixed(4);
    return v.toFixed(4);
  }
  /**
   * Format a single value the way MATLAB's `disp` renders a 1x1 array.
   *
   * MATLAB uses a 10-wide field for floating-point values and right-aligns
   * integers in a field wide enough for the digits.
   */
  private formatScalarCell(v: number): string {
    // MATLAB prints a lone NaN/Inf in the 6-wide integer field, not the
    // 10-wide floating-point field: `disp(NaN)` is `   NaN`, and
    // `disp(-Inf)` is `  -Inf`.
    if (Number.isNaN(v)) return '   NaN';
    if (!Number.isFinite(v)) return v > 0 ? '   Inf' : '  -Inf';
    if (v === 0) return '     0';
    if (Number.isInteger(v)) {
      const text = String(v);
      return text.padStart(Math.max(6, text.length + 1));
    }
    if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-4) {
      return formatExponential(v).padStart(10);
    }
    return v.toFixed(4).padStart(10);
  }
}

/**
 * Render a scale factor the way MATLAB does: `1.0e+16` — one digit before the
 * decimal point, one after it, and a two-digit exponent.
 */
function formatScaleFactor(scale: number): string {
  const exp = Math.floor(Math.log10(scale));
  const mantissa = scale / Math.pow(10, exp);
  return `${mantissa.toFixed(1)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/**
 * Render a value in MATLAB's scientific notation: `1.0000e-05`, with the
 * exponent padded to two digits.
 */
function formatExponential(v: number): string {
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mantissa = v / Math.pow(10, exp);
  return `${mantissa.toFixed(4)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}
