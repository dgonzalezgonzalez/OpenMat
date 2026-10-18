import { Lexer } from './lexer';
import { Parser } from './parser';
import { Matrix } from './matrix';
import { BUILTINS, BuiltinContext } from './builtins';
import {
  ASTNode,
  ProgramNode,
  StatementNode,
  AssignmentNode,
  BinaryOpNode,
  UnaryOpNode,
  MatrixLiteralNode,
  RangeExprNode,
  IndexExprNode,
  FunctionCallNode,
  IfStatementNode,
  ForStatementNode,
  WhileStatementNode,
  FunctionDefNode,
  CommandNode,
  ExecutionResult,
  PlotData
} from './types';

export class Interpreter {
  private workspace: Record<string, any> = {};
  private functions: Record<string, FunctionDefNode> = {};
  private outputs: { text: string; isError?: boolean }[] = [];
  private plots: PlotData[] = [];
  private currentPlot?: PlotData;
  private holdOn: boolean = false;
  private timerStart?: number;

  constructor(initialWorkspace?: Record<string, any>) {
    if (initialWorkspace) {
      this.workspace = { ...initialWorkspace };
    }
  }

  getWorkspace(): Record<string, any> {
    return { ...this.workspace };
  }

  setVariable(name: string, value: any): void {
    this.workspace[name] = value;
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
      this.outputs.push({
        text: `Error: ${err.message || String(err)}`,
        isError: true
      });
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
        this.outputs.push({ text: `${targetName} =\n${this.formatValue(res)}` });
      }
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

    if (expr.type === 'Command') {
      this.executeCommand(expr);
      return;
    }

    const val = this.evaluate(expr);
    if (val !== null && val !== undefined) {
      this.workspace['ans'] = val;
      if (!stmt.suppressOutput) {
        this.outputs.push({ text: `ans =\n${this.formatValue(val)}` });
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
        if (node.name === 'eps') return Matrix.scalar(2.2204e-16);
        if (node.name === 'Inf') return Matrix.scalar(Infinity);
        if (node.name === 'NaN') return Matrix.scalar(NaN);
        if (node.name in this.workspace) {
          return this.workspace[node.name];
        }
        if (node.name in BUILTINS || node.name in this.functions) {
          return this.callFunction(node.name, []);
        }
        throw new Error(`Undefined function or variable '${node.name}'`);

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

      default:
        throw new Error(`Unsupported expression type: ${(node as any).type}`);
    }
  }

  private executeAssignment(node: AssignmentNode): any {
    const val = this.evaluate(node.value);

    if (node.target.type === 'Identifier') {
      this.workspace[node.target.name] = val;
      return val;
    }

    if (node.target.type === 'IndexExpr') {
      const targetName = (node.target.target as any).name;
      let targetMatrix = this.workspace[targetName];
      if (!targetMatrix || !(targetMatrix instanceof Matrix)) {
        targetMatrix = Matrix.zeros(1, 1);
        this.workspace[targetName] = targetMatrix;
      }
      const r = this.toIndexNumber(node.target.indices[0], targetMatrix.rows);
      const c = node.target.indices.length > 1
        ? this.toIndexNumber(node.target.indices[1], targetMatrix.cols)
        : 1;
      const numVal = val instanceof Matrix ? val.getScalar() : Number(val);
      targetMatrix.set(r, c, numVal);
      return targetMatrix;
    }

    return val;
  }

  private evaluateMatrixLiteral(node: MatrixLiteralNode): Matrix {
    if (node.rows.length === 0) return Matrix.zeros(0, 0);

    const evaluatedRows: number[][] = [];
    for (const r of node.rows) {
      let rowValues: number[] = [];
      for (const elem of r) {
        const val = this.evaluate(elem);
        if (val instanceof Matrix) {
          rowValues = rowValues.concat(val.toFlatArray());
        } else if (typeof val === 'number') {
          rowValues.push(val);
        }
      }
      evaluatedRows.push(rowValues);
    }

    return Matrix.fromArray(evaluatedRows);
  }

  private evaluateRange(node: RangeExprNode): Matrix {
    const startMat = this.evaluate(node.start);
    const start = startMat instanceof Matrix ? startMat.getScalar() : Number(startMat);

    const endMat = this.evaluate(node.end);
    const end = endMat instanceof Matrix ? endMat.getScalar() : Number(endMat);

    let step = 1;
    if (node.step) {
      const stepMat = this.evaluate(node.step);
      step = stepMat instanceof Matrix ? stepMat.getScalar() : Number(stepMat);
    }

    return Matrix.range(start, step, end);
  }

  private evaluateBinaryOp(node: BinaryOpNode): any {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    const lm = left instanceof Matrix ? left : Matrix.scalar(Number(left));
    const rm = right instanceof Matrix ? right : Matrix.scalar(Number(right));

    switch (node.operator) {
      case '+': return lm.add(rm);
      case '-': return lm.sub(rm);
      case '*': return lm.mul(rm);
      case '.*': return lm.dotMul(rm);
      case './': return lm.dotDiv(rm);
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
      case '&&': return lm.elementWise(rm, (a, b) => (a && b) ? 1 : 0);
      case '|':
      case '||': return lm.elementWise(rm, (a, b) => (a || b) ? 1 : 0);
      default:
        throw new Error(`Unsupported binary operator: ${node.operator}`);
    }
  }

  private evaluateUnaryOp(node: UnaryOpNode): any {
    const val = this.evaluate(node.operand);
    const m = val instanceof Matrix ? val : Matrix.scalar(Number(val));

    switch (node.operator) {
      case '-': return m.neg();
      case '+': return m;
      case '~': return m.map(x => (x === 0 ? 1 : 0));
      case '\'':
      case '.\'': return m.transpose();
      default:
        throw new Error(`Unsupported unary operator: ${node.operator}`);
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
      // 1D linear indexing
      const idxNode = indices[0];
      if (idxNode === 'colon') return new Matrix(mat.rows * mat.cols, 1, mat.toFlatArray());
      const idxVal = this.evaluate(idxNode);
      if (idxVal instanceof Matrix) {
        const flat = mat.toFlatArray();
        const res: number[] = [];
        for (const i of idxVal.toFlatArray()) {
          if (i < 1 || i > flat.length) throw new Error(`Index exceeds matrix dimensions: ${i}`);
          res.push(flat[i - 1]);
        }
        return new Matrix(1, res.length, [res]);
      }
      const num = Number(idxVal);
      const flat = mat.toFlatArray();
      if (num < 1 || num > flat.length) throw new Error(`Index exceeds matrix dimensions: ${num}`);
      return Matrix.scalar(flat[num - 1]);
    }

    // 2D indexing (r, c)
    const rIdx = indices[0] === 'colon'
      ? Array.from({ length: mat.rows }, (_, i) => i + 1)
      : this.toIndexList(indices[0]);

    const cIdx = indices[1] === 'colon'
      ? Array.from({ length: mat.cols }, (_, i) => i + 1)
      : this.toIndexList(indices[1]);

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

  private toIndexList(node: ASTNode): number[] {
    const val = this.evaluate(node);
    if (val instanceof Matrix) return val.toFlatArray();
    return [Number(val)];
  }

  private toIndexNumber(node: ASTNode | 'colon', maxDim: number): number {
    if (node === 'colon') return maxDim;
    const val = this.evaluate(node);
    return val instanceof Matrix ? val.getScalar() : Number(val);
  }

  private callFunction(name: string, args: any[]): any {
    if (name in BUILTINS) {
      const ctx: BuiltinContext = {
        workspace: this.workspace,
        output: (text) => this.outputs.push({ text }),
        addPlot: (plot) => this.plots.push(plot),
        currentPlot: this.currentPlot,
        setCurrentPlot: (p) => { this.currentPlot = p; },
        holdOn: this.holdOn,
        setHoldOn: (h) => { this.holdOn = h; },
        timerStart: this.timerStart,
        setTimerStart: (t) => { this.timerStart = t; }
      };
      return BUILTINS[name](args, ctx);
    }

    if (name in this.functions) {
      const fn = this.functions[name];
      const localScope: Record<string, any> = { ...this.workspace };
      fn.inputs.forEach((param, i) => {
        localScope[param] = args[i] ?? Matrix.scalar(0);
      });
      const subInterpreter = new Interpreter(localScope);
      subInterpreter.functions = this.functions;
      for (const s of fn.body) {
        subInterpreter.executeStatement(s);
      }
      const outputName = fn.outputs[0] || 'ans';
      return subInterpreter.workspace[outputName] || Matrix.scalar(0);
    }

    throw new Error(`Undefined function or variable '${name}'`);
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
    const values = rangeVal instanceof Matrix ? rangeVal.toFlatArray() : [Number(rangeVal)];
    for (const v of values) {
      this.workspace[stmt.variable] = Matrix.scalar(v);
      for (const s of stmt.body) this.executeStatement(s);
    }
  }

  private executeWhile(stmt: WhileStatementNode): void {
    let iterations = 0;
    while (this.isTruthy(this.evaluate(stmt.test))) {
      if (iterations++ > 100000) {
        throw new Error('Maximum iteration limit exceeded in while loop');
      }
      for (const s of stmt.body) this.executeStatement(s);
    }
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
    return `    ${val}`;
  }
}
