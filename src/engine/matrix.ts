export class Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: number[][];

  constructor(rows: number, cols: number, initialData?: number[][] | number[]) {
    this.rows = rows;
    this.cols = cols;

    if (initialData) {
      if (Array.isArray(initialData[0])) {
        this.data = (initialData as number[][]).map(row => [...row]);
      } else {
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

  static scalar(val: number): Matrix {
    return new Matrix(1, 1, [[val]]);
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

  static eye(rows: number, cols: number = rows): Matrix {
    const m = new Matrix(rows, cols);
    const minDim = Math.min(rows, cols);
    for (let i = 0; i < minDim; i++) {
      m.data[i][i] = 1;
    }
    return m;
  }

  static rand(rows: number, cols: number = rows): Matrix {
    const m = new Matrix(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.data[r][c] = Math.random();
      }
    }
    return m;
  }

  static randn(rows: number, cols: number = rows): Matrix {
    const m = new Matrix(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Box-Muller transform for standard normal distribution
        const u1 = Math.max(1e-15, Math.random());
        const u2 = Math.random();
        m.data[r][c] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
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

  static range(start: number, step: number, end: number): Matrix {
    const vals: number[] = [];
    if (step > 0) {
      for (let v = start; v <= end + 1e-12; v += step) {
        vals.push(v);
      }
    } else if (step < 0) {
      for (let v = start; v >= end - 1e-12; v += step) {
        vals.push(v);
      }
    }
    return new Matrix(1, vals.length, [vals]);
  }

  isScalar(): boolean {
    return this.rows === 1 && this.cols === 1;
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

  // Element-wise operations
  add(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x + other);
    if (this.isScalar()) return other.map(x => this.getScalar() + x);
    if (other.isScalar()) return this.map(x => x + other.getScalar());
    this.checkSameSize(other);
    return this.elementWise(other, (a, b) => a + b);
  }

  sub(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x - other);
    if (this.isScalar()) return other.map(x => this.getScalar() - x);
    if (other.isScalar()) return this.map(x => x - other.getScalar());
    this.checkSameSize(other);
    return this.elementWise(other, (a, b) => a - b);
  }

  dotMul(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x * other);
    if (this.isScalar()) return other.map(x => this.getScalar() * x);
    if (other.isScalar()) return this.map(x => x * other.getScalar());
    this.checkSameSize(other);
    return this.elementWise(other, (a, b) => a * b);
  }

  dotDiv(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => x / other);
    if (this.isScalar()) return other.map(x => this.getScalar() / x);
    if (other.isScalar()) return this.map(x => x / other.getScalar());
    this.checkSameSize(other);
    return this.elementWise(other, (a, b) => a / b);
  }

  dotPow(other: Matrix | number): Matrix {
    if (typeof other === 'number') return this.map(x => Math.pow(x, other));
    if (this.isScalar()) return other.map(x => Math.pow(this.getScalar(), x));
    if (other.isScalar()) return this.map(x => Math.pow(x, other.getScalar()));
    this.checkSameSize(other);
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

  map(fn: (val: number, r: number, c: number) => number): Matrix {
    const res = Matrix.zeros(this.rows, this.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        res.data[r][c] = fn(this.data[r][c], r, c);
      }
    }
    return res;
  }

  elementWise(other: Matrix, fn: (a: number, b: number) => number): Matrix {
    const res = Matrix.zeros(this.rows, this.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        res.data[r][c] = fn(this.data[r][c], other.data[r][c]);
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

  inv(): Matrix {
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
        throw new Error('Matrix is singular to working precision');
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
      // Sum along columns (yields 1 x cols)
      const res = Matrix.zeros(1, this.cols);
      for (let c = 0; c < this.cols; c++) {
        let s = 0;
        for (let r = 0; r < this.rows; r++) s += this.data[r][c];
        res.data[0][c] = s;
      }
      return res;
    } else {
      // Sum along rows (yields rows x 1)
      const res = Matrix.zeros(this.rows, 1);
      for (let r = 0; r < this.rows; r++) {
        let s = 0;
        for (let c = 0; c < this.cols; c++) s += this.data[r][c];
        res.data[r][0] = s;
      }
      return res;
    }
  }

  mean(dim: number = 1): Matrix {
    const s = this.sum(dim);
    const count = dim === 1 ? this.rows : this.cols;
    return s.dotDiv(count);
  }

  min(): number {
    return Math.min(...this.toFlatArray());
  }

  max(): number {
    return Math.max(...this.toFlatArray());
  }

  format(): string {
    if (this.rows === 0 || this.cols === 0) return '     []';
    if (this.isScalar()) {
      return `     ${this.formatNumber(this.getScalar())}`;
    }

    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      const rowStr = this.data[r]
        .map(v => this.formatNumber(v).padStart(10))
        .join(' ');
      lines.push('  ' + rowStr);
    }
    return lines.join('\n');
  }

  private formatNumber(v: number): string {
    if (Number.isInteger(v)) return v.toString();
    if (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e5) return v.toExponential(4);
    return v.toFixed(4);
  }
}
