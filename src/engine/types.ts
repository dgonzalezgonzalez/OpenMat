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
  | BinaryOpNode
  | UnaryOpNode
  | NumberLiteralNode
  | StringLiteralNode
  | IdentifierNode
  | MatrixLiteralNode
  | RangeExprNode
  | IndexExprNode
  | FunctionCallNode
  | IfStatementNode
  | ForStatementNode
  | WhileStatementNode
  | FunctionDefNode
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
  target: IdentifierNode | IndexExprNode | MatrixLiteralNode;
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

export interface FunctionCallNode {
  type: 'FunctionCall';
  callee: string;
  args: ASTNode[];
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
