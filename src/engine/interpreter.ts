import { Lexer } from './lexer';
import { Parser } from './parser';
import { Matrix } from './matrix';
import { BUILTINS, BuiltinContext } from './builtins';
import { MatlabRng } from './rng';
import {
  ASTNode,
  ProgramNode,
  StatementNode,
  AssignmentNode,
  MultiAssignmentNode,
  BinaryOpNode,
  UnaryOpNode,
  MatrixLiteralNode,
  RangeExprNode,
  IndexExprNode,
  FieldExprNode,
  FunctionCallNode,
  IfStatementNode,
  ForStatementNode,
  WhileStatementNode,
  FunctionDefNode,
  SwitchStatementNode,
  TryStatementNode,
  BreakStatementNode,
  ContinueStatementNode,
  ReturnStatementNode,
  CommandNode,
  ExecutionResult,
  PlotData
} from './types';

/**
 * Whether engine errors should print their JavaScript stack.
 *
 * `process` does not exist in the browser bundle, so this flag has to be read
 * defensively. An unguarded `process.env` access inside the error handler
 * threw a `ReferenceError` in the browser, which replaced the real MATLAB
 * error and escaped `execute()` — the UI then rendered *nothing at all* for
 * any failing command.
 */
const DEBUG_STACK =
  typeof process !== 'undefined' && !!process.env?.OPENMAT_DEBUG_STACK;

/**
 * Non-local control flow signals used by `break`, `continue` and `return`.
 * They are thrown as errors and caught by the owning loop or function.
 */
class ControlSignal extends Error {
  constructor(public kind: 'break' | 'continue' | 'return') {
    super(kind);
    this.name = 'ControlSignal';
  }
}

/**
 * The error object bound to a `catch` variable.
 *
 * MATLAB binds an `MException` whose `message`, `identifier` and `stack`
 * fields user code can read (`catch err` then `err.message`). OpenMat
 * models the same surface so that error-handling code written for MATLAB
 * runs unchanged.
 */
export class MException {
  constructor(
    public message: string,
    public identifier: string = 'OpenMat:execution:error',
    public stack: any = []
  ) {}

  /** MATLAB's `MException` displays as `identifier: message`. */
  toString(): string {
    return `${this.identifier}: ${this.message}`;
  }
}

/** Error raised when a name is neither a variable nor a known function. */
export class UndefinedNameError extends Error {
  constructor(public name: string) {
    super(`Unrecognized function or variable '${name}'.`);
    this.name = 'UndefinedNameError';
  }
}

export class Interpreter {
  private workspace: Record<string, any> = {};
  private functions: Record<string, FunctionDefNode> = {};
  private outputs: { text: string; isError?: boolean }[] = [];
  private plots: PlotData[] = [];
  private currentPlot?: PlotData;
  private holdOn: boolean = false;
  private timerStart?: number;

  /**
   * The session's pseudo-random number generator.
   *
   * MATLAB's `twister` generator is seeded reproducibly, so the generator is
   * part of the interpreter's state: `rng(42)` inside a script affects every
   * later `rand` call in that session, exactly as in MATLAB.
   */
  private rng: MatlabRng = new MatlabRng();

  /**
   * When set, `disp`-style output is pushed here instead of this
   * interpreter's own buffer. A sub-interpreter created for a user function
   * points this at its parent so that output written inside a function
   * reaches the Command Window.
   */
  private outputSink?: { text: string; isError?: boolean }[];

  /** Plot sink shared with a parent interpreter (see `outputSink`). */
  private plotSink?: PlotData[];

  /** Parent interpreter, used to resolve nested function output. */
  private parent?: Interpreter;

  /** Outputs returned by the most recent function call, for multi-output assignment. */
  private lastCallOutputs?: any[];

  /**
   * The number of outputs the statement being evaluated asked for.
   *
   * MATLAB's `find` returns row and column indices instead of linear
   * indices when it is called with two outputs, so the interpreter has to
   * tell the builtins how many values the caller expects.
   */
  private currentNargout = 1;
  /**
   * The number of arguments the function currently being executed received.
   *
   * `nargin` inside a function body reports this. It is `-1` at the top
   * level, which is what MATLAB reports for a script.
   */
  private currentNargin = -1;
  /**
   * The number of outputs the function currently being executed declares.
   *
   * `nargout` inside a function body reports this. It is `0` at the top
   * level, matching MATLAB.
   */
  private currentFunctionNargout = 0;

  constructor(initialWorkspace?: Record<string, any>) {
    if (initialWorkspace) {
      this.workspace = { ...initialWorkspace };
    }
  }

  /**
   * Adopt an existing pseudo-random number generator.
   *
   * MATLAB's `clear` empties the workspace but leaves the generator alone,
   * so a session that runs several scripts in sequence keeps drawing from
   * the same stream unless it calls `rng` explicitly. A caller that mirrors
   * that behaviour — the parity harness, for instance — can hand the same
   * generator to successive interpreters.
   */
  setRng(rng: MatlabRng): void {
    this.rng = rng;
  }

  /** The session's pseudo-random number generator. */
  getRng(): MatlabRng {
    return this.rng;
  }

  getWorkspace(): Record<string, any> {
    return { ...this.workspace };
  }

  setVariable(name: string, value: any): void {
    this.workspace[name] = value;
  }

  /**
   * Push a line of Command Window output.
   *
   * When this interpreter is running as a user function, the sink points at
   * the caller's buffer so that `disp` inside a function is not swallowed.
   */
  private emit(text: string, isError?: boolean): void {
    (this.outputSink ?? this.outputs).push({ text, isError });
  }

  /** Register a plot with the active plot sink. */
  private emitPlot(plot: PlotData): void {
    (this.plotSink ?? this.plots).push(plot);
  }

  execute(code: string): ExecutionResult {
    this.outputs = [];
    this.plots = [];

    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const program = parser.parse();

      this.executeProgram(program);
    } catch (err: any) {
      this.emit(`Error: ${err.message || String(err)}`, true);
      if (DEBUG_STACK) {
        // eslint-disable-next-line no-console
        console.error(err.stack);
      }
    }

    return {
      outputs: [...this.outputs],
      workspace: this.getWorkspace(),
      plots: [...this.plots]
    };
  }

  private executeProgram(program: ProgramNode): void {
    for (const stmt of program.body) {
      this.executeStatement(stmt);
    }
  }

  private executeStatement(stmt: StatementNode): void {
    const expr = stmt.expression;

    if (expr.type === 'Assignment') {
      const res = this.executeAssignment(expr);
      if (!stmt.suppressOutput && res !== undefined) {
        const targetName = (expr.target as any).name || 'ans';
        this.emit(`${targetName} =\n${this.formatValue(res)}`);
      }
      return;
    }

    if (expr.type === 'MultiAssignment') {
      this.executeMultiAssignment(expr);
      return;
    }

    if (expr.type === 'IfStatement') {
      this.executeIf(expr);
      return;
    }

    if (expr.type === 'ForStatement') {
      this.executeFor(expr);
      return;
    }

    if (expr.type === 'WhileStatement') {
      this.executeWhile(expr);
      return;
    }

    if (expr.type === 'FunctionDef') {
      this.functions[expr.name] = expr;
      return;
    }

    if (expr.type === 'SwitchStatement') {
      this.executeSwitch(expr);
      return;
    }

    if (expr.type === 'TryStatement') {
      this.executeTry(expr);
      return;
    }

    if (expr.type === 'BreakStatement') {
      throw new ControlSignal('break');
    }

    if (expr.type === 'ContinueStatement') {
      throw new ControlSignal('continue');
    }

    if (expr.type === 'ReturnStatement') {
      throw new ControlSignal('return');
    }

    if (expr.type === 'Command') {
      this.executeCommand(expr);
      return;
    }

    const val = this.evaluate(expr);
    if (val !== null && val !== undefined) {
      this.workspace['ans'] = val;
      if (!stmt.suppressOutput) {
        this.emit(`ans =\n${this.formatValue(val)}`);
      }
    }
  }

  private evaluate(node: ASTNode): any {
    switch (node.type) {
      case 'NumberLiteral':
        return Matrix.scalar(node.value);

      case 'StringLiteral':
        return node.value;

      case 'Identifier':
        if (node.name === 'pi') return Matrix.scalar(Math.PI);
        if (node.name === 'eps') return Matrix.scalar(Number.EPSILON);
        if (node.name === 'Inf') return Matrix.scalar(Infinity);
        if (node.name === 'NaN') return Matrix.scalar(NaN);
        // `nan` is both a constant and a function in MATLAB: `nan` is the
        // scalar NaN, `nan(r,c)` is an r-by-c array of NaNs.
        if (node.name === 'nan') return Matrix.scalar(NaN);
        if (node.name in this.workspace) {
          return this.workspace[node.name];
        }
        if (node.name in BUILTINS || node.name in this.functions) {
          return this.callFunction(node.name, []);
        }
        throw new UndefinedNameError(node.name);

      case 'MatrixLiteral':
        return this.evaluateMatrixLiteral(node);

      case 'RangeExpr':
        return this.evaluateRange(node);

      case 'BinaryOp':
        return this.evaluateBinaryOp(node);

      case 'UnaryOp':
        return this.evaluateUnaryOp(node);

      case 'FunctionCall':
      case 'IndexExpr':
        return this.evaluateCallOrIndex(node);

      case 'FieldExpr':
        return this.evaluateFieldExpr(node);

      default:
        throw new Error(`Unsupported expression type: ${(node as any).type}`);
    }
  }

  /**
   * Resolve a struct field: `s.field`.
   *
   * Structs are modelled as plain JavaScript objects, so a field read is a
   * property lookup. The most common use is reading a caught error's
   * `message` or `identifier`.
   */
  private evaluateFieldExpr(node: FieldExprNode): any {
    const target = this.evaluate(node.target);
    if (target === null || target === undefined) {
      throw new Error(`Cannot read field '${node.field}' from an undefined value.`);
    }
    if (typeof target !== 'object' || target instanceof Matrix) {
      throw new Error(
        `Cannot read field '${node.field}' from a ${this.describeType(target)}.`
      );
    }
    if (!(node.field in target)) {
      throw new Error(`Unrecognized field name '${node.field}'.`);
    }
    return target[node.field];
  }

  /** Human-readable type name for error messages. */
  private describeType(val: any): string {
    if (val instanceof Matrix) return 'matrix';
    if (typeof val === 'string') return 'character array';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'boolean') return 'logical';
    return typeof val;
  }

  private executeAssignment(node: AssignmentNode): any {
    const val = this.evaluate(node.value);

    if (node.target.type === 'Identifier') {
      this.workspace[node.target.name] = val;
      return val;
    }

    if (node.target.type === 'IndexExpr') {
      this.assignToIndex(node.target, val);
      return val;
    }

    if (node.target.type === 'FieldExpr') {
      this.assignToField(node.target, val);
      return val;
    }

    return val;
  }

  /**
   * Assign into a struct field: `s.x = 1`.
   *
   * Structs are plain JavaScript objects, so a field write is a property
   * write. MATLAB creates the struct when the field's owner does not exist
   * yet, and it errors when the owner exists but is not a struct.
   *
   * MATLAB also creates the intermediate structs in a nested assignment:
   * `t.inner.y = 2` makes `t.inner` a struct on the way.
   */
  private assignToField(target: FieldExprNode, val: any): void {
    const owner = this.resolveFieldOwner(target.target, true);
    owner[target.field] = val;
  }

  /**
   * Walk down a chain of field accesses to the object that owns the last
   * field, creating the intermediate structs when `create` is set.
   */
  private resolveFieldOwner(node: ASTNode, create: boolean): Record<string, any> {
    if (node.type === 'Identifier') {
      const name = node.name;
      let obj = this.workspace[name];
      if (obj === undefined || obj === null) {
        if (!create) {
          throw new Error(
            `Cannot read field from undefined variable '${name}'.`
          );
        }
        obj = {};
        this.workspace[name] = obj;
      }
      if (typeof obj !== 'object' || obj instanceof Matrix) {
        throw new Error(
          `Reference to non-structure field: ${name} is not a structure.`
        );
      }
      return obj;
    }

    if (node.type === 'FieldExpr') {
      const parent = this.resolveFieldOwner(node.target, create);
      let obj = parent[node.field];
      if (obj === undefined || obj === null) {
        if (!create) {
          throw new Error(`Unrecognized field name '${node.field}'.`);
        }
        obj = {};
        parent[node.field] = obj;
      }
      if (typeof obj !== 'object' || obj instanceof Matrix) {
        throw new Error(
          `Reference to non-structure field: ${node.field} is not a structure.`
        );
      }
      return obj;
    }

    throw new Error('Invalid assignment target');
  }

  /**
   * Handle `[p, q] = f(x)`.
   *
   * The call's outputs are bound to the target names in order. A single
   * target behaves like a normal assignment.
   */
  private executeMultiAssignment(node: MultiAssignmentNode): void {
    this.lastCallOutputs = undefined;
    const previousNargout = this.currentNargout;
    this.currentNargout = node.targets.length;
    let val: any;
    try {
      val = this.evaluate(node.value);
    } finally {
      this.currentNargout = previousNargout;
    }
    const outputs = this.lastCallOutputs ?? [val];

    node.targets.forEach((target, i) => {
      const v = i < outputs.length ? outputs[i] : Matrix.scalar(0);
      this.workspace[target.name] = v;
    });
  }

  /**
   * Assign into an indexed expression: `A(2) = v`, `A(1, 3) = v`,
   * `A(:, 2) = v`.
   *
   * MATLAB's linear indexing is column-major, so the single-index form maps
   * through the column-major ordering of the matrix.
   *
   * MATLAB also grows the target automatically: assigning past the end of
   * the array extends it with zeros, and assigning into a variable that
   * does not exist yet creates it with the required size. This is what
   * makes the idiomatic `y(1) = ...; y(2:N) = ...` pattern work.
   */
  private assignToIndex(target: IndexExprNode, val: any): void {
    const targetName = (target.target as any).name;
    if (!targetName) {
      throw new Error('Invalid assignment target');
    }
    let targetMatrix = this.workspace[targetName];
    if (!targetMatrix || !(targetMatrix instanceof Matrix)) {
      // A brand-new variable: start empty so the growth logic below sizes
      // it from the indices that are actually written.
      targetMatrix = Matrix.zeros(0, 0);
      this.workspace[targetName] = targetMatrix;
    }

    const indices = target.indices as (ASTNode | 'colon')[];

    if (indices.length === 1) {
      // Linear (column-major) index assignment.
      const idx = indices[0];
      if (idx === 'colon') {
        const src = val instanceof Matrix ? val.toColumnMajor() : [Number(val)];
        targetMatrix.setColumnMajor(src);
        this.workspace[targetName] = targetMatrix;
        return;
      }
      const idxVal = this.evaluateIndex(idx, targetMatrix.rows * targetMatrix.cols);
      if (idxVal instanceof Matrix) {
        const list = idxVal.toFlatArray();
        // An empty index list is a no-op in MATLAB: `A([]) = 0` leaves `A`
        // untouched instead of raising a size mismatch.
        if (list.length === 0) return;
        const src = this.assignmentValues(val, list.length, 1);
        // Grow the target so that the largest written index fits.
        const maxIndex = list.reduce((a, b) => (b > a ? b : a), 0);
        targetMatrix = this.growLinear(targetMatrix, maxIndex);
        list.forEach((linear, i) => {
          targetMatrix.setColumnMajorIndex(linear, src[i]);
        });
        this.workspace[targetName] = targetMatrix;
        return;
      }
      const linear = Number(idxVal);
      if (!Number.isFinite(linear)) {
        throw new Error('Index must be a finite number.');
      }
      if (linear < 1) {
        throw new Error(
          `Index in position 1 exceeds array bounds. Index must not exceed ${targetMatrix.rows * targetMatrix.cols}.`
        );
      }
      // MATLAB grows the array to fit the written index.
      targetMatrix = this.growLinear(targetMatrix, linear);
      const numVal = val instanceof Matrix ? val.getScalar() : Number(val);
      targetMatrix.setColumnMajorIndex(linear, numVal);
      this.workspace[targetName] = targetMatrix;
      return;
    }

    // 2D assignment: A(r, c) = v
    const rIdx = indices[0] === 'colon' ? 'colon' : this.toIndexList(indices[0], targetMatrix.rows);
    const cIdx = indices[1] === 'colon' ? 'colon' : this.toIndexList(indices[1], targetMatrix.cols);

    // An empty index list selects nothing, so the assignment is a no-op.
    if (rIdx !== 'colon' && rIdx.length === 0) return;
    if (cIdx !== 'colon' && cIdx.length === 0) return;

    const rows = rIdx === 'colon' ? targetMatrix.rows : rIdx.length;
    const cols = cIdx === 'colon' ? targetMatrix.cols : cIdx.length;

    const src = this.assignmentValues(val, rows, cols);
    const srcMatrix = Matrix.fromArray(columnMajorToRows(src, rows, cols));
    // Grow the target so that every written position is addressable.
    const maxR = rIdx === 'colon' ? targetMatrix.rows : rIdx.reduce((a, b) => (b > a ? b : a), 0);
    const maxC = cIdx === 'colon' ? targetMatrix.cols : cIdx.reduce((a, b) => (b > a ? b : a), 0);
    targetMatrix = this.grow2D(targetMatrix, maxR, maxC);

    for (let i = 0; i < rows; i++) {
      const r = rIdx === 'colon' ? i + 1 : rIdx[i];
      for (let j = 0; j < cols; j++) {
        const c = cIdx === 'colon' ? j + 1 : cIdx[j];
        targetMatrix.set(r, c, srcMatrix.data[i][j]);
      }
    }
    this.workspace[targetName] = targetMatrix;
  }

  /**
   * Collect the values an indexed assignment writes.
   *
   * MATLAB fills the selection in column-major order. The right-hand side
   * must have the same number of elements as the selection, except that a
   * scalar is broadcast across the whole selection.
   */
  private assignmentValues(val: any, rows: number, cols: number): number[] {
    if (val instanceof Matrix) {
      if (val.isScalar()) {
        return new Array(rows * cols).fill(val.getScalar());
      }
      const count = rows * cols;
      if (val.rows * val.cols !== count) {
        throw new Error(
          `Unable to perform assignment because the size of the left side is ${rows}-by-${cols} and the size of the right side is ${val.rows}-by-${val.cols}.`
        );
      }
      return val.toColumnMajor();
    }
    const num = Number(val);
    if (!Number.isFinite(num)) {
      throw new Error('Assigned value must be a finite number.');
    }
    return new Array(rows * cols).fill(num);
  }

  /**
   * Grow a matrix so that linear index `maxIndex` is addressable.
   *
   * MATLAB keeps the existing shape and pads with zeros: a row vector
   * grows along its row, a column vector along its column, and an array
   * that is neither (more than one row and more than one column) cannot
   * be grown along a linear index ("Attempt to grow array along
   * ambiguous dimension").
   */
  private growLinear(mat: Matrix, maxIndex: number): Matrix {
    const total = mat.rows * mat.cols;
    if (maxIndex <= total) return mat;

    if (total === 0) {
      // A new variable written with a linear index becomes a row vector
      // when the index is 1 and a column vector otherwise? MATLAB actually
      // makes `A(3) = 1` a 1x3 row vector, and `B(1) = 5` a 1x1.
      return mat.resized(1, Math.max(1, maxIndex));
    }

    if (mat.rows === 1) {
      // Row vector: grow along the row.
      return mat.resized(1, Math.max(mat.cols, maxIndex));
    }
    if (mat.cols === 1) {
      // Column vector: grow along the column.
      return mat.resized(Math.max(mat.rows, maxIndex), 1);
    }

    throw new Error('Attempt to grow array along ambiguous dimension.');
  }

  /** Grow a matrix so that row `r` and column `c` are addressable. */
  private grow2D(mat: Matrix, r: number, c: number): Matrix {
    if (r <= mat.rows && c <= mat.cols) return mat;
    if (mat.rows === 0 && mat.cols === 0) {
      return mat.resized(r, c);
    }
    return mat.resized(Math.max(mat.rows, r), Math.max(mat.cols, c));
  }

  private evaluateMatrixLiteral(node: MatrixLiteralNode): any {
    if (node.rows.length === 0) return Matrix.zeros(0, 0);

    // MATLAB's bracket syntax doubles as string concatenation when any
    // element is a character array: ['Value of ' name ' is ' num2str(n)].
    const hasString = node.rows.some(row => row.some(e => e.type === 'StringLiteral'));
    if (hasString) {
      const parts: string[] = [];
      for (const row of node.rows) {
        for (const elem of row) {
          const val = this.evaluate(elem);
          parts.push(
            typeof val === 'string'
              ? val
              : val instanceof Matrix
                ? formatScalar(val)
                : String(val)
          );
        }
      }
      return parts.join('');
    }

    // Evaluate every element as a matrix of its own.
    const blocks: Matrix[][] = [];
    for (const r of node.rows) {
      const row: Matrix[] = [];
      for (const elem of r) {
        const val = this.evaluate(elem);
        if (val instanceof Matrix) {
          row.push(val);
        } else if (typeof val === 'number') {
          row.push(Matrix.scalar(val));
        } else if (typeof val === 'string') {
          // A lone character in a numeric literal is an error in MATLAB, but
          // OpenMat keeps the row length consistent by treating it as NaN.
          row.push(Matrix.scalar(Number.NaN));
        }
      }
      blocks.push(row);
    }

    return this.concatRows(blocks);
  }

  /**
   * Build the matrix a bracketed literal denotes.
   *
   * MATLAB's brackets concatenate horizontally when the elements of a row
   * have the same number of rows, and vertically when the rows have the same
   * number of columns. `[V(2:end, 1); V(end) * exp(s)]` therefore stacks two
   * column vectors, and `[0; V(1:end - 1, 1)]` does the same.
   */
  private concatRows(blocks: Matrix[][]): Matrix {
    // Horizontal concatenation: every element of a row must have the same
    // number of rows. The first element fixes the height of the row.
    const rowWidths: number[] = [];
    for (const row of blocks) {
      let rowCount: number | null = null;
      for (const m of row) {
        if (rowCount === null) {
          rowCount = m.rows;
          continue;
        }
        if (m.rows !== rowCount) {
          throw new Error(
            `Horzcat requires the same number of rows: ${rowCount} and ${m.rows}.`
          );
        }
      }
      let cols = 0;
      for (const m of row) cols += m.cols;
      rowWidths.push(cols);
    }

    // Vertical concatenation: every row of the literal must have the same
    // number of columns.
    const colCount = rowWidths[0] ?? 0;
    for (const cols of rowWidths) {
      if (cols !== colCount) {
        throw new Error(
          `Vertcat requires the same number of columns: ${colCount} and ${cols}.`
        );
      }
    }

    // The height of the result is the sum of the heights of the row groups:
    // MATLAB stacks them vertically.
    let totalRows = 0;
    for (const row of blocks) {
      let height = 0;
      for (const m of row) {
        if (m.rows > height) height = m.rows;
      }
      totalRows += height;
    }

    const out: number[][] = [];
    for (let r = 0; r < totalRows; r++) out.push(new Array(colCount).fill(0));

    let baseRow = 0;
    for (const row of blocks) {
      let c = 0;
      let height = 0;
      for (const m of row) {
        for (let i = 0; i < m.rows; i++) {
          for (let j = 0; j < m.cols; j++) {
            out[baseRow + i][c + j] = m.data[i][j];
          }
        }
        c += m.cols;
        if (m.rows > height) height = m.rows;
      }
      baseRow += height;
    }
    return Matrix.fromArray(out);
  }

  private evaluateRange(node: RangeExprNode, dimSize?: number): Matrix {
    // Inside an index expression, `end` refers to the size of the indexed
    // dimension, so the range endpoints must be evaluated in index context.
    const startMat = dimSize === undefined
      ? this.evaluate(node.start)
      : this.evaluateIndex(node.start, dimSize);
    const start = startMat instanceof Matrix ? startMat.getScalar() : Number(startMat);

    const endMat = dimSize === undefined
      ? this.evaluate(node.end)
      : this.evaluateIndex(node.end, dimSize);
    const end = endMat instanceof Matrix ? endMat.getScalar() : Number(endMat);

    let step = 1;
    if (node.step) {
      const stepMat = dimSize === undefined
        ? this.evaluate(node.step)
        : this.evaluateIndex(node.step, dimSize);
      step = stepMat instanceof Matrix ? stepMat.getScalar() : Number(stepMat);
    }

    return Matrix.range(start, step, end);
  }

  private evaluateBinaryOp(node: BinaryOpNode): any {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);
    return this.applyBinaryOp(node.operator, left, right);
  }

  /**
   * Apply a binary operator to two already-evaluated operands.
   *
   * Split out from `evaluateBinaryOp` so that index expressions can resolve
   * the `end` keyword before the operator is applied.
   */
  private applyBinaryOp(operator: string, left: any, right: any): any {
    const lm = left instanceof Matrix ? left : Matrix.scalar(Number(left));
    const rm = right instanceof Matrix ? right : Matrix.scalar(Number(right));

    switch (operator) {
      case '+': return lm.add(rm);
      case '-': return lm.sub(rm);
      case '*': return lm.mul(rm);
      case '/': return lm.mldivide(rm);
      case '\\': return lm.ldivide(rm);
      case '.*': return lm.dotMul(rm);
      case './': return lm.dotDiv(rm);
      case '.\\': return this.dotLeftDiv(lm, rm);
      case '.^': return lm.dotPow(rm);
      case '^':
        if (rm.isScalar()) return lm.dotPow(rm.getScalar());
        throw new Error('Matrix power ^ requires scalar exponent');
      case '==': return lm.elementWise(rm, (a, b) => a === b ? 1 : 0);
      case '~=': return lm.elementWise(rm, (a, b) => a !== b ? 1 : 0);
      case '<': return lm.elementWise(rm, (a, b) => a < b ? 1 : 0);
      case '<=': return lm.elementWise(rm, (a, b) => a <= b ? 1 : 0);
      case '>': return lm.elementWise(rm, (a, b) => a > b ? 1 : 0);
      case '>=': return lm.elementWise(rm, (a, b) => a >= b ? 1 : 0);
      case '&':
        return lm.elementWise(rm, (a, b) => (a !== 0 && b !== 0) ? 1 : 0);
      case '|':
        return lm.elementWise(rm, (a, b) => (a !== 0 || b !== 0) ? 1 : 0);
      case '&&':
        // MATLAB's short-circuit operators only accept scalar operands.
        this.requireScalar(lm, '&&');
        this.requireScalar(rm, '&&');
        return Matrix.scalar(
          lm.getScalar() !== 0 && rm.getScalar() !== 0 ? 1 : 0
        );
      case '||':
        this.requireScalar(lm, '||');
        this.requireScalar(rm, '||');
        return Matrix.scalar(
          lm.getScalar() !== 0 || rm.getScalar() !== 0 ? 1 : 0
        );
      default:
        throw new Error(`Unsupported binary operator: ${operator}`);
    }
  }

  /**
   * Reject a non-scalar operand for MATLAB's short-circuit operators.
   */
  private requireScalar(m: Matrix, op: string): void {
    if (!m.isScalar()) {
      throw new Error(
        `Operands to the logical AND (&&) and OR (||) operators must be convertible to logical scalar values. Use the ANY or ALL functions to reduce operands to logical scalar values.`
      );
    }
  }

  /**
   * Element-wise left division `A .\ B` = A ./ B, applied element by element.
   * Implemented as the element-wise inverse of A times B, matching MATLAB.
   */
  private dotLeftDiv(a: Matrix, b: Matrix): Matrix {
    if (a.isScalar() && b.isScalar()) {
      const av = a.getScalar();
      if (av === 0) throw new Error('Matrix division by zero.');
      return Matrix.scalar(av / b.getScalar());
    }
    // Reuse the element-wise engine with swapped operands where possible:
    // a .\ b == b ./ a only for scalars, so compute 1./a then .* b.
    const inv = a.map(x => {
      if (x === 0) throw new Error('Matrix division by zero.');
      return 1 / x;
    });
    return inv.dotMul(b);
  }

  private evaluateUnaryOp(node: UnaryOpNode): any {
    const val = this.evaluate(node.operand);
    return this.applyUnaryOp(node.operator, val);
  }

  /**
   * Apply a unary operator to an already-evaluated operand.
   *
   * Split out from `evaluateUnaryOp` so that index expressions can resolve
   * the `end` keyword before the operator is applied.
   */
  private applyUnaryOp(operator: string, val: any): any {
    const m = val instanceof Matrix ? val : Matrix.scalar(Number(val));

    switch (operator) {
      case '-': return m.neg();
      case '+': return m;
      case '~': return m.map(x => (x === 0 ? 1 : 0));
      case '\'':
      case '.\'': return m.transpose();
      default:
        throw new Error(`Unsupported unary operator: ${operator}`);
    }
  }

  private evaluateCallOrIndex(node: FunctionCallNode | IndexExprNode): any {
    const calleeName = node.type === 'FunctionCall'
      ? node.callee
      : (node.target as any).name;

    // Check if callee is a matrix in workspace (indexing)
    if (calleeName in this.workspace && this.workspace[calleeName] instanceof Matrix) {
      const mat = this.workspace[calleeName] as Matrix;
      const rawArgs = node.type === 'FunctionCall' ? node.args : node.indices;
      return this.indexMatrix(mat, rawArgs);
    }

    // Function call
    const rawArgs = (node.type === 'FunctionCall' ? node.args : node.indices) as (ASTNode | 'colon')[];
    const args = rawArgs.map(a =>
      a === 'colon' ? 'colon' : this.evaluate(a)
    );
    return this.callFunction(calleeName, args);
  }

  private indexMatrix(mat: Matrix, indices: (ASTNode | 'colon')[]): Matrix {
    if (indices.length === 1) {
      // 1D linear indexing (MATLAB is column-major)
      const idxNode = indices[0];
      if (idxNode === 'colon') {
        return new Matrix(mat.rows * mat.cols, 1, mat.toColumnMajor());
      }
      const idxVal = this.evaluateIndex(idxNode, mat.rows * mat.cols);
      if (idxVal instanceof Matrix) {
        const res: number[] = [];
        for (const i of idxVal.toFlatArray()) {
          if (i < 1 || i > mat.rows * mat.cols) {
            throw new Error(`Index exceeds matrix dimensions: ${i}`);
          }
          res.push(mat.getColumnMajorIndex(i));
        }
        return new Matrix(1, res.length, [res]);
      }
      const num = Number(idxVal);
      if (num < 1 || num > mat.rows * mat.cols) {
        throw new Error(`Index exceeds matrix dimensions: ${num}`);
      }
      return Matrix.scalar(mat.getColumnMajorIndex(num));
    }

    // 2D indexing (r, c)
    const rIdx = indices[0] === 'colon'
      ? Array.from({ length: mat.rows }, (_, i) => i + 1)
      : this.toIndexList(indices[0], mat.rows);

    const cIdx = indices[1] === 'colon'
      ? Array.from({ length: mat.cols }, (_, i) => i + 1)
      : this.toIndexList(indices[1], mat.cols);

    const res: number[][] = [];
    for (const r of rIdx) {
      const row: number[] = [];
      for (const c of cIdx) {
        row.push(mat.get(r, c));
      }
      res.push(row);
    }
    return Matrix.fromArray(res);
  }

  /**
   * Evaluate an index expression, resolving the `end` keyword to the size of
   * the dimension being indexed.
   *
   * `end` may appear inside a compound expression (`A(end-1, 2)`), so the
   * node is walked recursively and every `end` leaf is replaced by the
   * dimension size.
   */
  private evaluateIndex(node: ASTNode, dimSize: number): any {
    if (node.type === 'Identifier' && node.name === 'end') {
      return Matrix.scalar(dimSize);
    }
    if (node.type === 'RangeExpr') {
      return this.evaluateRange(node, dimSize);
    }
    if (node.type === 'BinaryOp') {
      const left = this.evaluateIndex(node.left, dimSize);
      const right = this.evaluateIndex(node.right, dimSize);
      return this.applyBinaryOp(node.operator, left, right);
    }
    if (node.type === 'UnaryOp') {
      const operand = this.evaluateIndex(node.operand, dimSize);
      return this.applyUnaryOp(node.operator, operand);
    }
    return this.evaluate(node);
  }

  private toIndexList(node: ASTNode, dimSize: number): number[] {
    if (node.type === 'Identifier' && node.name === 'end') {
      return [dimSize];
    }
    const val = this.evaluateIndex(node, dimSize);
    if (val instanceof Matrix) return val.toFlatArray();
    return [Number(val)];
  }

  private toIndexNumber(node: ASTNode | 'colon', maxDim: number): number {
    if (node === 'colon') return maxDim;
    if (node.type === 'Identifier' && node.name === 'end') return maxDim;
    const val = this.evaluateIndex(node, maxDim);
    return val instanceof Matrix ? val.getScalar() : Number(val);
  }

  private callFunction(name: string, args: any[]): any {
    if (name in BUILTINS) {
      const ctx: BuiltinContext = {
        workspace: this.workspace,
        output: (text) => this.emit(text),
        addPlot: (plot) => this.emitPlot(plot),
        currentPlot: this.currentPlot,
        setCurrentPlot: (p) => { this.currentPlot = p; },
        holdOn: this.holdOn,
        setHoldOn: (h) => { this.holdOn = h; },
        timerStart: this.timerStart,
        setTimerStart: (t) => { this.timerStart = t; },
        nargout: this.currentNargout,
        nargin: this.currentNargin,
        functionNargout: this.currentFunctionNargout,
        rng: this.rng
      };
      const result = BUILTINS[name](args, ctx);
      // A builtin may return several values (e.g. `[r, c] = find(A)`).
      // Expose them so that a multi-output assignment can bind them.
      if (Array.isArray(result)) {
        this.lastCallOutputs = result;
        return result[0];
      }
      return result;
    }

    if (name in this.functions) {
      const fn = this.functions[name];
      const localScope: Record<string, any> = { ...this.workspace };
      fn.inputs.forEach((param, i) => {
        localScope[param] = args[i] ?? Matrix.scalar(0);
      });
      const subInterpreter = new Interpreter(localScope);
      subInterpreter.functions = this.functions;
      // Share the parent's output sink and plot list so that `disp` and `plot`
      // called inside a function reach the Command Window and Figure window.
      subInterpreter.outputSink = this.outputSink ?? this.outputs;
      subInterpreter.plotSink = this.plotSink ?? this.plots;
      subInterpreter.parent = this;
      // Share the current figure so `title`/`xlabel` inside a function apply
      // to the figure the function plots into.
      subInterpreter.currentPlot = this.currentPlot;
      subInterpreter.holdOn = this.holdOn;
      subInterpreter.timerStart = this.timerStart;
      // `nargin`/`nargout` inside the body must report the *called*
      // function's counts, not the caller's.
      subInterpreter.currentNargin = args.length;
      subInterpreter.currentFunctionNargout = fn.outputs.length;

      try {
        for (const s of fn.body) subInterpreter.executeStatement(s);
      } catch (sig) {
        if (sig instanceof ControlSignal && sig.kind === 'return') {
          // Normal early return.
        } else {
          throw sig;
        }
      }

      // Collect every declared output, in declaration order.
      const outputs = fn.outputs.length > 0 ? fn.outputs : ['ans'];
      const values = outputs.map(
        (outputName) => subInterpreter.workspace[outputName] ?? Matrix.scalar(0)
      );
      // Expose the remaining outputs to the caller for multi-output
      // assignments such as `[p, q] = f(x)`.
      this.lastCallOutputs = values;
      return values[0];
    }

    throw new UndefinedNameError(name);
  }

  private executeIf(stmt: IfStatementNode): void {
    const testVal = this.evaluate(stmt.test);
    if (this.isTruthy(testVal)) {
      for (const s of stmt.consequent) this.executeStatement(s);
      return;
    }
    for (const elif of stmt.elseifs) {
      const elifVal = this.evaluate(elif.test);
      if (this.isTruthy(elifVal)) {
        for (const s of elif.consequent) this.executeStatement(s);
        return;
      }
    }
    if (stmt.alternate) {
      for (const s of stmt.alternate) this.executeStatement(s);
    }
  }

  private executeFor(stmt: ForStatementNode): void {
    const rangeVal = this.evaluate(stmt.range);

    // MATLAB iterates a row vector element by element, but a matrix column by
    // column (each iteration value is a column vector).
    let values: any[];
    if (rangeVal instanceof Matrix) {
      if (rangeVal.rows === 1) {
        values = rangeVal.toFlatArray().map((v) => Matrix.scalar(v));
      } else if (rangeVal.cols === 1) {
        values = rangeVal.toFlatArray().map((v) => Matrix.scalar(v));
      } else {
        values = [];
        for (let c = 0; c < rangeVal.cols; c++) {
          const col: number[][] = [];
          for (let r = 0; r < rangeVal.rows; r++) col.push([rangeVal.data[r][c]]);
          values.push(new Matrix(rangeVal.rows, 1, col));
        }
      }
    } else {
      values = [Matrix.scalar(Number(rangeVal))];
    }

    for (const v of values) {
      this.workspace[stmt.variable] = v;
      try {
        for (const s of stmt.body) this.executeStatement(s);
      } catch (sig) {
        if (sig instanceof ControlSignal) {
          if (sig.kind === 'break') break;
          if (sig.kind === 'continue') continue;
          throw sig;
        }
        throw sig;
      }
    }
  }

  private executeWhile(stmt: WhileStatementNode): void {
    let iterations = 0;
    while (this.isTruthy(this.evaluate(stmt.test))) {
      if (iterations++ > 100000) {
        throw new Error('Maximum iteration limit exceeded in while loop');
      }
      try {
        for (const s of stmt.body) this.executeStatement(s);
      } catch (sig) {
        if (sig instanceof ControlSignal) {
          if (sig.kind === 'break') break;
          if (sig.kind === 'continue') continue;
          throw sig;
        }
        throw sig;
      }
    }
  }

  /**
   * Execute a `switch` statement. The first matching `case` wins; if no case
   * matches, the `otherwise` branch runs.
   */
  private executeSwitch(stmt: SwitchStatementNode): void {
    const value = this.evaluate(stmt.discriminant);
    const matches = (label: ASTNode): boolean => {
      const lv = this.evaluate(label);
      if (value instanceof Matrix && lv instanceof Matrix) {
        if (value.isScalar() && lv.isScalar()) {
          return value.getScalar() === lv.getScalar();
        }
        return JSON.stringify(value.toFlatArray()) === JSON.stringify(lv.toFlatArray());
      }
      return String(value) === String(lv);
    };

    for (const c of stmt.cases) {
      if (c.labels.length === 0) continue; // `otherwise` is the fallback
      if (c.labels.some(matches)) {
        this.runBlock(c.body);
        return;
      }
    }

    const otherwise = stmt.cases.find((c) => c.labels.length === 0);
    if (otherwise) this.runBlock(otherwise.body);
  }

  /**
   * Execute a `try` statement, routing any raised error to the `catch` body.
   */
  private executeTry(stmt: TryStatementNode): void {
    try {
      this.runBlock(stmt.body);
    } catch (err) {
      if (err instanceof ControlSignal) throw err;
      // MATLAB binds the error object to the `catch` variable when one is
      // named, e.g. `catch err` then `err.message`. The binding survives
      // the catch block, so it is left in the workspace.
      if (stmt.catchVar) {
        this.workspace[stmt.catchVar] = toMException(err);
      }
      this.runBlock(stmt.catchBody);
    }
  }

  /**
   * Run a statement block, letting `break`/`continue`/`return` signals through
   * to the enclosing loop or function.
   */
  private runBlock(stmts: StatementNode[]): void {
    for (const s of stmts) this.executeStatement(s);
  }

  private executeCommand(cmd: CommandNode): void {
    this.callFunction(cmd.name, cmd.args);
  }

  private isTruthy(val: any): boolean {
    if (val instanceof Matrix) {
      return val.toFlatArray().every(x => x !== 0);
    }
    return Boolean(val);
  }

  private formatValue(val: any): string {
    if (val instanceof Matrix) return val.format();
    if (typeof val === 'string') return `    '${val}'`;
    if (typeof val === 'boolean') return Matrix.scalar(val ? 1 : 0).format();
    return `    ${val}`;
  }
}

/**
 * Convert a thrown value into the `MException` shape MATLAB binds to a
 * `catch` variable.
 */
function toMException(err: any): MException {
  if (err instanceof MException) return err;
  if (err instanceof UndefinedNameError) {
    return new MException(err.message, 'MATLAB:UndefinedFunction');
  }
  if (err instanceof Error) {
    return new MException(err.message, 'OpenMat:execution:error');
  }
  return new MException(String(err), 'OpenMat:execution:error');
}

/**
 * Render a matrix as a single scalar string, the way MATLAB's `num2str`
 * does for a 1x1 numeric.
 */
function formatScalar(m: Matrix): string {
  if (!m.isScalar()) return m.format();
  const v = m.getScalar();
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

/**
 * Lay a column-major flat array out as a `rows` x `cols` row-major array.
 */
function columnMajorToRows(values: number[], rows: number, cols: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) out.push(new Array(cols).fill(0));
  let i = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out[r][c] = i < values.length ? values[i++] : 0;
    }
  }
  return out;
}
