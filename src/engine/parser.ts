import {
  Token,
  ASTNode,
  ProgramNode,
  StatementNode,
  AssignmentNode,
  MultiAssignmentNode,
  IdentifierNode,
  IfStatementNode,
  ForStatementNode,
  WhileStatementNode,
  FunctionDefNode,
  SwitchStatementNode,
  SwitchCaseNode,
  TryStatementNode,
  BreakStatementNode,
  ContinueStatementNode,
  ReturnStatementNode,
  CommandNode
} from './types';

export class Parser {
  private readonly tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ProgramNode {
    const body: StatementNode[] = [];
    this.skipSeparators();

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
      this.skipSeparators();
    }

    return { type: 'Program', body };
  }

  private parseStatement(): StatementNode | null {
    this.skipSeparators();
    if (this.isAtEnd()) return null;

    const startLine = this.peek().line;

    // Check for control flow keywords
    if (this.matchKeyword('if')) return this.parseIfStatement(startLine);
    if (this.matchKeyword('for')) return this.parseForStatement(startLine);
    if (this.matchKeyword('while')) return this.parseWhileStatement(startLine);
    if (this.matchKeyword('function')) return this.parseFunctionDef(startLine);
    if (this.matchKeyword('switch')) return this.parseSwitchStatement(startLine);
    if (this.matchKeyword('try')) return this.parseTryStatement(startLine);
    if (this.matchKeyword('break')) return this.parseBreakStatement(startLine);
    if (this.matchKeyword('continue')) return this.parseContinueStatement(startLine);
    if (this.matchKeyword('return')) return this.parseReturnStatement(startLine);

    // Check for command syntax (e.g. `clear x y`, `clc`, `help plot`)
    if (this.isCommandSyntax()) {
      const cmd = this.parseCommand();
      const suppress = this.consumeStatementTerminator();
      return { type: 'Statement', expression: cmd, suppressOutput: suppress, line: startLine };
    }

    // Normal expression or assignment
    const expr = this.parseAssignmentOrExpression();
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: expr,
      suppressOutput: suppress,
      line: startLine
    };
  }

  private isCommandSyntax(): boolean {
    const t = this.peek();
    if (t.type !== 'IDENTIFIER') return false;
    const knownCommands = ['clear', 'clc', 'close', 'help', 'who', 'whos', 'pwd', 'ls', 'cd', 'hold', 'grid'];
    if (!knownCommands.includes(t.value)) return false;

    const next = this.peek(1);
    if (next.type === 'DELIMITER' && next.value === '(') return false;
    if (next.type === 'OPERATOR' && next.value === '=') return false;
    return true;
  }

  private parseCommand(): CommandNode {
    const name = this.advance().value;
    const args: string[] = [];

    while (!this.isAtEnd() && !this.isStatementTerminator()) {
      args.push(this.advance().value);
    }
    return { type: 'Command', name, args };
  }

  private parseAssignmentOrExpression(): ASTNode {
    // Multiple assignment: `[p, q] = f(x)`.
    // The bracket list is only a multi-assignment when it is immediately
    // followed by `=` and every element is a plain identifier.
    if (this.checkDelimiter('[')) {
      const snapshot = this.mark();
      const targets = this.tryParseIdentifierList();
      if (targets && this.matchOperator('=')) {
        const value = this.parseExpression();
        return {
          type: 'MultiAssignment',
          targets,
          value
        } as MultiAssignmentNode;
      }
      this.restore(snapshot);
    }

    const left = this.parseExpression();

    if (this.matchOperator('=')) {
      const right = this.parseExpression();
      if (
        left.type === 'Identifier' ||
        left.type === 'IndexExpr' ||
        left.type === 'FieldExpr' ||
        left.type === 'MatrixLiteral'
      ) {
        return {
          type: 'Assignment',
          target: left as any,
          value: right
        } as AssignmentNode;
      }
      throw new Error(`Invalid assignment target on line ${this.peek().line}`);
    }

    return left;
  }

  /**
   * Try to parse `[a, b, c]` as a list of identifiers.
   * Returns null (and leaves the token position untouched) when the bracket
   * holds anything other than plain names, e.g. a matrix literal.
   */
  private tryParseIdentifierList(): IdentifierNode[] | null {
    const snapshot = this.mark();
    if (!this.matchDelimiter('[')) return null;
    const names: IdentifierNode[] = [];
    if (!this.checkDelimiter(']')) {
      do {
        if (!this.checkTokenType('IDENTIFIER')) {
          this.restore(snapshot);
          return null;
        }
        this.advance();
        names.push({ type: 'Identifier', name: this.previous().value });
      } while (this.matchDelimiter(','));
    }
    if (!this.matchDelimiter(']')) {
      this.restore(snapshot);
      return null;
    }
    return names;
  }

  // Precedence levels:
  // 1. Logical OR (||, |)
  // 2. Logical AND (&&, &)
  // 3. Equality (==, ~=)
  // 4. Relational (<, <=, >, >=)
  // 5. Colon Range (:)
  // 6. Additive (+, -)
  // 7. Multiplicative (*, /, \, .*, ./, .\)
  // 8. Prefix (+, -, ~)
  // 9. Power (^, .^)
  // 10. Postfix (', .')
  // 11. Primary (number, string, identifier, matrix, parens)

  private parseExpression(): ASTNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ASTNode {
    let expr = this.parseLogicalAnd();
    while (this.matchOperator('||') || this.matchOperator('|')) {
      const op = this.previous().value;
      const right = this.parseLogicalAnd();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseLogicalAnd(): ASTNode {
    let expr = this.parseEquality();
    while (this.matchOperator('&&') || this.matchOperator('&')) {
      const op = this.previous().value;
      const right = this.parseEquality();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseEquality(): ASTNode {
    let expr = this.parseRelational();
    while (this.matchOperator('==') || this.matchOperator('~=')) {
      const op = this.previous().value;
      const right = this.parseRelational();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseRelational(): ASTNode {
    let expr = this.parseRange();
    while (
      this.matchOperator('<') ||
      this.matchOperator('<=') ||
      this.matchOperator('>') ||
      this.matchOperator('>=')
    ) {
      const op = this.previous().value;
      const right = this.parseRange();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  // Colon operator: start:end or start:step:end
  private parseRange(): ASTNode {
    const expr = this.parseAdditive();

    if (this.matchOperator(':')) {
      const second = this.parseAdditive();
      if (this.matchOperator(':')) {
        const third = this.parseAdditive();
        return { type: 'RangeExpr', start: expr, step: second, end: third };
      }
      return { type: 'RangeExpr', start: expr, end: second };
    }

    return expr;
  }

  private parseAdditive(): ASTNode {
    let expr = this.parseMultiplicative();
    while (this.matchOperator('+') || this.matchOperator('-')) {
      const op = this.previous().value;
      const right = this.parseMultiplicative();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseMultiplicative(): ASTNode {
    let expr = this.parseUnary();
    while (
      this.matchOperator('*') ||
      this.matchOperator('/') ||
      this.matchOperator('\\') ||
      this.matchOperator('.*') ||
      this.matchOperator('./') ||
      this.matchOperator('.\\')
    ) {
      const op = this.previous().value;
      const right = this.parseUnary();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseUnary(): ASTNode {
    if (this.matchOperator('+') || this.matchOperator('-') || this.matchOperator('~')) {
      const op = this.previous().value;
      const operand = this.parseUnary();
      return { type: 'UnaryOp', operator: op, operand };
    }
    return this.parsePower();
  }

  private parsePower(): ASTNode {
    let expr = this.parsePostfix();
    while (this.matchOperator('^') || this.matchOperator('.^')) {
      const op = this.previous().value;
      const right = this.parseUnary(); // Right-associative
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parsePostfix(): ASTNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.matchOperator('\'') || this.matchOperator('.\'')) {
        const op = this.previous().value;
        expr = { type: 'UnaryOp', operator: op, operand: expr, isPostfix: true };
      } else if (this.matchOperator('.')) {
        // Struct field access: `s.field`. The field name is a bare
        // identifier; MATLAB does not allow arbitrary expressions here.
        const name = this.consumeTokenType(
          'IDENTIFIER',
          "Expected a field name after '.'"
        );
        expr = { type: 'FieldExpr', target: expr, field: name.value };
      } else if (this.matchDelimiter('(')) {
        // Function call or indexing
        const args: (ASTNode | 'colon')[] = [];
        if (!this.checkDelimiter(')')) {
          do {
            if (this.matchOperator(':')) {
              args.push('colon');
            } else {
              args.push(this.parseExpression());
            }
          } while (this.matchDelimiter(','));
        }
        this.consumeDelimiter(')', "Expected ')' after argument/index list");

        // `name(...)` is ambiguous until evaluation time: it is a function
        // call when `name` resolves to a function and an index expression
        // when it resolves to a matrix. Emitting an IndexExpr keeps
        // `A(1, 2) = 99` assignable; the interpreter resolves the ambiguity.
        if (expr.type === 'Identifier') {
          expr = {
            type: 'IndexExpr',
            target: expr,
            indices: args
          };
        } else {
          expr = {
            type: 'IndexExpr',
            target: expr,
            indices: args
          };
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): ASTNode {
    if (this.matchTokenType('NUMBER')) {
      return { type: 'NumberLiteral', value: parseFloat(this.previous().value) };
    }

    if (this.matchTokenType('STRING')) {
      return { type: 'StringLiteral', value: this.previous().value };
    }

    if (this.matchTokenType('IDENTIFIER')) {
      return { type: 'Identifier', name: this.previous().value };
    }

    // `end` is a valid expression inside an index expression: it denotes the
    // last index along the indexed dimension (e.g. A(end, 1)).
    if (this.checkKeyword('end') && this.isEndInExpressionPosition()) {
      this.advance();
      return { type: 'Identifier', name: 'end' };
    }

    if (this.matchDelimiter('(')) {
      const expr = this.parseExpression();
      this.consumeDelimiter(')', "Expected ')' after expression");
      return expr;
    }

    if (this.matchDelimiter('[')) {
      return this.parseMatrixLiteral();
    }

    throw new Error(`Unexpected token '${this.peek().value}' at line ${this.peek().line}, col ${this.peek().col}`);
  }

  /**
   * Distinguish `A(end, 1)` (an index expression) from the `end` that closes
   * an if/for/while/function block.
   *
   * The block form always follows a complete statement, while the index form
   * always follows `(` or `,` — the separators of an argument list.
   */
  private isEndInExpressionPosition(): boolean {
    if (this.current === 0) return false;
    const prev = this.tokens[this.current - 1];

    // `A(end, 1)`, `A(1, end)`: `end` directly inside an index list.
    if (prev.type === 'DELIMITER' && (prev.value === '(' || prev.value === ',')) {
      return true;
    }

    // `A(1:end-1)`, `A(end-1)`: `end` as the left operand of an operator
    // inside an index expression. The block-closing `end` never follows an
    // operator, because a statement is always complete by then.
    if (prev.type === 'OPERATOR') {
      return true;
    }

    return false;
  }
  private parseMatrixLiteral(): ASTNode {
    const rows: ASTNode[][] = [];
    let currentRow: ASTNode[] = [];

    while (!this.checkDelimiter(']') && !this.isAtEnd()) {
      if (this.matchDelimiter(';') || this.matchTokenType('NEWLINE')) {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        continue;
      }

      // A `,` inside a matrix literal is a column separator; a space acts the
      // same way, but only when it is unambiguous (the lexer already decides
      // that and emits a `,` delimiter in that case).
      currentRow.push(this.parseExpression());

      if (this.matchDelimiter(',')) {
        continue;
      }
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    this.consumeDelimiter(']', "Expected ']' at end of matrix literal");
    return { type: 'MatrixLiteral', rows };
  }

  private parseIfStatement(line: number): StatementNode {
    const test = this.parseExpression();
    this.consumeStatementTerminator();
    const consequent = this.parseBlock(['elseif', 'else', 'end']);
    const elseifs: { test: ASTNode; consequent: StatementNode[] }[] = [];
    let alternate: StatementNode[] | undefined;

    while (this.matchKeyword('elseif')) {
      const elseifTest = this.parseExpression();
      this.consumeStatementTerminator();
      const elseifBody = this.parseBlock(['elseif', 'else', 'end']);
      elseifs.push({ test: elseifTest, consequent: elseifBody });
    }

    if (this.matchKeyword('else')) {
      this.consumeStatementTerminator();
      alternate = this.parseBlock(['end']);
    }

    this.consumeKeyword('end', "Expected 'end' to close if statement");
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: {
        type: 'IfStatement',
        test,
        consequent,
        elseifs,
        alternate
      } as IfStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseForStatement(line: number): StatementNode {
    const idToken = this.consumeTokenType('IDENTIFIER', "Expected variable name after 'for'");
    this.consumeOperator('=', "Expected '=' in for loop");
    const range = this.parseExpression();
    this.consumeStatementTerminator();
    const body = this.parseBlock(['end']);
    this.consumeKeyword('end', "Expected 'end' to close for loop");
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: {
        type: 'ForStatement',
        variable: idToken.value,
        range,
        body
      } as ForStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseWhileStatement(line: number): StatementNode {
    const test = this.parseExpression();
    this.consumeStatementTerminator();
    const body = this.parseBlock(['end']);
    this.consumeKeyword('end', "Expected 'end' to close while loop");
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: {
        type: 'WhileStatement',
        test,
        body
      } as WhileStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseFunctionDef(line: number): StatementNode {
    let outputs: string[] = [];
    let name = '';

    // Check if output signature exists: `[y1, y2] = func(x)` or `y = func(x)`
    if (this.matchDelimiter('[')) {
      do {
        outputs.push(this.consumeTokenType('IDENTIFIER', "Expected output variable name").value);
      } while (this.matchDelimiter(','));
      this.consumeDelimiter(']', "Expected ']' after outputs");
      this.consumeOperator('=', "Expected '=' after function outputs");
      name = this.consumeTokenType('IDENTIFIER', "Expected function name").value;
    } else {
      const firstId = this.consumeTokenType('IDENTIFIER', "Expected function or output name").value;
      if (this.matchOperator('=')) {
        outputs.push(firstId);
        name = this.consumeTokenType('IDENTIFIER', "Expected function name").value;
      } else {
        name = firstId;
      }
    }

    const inputs: string[] = [];
    if (this.matchDelimiter('(')) {
      if (!this.checkDelimiter(')')) {
        do {
          inputs.push(this.consumeTokenType('IDENTIFIER', "Expected input parameter name").value);
        } while (this.matchDelimiter(','));
      }
      this.consumeDelimiter(')', "Expected ')' after parameter list");
    }

    this.consumeStatementTerminator();
    const body = this.parseBlock(['end']);
    if (this.matchKeyword('end')) {
      this.consumeStatementTerminator();
    }

    return {
      type: 'Statement',
      expression: {
        type: 'FunctionDef',
        name,
        inputs,
        outputs,
        body
      } as FunctionDefNode,
      suppressOutput: true,
      line
    };
  }

  /**
   * Parse `switch expr / case v / ... / otherwise / ... / end`.
   */
  private parseSwitchStatement(line: number): StatementNode {
    const discriminant = this.parseExpression();
    this.consumeStatementTerminator();
    const cases: SwitchCaseNode[] = [];

    while (!this.isAtEnd() && !this.checkKeyword('end')) {
      if (this.matchKeyword('case')) {
        const labels: ASTNode[] = [this.parseExpression()];
        // Support `case {1, 2, 3}` cell-array style labels.
        while (this.matchOperator(',')) {
          labels.push(this.parseExpression());
        }
        this.consumeStatementTerminator();
        const body = this.parseBlock(['case', 'otherwise', 'end']);
        cases.push({ labels, body });
        continue;
      }
      if (this.matchKeyword('otherwise')) {
        this.consumeStatementTerminator();
        const body = this.parseBlock(['case', 'otherwise', 'end']);
        cases.push({ labels: [], body });
        continue;
      }
      this.skipSeparators();
    }

    this.consumeKeyword('end', "Expected 'end' to close switch statement");
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: {
        type: 'SwitchStatement',
        discriminant,
        cases
      } as SwitchStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  /**
   * Parse `try / ... / catch / ... / end`.
   */
  private parseTryStatement(line: number): StatementNode {
    this.consumeStatementTerminator();
    const body = this.parseBlock(['catch', 'end']);
    let catchBody: StatementNode[] = [];
    let catchVar: string | undefined;
    if (this.matchKeyword('catch')) {
      // `catch` may bind the error object to a variable: `catch err`.
      if (this.checkTokenType('IDENTIFIER')) {
        catchVar = this.advance().value;
      }
      this.consumeStatementTerminator();
      catchBody = this.parseBlock(['end']);
    }
    this.consumeKeyword('end', "Expected 'end' to close try statement");
    const suppress = this.consumeStatementTerminator();

    return {
      type: 'Statement',
      expression: {
        type: 'TryStatement',
        body,
        catchBody,
        catchVar
      } as TryStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseBreakStatement(line: number): StatementNode {
    const suppress = this.consumeStatementTerminator();
    return {
      type: 'Statement',
      expression: { type: 'BreakStatement' } as BreakStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseContinueStatement(line: number): StatementNode {
    const suppress = this.consumeStatementTerminator();
    return {
      type: 'Statement',
      expression: { type: 'ContinueStatement' } as ContinueStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseReturnStatement(line: number): StatementNode {
    const suppress = this.consumeStatementTerminator();
    return {
      type: 'Statement',
      expression: { type: 'ReturnStatement' } as ReturnStatementNode,
      suppressOutput: suppress,
      line
    };
  }

  private parseBlock(untilKeywords: string[]): StatementNode[] {
    const statements: StatementNode[] = [];
    this.skipSeparators();

    while (!this.isAtEnd() && !this.checkAnyKeyword(untilKeywords)) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      this.skipSeparators();
    }

    return statements;
  }

  private skipSeparators(): void {
    while (!this.isAtEnd()) {
      const t = this.peek();
      if (t.type === 'NEWLINE' || (t.type === 'DELIMITER' && (t.value === ';' || t.value === ','))) {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isStatementTerminator(): boolean {
    const t = this.peek();
    return t.type === 'NEWLINE' || t.type === 'EOF' || (t.type === 'DELIMITER' && (t.value === ';' || t.value === ','));
  }

  private consumeStatementTerminator(): boolean {
    let suppressed = false;
    while (!this.isAtEnd()) {
      const t = this.peek();
      if (t.type === 'DELIMITER' && t.value === ';') {
        suppressed = true;
        this.advance();
      } else if (t.type === 'DELIMITER' && t.value === ',') {
        this.advance();
      } else if (t.type === 'NEWLINE') {
        this.advance();
      } else {
        break;
      }
    }
    return suppressed;
  }

  private matchOperator(op: string): boolean {
    if (this.checkOperator(op)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkOperator(op: string): boolean {
    if (this.isAtEnd()) return false;
    const t = this.peek();
    return t.type === 'OPERATOR' && t.value === op;
  }

  private consumeOperator(op: string, msg: string): Token {
    if (this.checkOperator(op)) return this.advance();
    throw new Error(`${msg} at line ${this.peek().line}`);
  }

  private matchDelimiter(d: string): boolean {
    if (this.checkDelimiter(d)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkDelimiter(d: string): boolean {
    if (this.isAtEnd()) return false;
    const t = this.peek();
    return t.type === 'DELIMITER' && t.value === d;
  }

  private consumeDelimiter(d: string, msg: string): Token {
    if (this.checkDelimiter(d)) return this.advance();
    throw new Error(`${msg} at line ${this.peek().line}`);
  }

  private matchKeyword(kw: string): boolean {
    if (this.checkKeyword(kw)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkKeyword(kw: string): boolean {
    if (this.isAtEnd()) return false;
    const t = this.peek();
    return t.type === 'KEYWORD' && t.value === kw;
  }

  private checkAnyKeyword(kws: string[]): boolean {
    if (this.isAtEnd()) return false;
    const t = this.peek();
    return t.type === 'KEYWORD' && kws.includes(t.value);
  }

  private consumeKeyword(kw: string, msg: string): Token {
    if (this.checkKeyword(kw)) return this.advance();
    throw new Error(`${msg} at line ${this.peek().line}`);
  }

  private matchTokenType(type: string): boolean {
    if (!this.isAtEnd() && this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkTokenType(type: string): boolean {
    return !this.isAtEnd() && this.peek().type === type;
  }

  private consumeTokenType(type: string, msg: string): Token {
    if (!this.isAtEnd() && this.peek().type === type) return this.advance();
    throw new Error(`${msg} at line ${this.peek().line}`);
  }

  private peek(offset: number = 0): Token {
    const idx = this.current + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  /** Save the current token position so it can be restored later. */
  private mark(): number {
    return this.current;
  }

  /** Restore a previously saved token position. */
  private restore(pos: number): void {
    this.current = pos;
  }
}
