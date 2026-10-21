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
