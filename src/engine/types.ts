export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'KEYWORD'
  | 'OPERATOR'
  | 'DELIMITER'
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

export type ASTNode =
  | ProgramNode
  | StatementNode
  | AssignmentNode
  | MultiAssignmentNode
  | BinaryOpNode
  | UnaryOpNode
  | NumberLiteralNode
  | StringLiteralNode
  | IdentifierNode
  | MatrixLiteralNode
  | RangeExprNode
  | IndexExprNode
  | FieldExprNode
  | FunctionCallNode
  | IfStatementNode
  | ForStatementNode
  | WhileStatementNode
  | FunctionDefNode
  | SwitchStatementNode
  | TryStatementNode
  | BreakStatementNode
  | ContinueStatementNode
  | ReturnStatementNode
  | AnonymousFunctionNode
  | CommandNode;

export interface ProgramNode {
  type: 'Program';
  body: StatementNode[];
}

export interface StatementNode {
  type: 'Statement';
  expression: ASTNode;
  suppressOutput: boolean;
  line: number;
}

export interface AssignmentNode {
  type: 'Assignment';
  target: IdentifierNode | IndexExprNode | FieldExprNode | MatrixLiteralNode;
  value: ASTNode;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  operator: string;
  operand: ASTNode;
  isPostfix?: boolean;
}

export interface NumberLiteralNode {
  type: 'NumberLiteral';
  value: number;
}

export interface StringLiteralNode {
  type: 'StringLiteral';
  value: string;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

export interface MatrixLiteralNode {
  type: 'MatrixLiteral';
  rows: ASTNode[][];
}

export interface RangeExprNode {
  type: 'RangeExpr';
  start: ASTNode;
  step?: ASTNode;
  end: ASTNode;
}

export interface IndexExprNode {
  type: 'IndexExpr';
  target: ASTNode;
  indices: (ASTNode | 'colon')[];
}

/**
 * Struct field access: `s.field`, or `err.message` on a caught error.
 *
 * MATLAB's most common use is reading a caught error's message, so the
 * engine models structs as plain objects and resolves the field at runtime.
 */
export interface FieldExprNode {
  type: 'FieldExpr';
  target: ASTNode;
  field: string;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  callee: string;
  args: ASTNode[];
}

/**
 * Multiple assignment: `[p, q] = f(x)`.
 *
 * MATLAB returns several values from one function call and binds them to
 * several names. The targets are plain identifiers; the value is the call
 * expression whose outputs are distributed across them.
 */
export interface MultiAssignmentNode {
  type: 'MultiAssignment';
  targets: IdentifierNode[];
  value: ASTNode;
}

export interface IfStatementNode {
  type: 'IfStatement';
  test: ASTNode;
  consequent: StatementNode[];
  elseifs: { test: ASTNode; consequent: StatementNode[] }[];
  alternate?: StatementNode[];
}

export interface ForStatementNode {
  type: 'ForStatement';
  variable: string;
  range: ASTNode;
  body: StatementNode[];
}

export interface WhileStatementNode {
  type: 'WhileStatement';
  test: ASTNode;
  body: StatementNode[];
}

export interface FunctionDefNode {
  type: 'FunctionDef';
  name: string;
  inputs: string[];
  outputs: string[];
  body: StatementNode[];
}

export interface SwitchCaseNode {
  /** `case` labels; an empty list means the `otherwise` branch. */
  labels: ASTNode[];
  body: StatementNode[];
}

export interface SwitchStatementNode {
  type: 'SwitchStatement';
  discriminant: ASTNode;
  cases: SwitchCaseNode[];
}

export interface TryStatementNode {
  type: 'TryStatement';
  body: StatementNode[];
  catchBody: StatementNode[];
  /** Variable that receives the error object, e.g. `catch err`. */
  catchVar?: string;
}

export interface BreakStatementNode {
  type: 'BreakStatement';
}

export interface ContinueStatementNode {
  type: 'ContinueStatement';
}

export interface ReturnStatementNode {
  type: 'ReturnStatement';
}

export interface CommandNode {
  type: 'Command';
  name: string;
  args: string[];
}

/**
 * An anonymous function: `@(x) x + 1`, or a named handle such as `@sin`.
 *
 * The body is a single expression, exactly as in MATLAB — an anonymous
 * function cannot contain a statement list. A named handle has no body of
 * its own; it refers to a builtin or a user function by name.
 */
export interface AnonymousFunctionNode {
  type: 'AnonymousFunction';
  params: string[];
  body: ASTNode;
  /** The function a named handle such as `@sin` refers to. */
  namedTarget?: string;
}

/**
 * A function handle — the runtime value of `@(x) x + 1` or `@sin`.
 *
 * MATLAB captures the *workspace* when the handle is created, so the closure
 * is a snapshot of the variables that were in scope at that moment. A named
 * handle has no body of its own: it refers to a builtin or a user function.
 */
export interface FunctionHandle {
  kind: 'function_handle';
  params: string[];
  body: ASTNode;
  namedTarget?: string;
  /** The workspace captured when the handle was created. */
  closure: Record<string, any>;
  /** How MATLAB displays the handle, e.g. `@(x)x+1`. */
  text: string;
}

/** Type guard for a function handle value. */
export function isFunctionHandle(v: any): v is FunctionHandle {
  return !!v && typeof v === 'object' && v.kind === 'function_handle';
}

/**
 * Build a handle to a named function, the way `str2func('sin')` does.
 *
 * The handle has no body of its own: calling it dispatches to the named
 * builtin or user function.
 */
export function makeNamedFunctionHandle(name: string): FunctionHandle {
  return {
    kind: 'function_handle',
    params: [],
    body: { type: 'Identifier', name },
    namedTarget: name,
    closure: {},
    text: `@${name}`
  };
}

export type Value = number | string | boolean | any; // Matrix or primitive

export interface WorkspaceVariable {
  name: string;
  value: any;
  size: string;
  bytes: number;
  class: string;
  min?: string | number;
  max?: string | number;
}

export interface PlotData {
  id: string;
  type: 'line' | 'scatter' | 'bar' | 'histogram';
  title?: string;
  xlabel?: string;
  ylabel?: string;
  grid?: boolean;
  legend?: string[];
  series: {
    label: string;
    x: number[];
    y: number[];
    color?: string;
  }[];
}

export interface ExecutionOutput {
  text: string;
  isError?: boolean;
}

export interface ExecutionResult {
  outputs: ExecutionOutput[];
  workspace: Record<string, any>;
  plots: PlotData[];
}
