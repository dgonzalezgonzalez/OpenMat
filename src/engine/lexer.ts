import { Token, TokenType } from './types';

const KEYWORDS = new Set([
  'if', 'elseif', 'else', 'end', 'for', 'while', 'function',
  'return', 'break', 'continue', 'switch', 'case', 'otherwise',
  'try', 'catch', 'global', 'persistent'
]);

/**
 * Keywords that are also valid in expression positions. `end` is the last
 * index of a dimension inside an index expression (e.g. `A(end, 1)`), and
 * `case`/`catch`/`otherwise` introduce their block body.
 */
export const EXPRESSION_KEYWORDS = new Set(['end']);

export class Lexer {
  private readonly source: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  private tokens: Token[] = [];
  private bracketDepth: number = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.bracketDepth = 0;

    while (!this.isAtEnd()) {
      const ch = this.peek();

      // Comments: % or block comments %{ ... %}
      if (ch === '%') {
        if (this.peek(1) === '{' && (this.col === 1 || this.isWhitespace(this.peek(-1)))) {
          this.skipBlockComment();
        } else {
          this.skipLineComment();
        }
        continue;
      }

      // Line continuation: `...` at the end of a line joins it with the
      // next one. MATLAB requires the ellipsis to be followed by a comment
      // or the end of the line.
      if (ch === '.' && this.peek(1) === '.' && this.peek(2) === '.') {
        this.advance();
        this.advance();
        this.advance();
        this.skipLineComment();
        this.advance(); // consume the newline
        this.line++;
        this.col = 1;
        continue;
      }

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        // In matrix bracket context [1 2 3], space can be column separator
        if (this.bracketDepth > 0 && this.isSpaceDelimitingMatrix()) {
          this.tokens.push({ type: 'DELIMITER', value: ',', line: this.line, col: this.col });
        }
        this.advance();
        continue;
      }

      // Newlines
      if (ch === '\n') {
        if (this.bracketDepth > 0) {
          // Newline inside matrix is a row separator (;)
          this.tokens.push({ type: 'DELIMITER', value: ';', line: this.line, col: this.col });
        } else {
          this.tokens.push({ type: 'NEWLINE', value: '\n', line: this.line, col: this.col });
        }
        this.line++;
        this.col = 1;
        this.pos++;
        continue;
      }

      // Numbers
      if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }

      // Strings (single or double quotes)
      if (ch === '"' || (ch === '\'' && !this.isTransposeContext())) {
        this.readString(ch);
        continue;
      }

      // Transpose operators: .' or '
      if (ch === '.' && this.peek(1) === '\'') {
        this.addToken('OPERATOR', '.\'');
        this.advance();
        this.advance();
        continue;
      }
      if (ch === '\'' && this.isTransposeContext()) {
        this.addToken('OPERATOR', '\'');
        this.advance();
        continue;
      }

      // Struct field access: `s.field`, `err.message`. A `.` that is not
      // followed by a digit, quote or an element-wise operator starts a
      // field name.
      if (ch === '.' && this.isAlpha(this.peek(1))) {
        this.addToken('OPERATOR', '.');
        this.advance();
        continue;
      }

      // Identifiers and Keywords
      if (this.isAlpha(ch) || ch === '_') {
        this.readIdentifier();
        continue;
      }

      // Two-character operators
      const twoChar = this.source.slice(this.pos, this.pos + 2);
      if (['==', '~=', '<=', '>=', '&&', '||', '.*', './', '.^', '.\\'].includes(twoChar)) {
        this.addToken('OPERATOR', twoChar);
        this.advance();
        this.advance();
        continue;
      }

      // Single-character operators and delimiters.
      // `@` starts an anonymous function (`@(x) x + 1`) or a named function
      // handle (`@sin`). It must never be dropped silently: an ignored `@`
      // turns `@(x) x + 1` into the *parenthesised variable* `x + 1`, which
      // is a wrong answer rather than an error.
      if (
        ['+', '-', '*', '/', '\\', '^', '<', '>', '=', '~', '&', '|', ':', '@'].includes(ch)
      ) {
        this.addToken('OPERATOR', ch);
        this.advance();
        continue;
      }

      if (['(', ')', '[', ']', '{', '}', ';', ','].includes(ch)) {
        if (ch === '[' || ch === '{') this.bracketDepth++;
        if (ch === ']' || ch === '}') this.bracketDepth = Math.max(0, this.bracketDepth - 1);

        this.addToken('DELIMITER', ch);
        this.advance();
        continue;
      }

      // Unknown character fallback
      this.advance();
    }

    this.tokens.push({ type: 'EOF', value: '', line: this.line, col: this.col });
    return this.tokens;
  }

  private isTransposeContext(): boolean {
    if (this.tokens.length === 0) return false;
    const prev = this.tokens[this.tokens.length - 1];
    return (
      prev.type === 'IDENTIFIER' ||
      prev.type === 'NUMBER' ||
      (prev.type === 'DELIMITER' && [')', ']', '}'].includes(prev.value)) ||
      (prev.type === 'OPERATOR' && ['\'', '.\''].includes(prev.value))
    );
  }

  private isSpaceDelimitingMatrix(): boolean {
    if (this.tokens.length === 0) return false;
    const prev = this.tokens[this.tokens.length - 1];
    // If previous was a value (number, identifier, closing paren/bracket) and next is a value/operator
    const isPrevVal =
      prev.type === 'NUMBER' ||
      prev.type === 'IDENTIFIER' ||
      prev.type === 'STRING' ||
      (prev.type === 'DELIMITER' && [')', ']', '}'].includes(prev.value));

    // Lookahead for next non-space char
    let i = this.pos;
    while (i < this.source.length && (this.source[i] === ' ' || this.source[i] === '\t')) {
      i++;
    }
    if (i >= this.source.length) return false;
    const nextChar = this.source[i];
    if (nextChar === ',' || nextChar === ';' || nextChar === ']' || nextChar === '\n') {
      return false;
    }

    // MATLAB's sign rule inside a matrix literal: a `+`/`-` that follows a
    // space and is *not* followed by a space introduces a new element with a
    // signed value (`[1 -1]` is two elements), while a sign followed by a
    // space stays a binary operator (`[1 - 1]` is a single element).
    if (nextChar === '+' || nextChar === '-') {
      const after = this.source[i + 1];
      if (after === ' ' || after === '\t') return false;
      return isPrevVal;
    }

    const isNextVal = this.isDigit(nextChar) || this.isAlpha(nextChar) || nextChar === '[' || nextChar === '(' || nextChar === '\'' || nextChar === '"';

    return isPrevVal && isNextVal;
  }

  private readNumber(): void {
    const start = this.pos;
    const startCol = this.col;
    let hasDot = false;
    let hasExp = false;

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (this.isDigit(ch)) {
        this.advance();
      } else if (ch === '.' && !hasDot && !hasExp && this.peek(1) !== '*' && this.peek(1) !== '/' && this.peek(1) !== '^' && this.peek(1) !== '\'') {
        hasDot = true;
        this.advance();
      } else if ((ch === 'e' || ch === 'E') && !hasExp) {
        hasExp = true;
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          this.advance();
        }
      } else {
        break;
      }
    }

    // Imaginary literal (e.g. 2i or 3j)
    if (this.peek() === 'i' || this.peek() === 'j') {
      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    this.tokens.push({ type: 'NUMBER', value, line: this.line, col: startCol });
  }

  private readString(quote: string): void {
    const startCol = this.col;
    this.advance(); // skip opening quote
    let str = '';

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === quote) {
        if (this.peek(1) === quote) {
          // Escaped quote
          str += quote;
          this.advance();
          this.advance();
        } else {
          this.advance(); // closing quote
          break;
        }
      } else if (ch === '\n') {
        this.line++;
        this.col = 1;
        str += ch;
        this.advance();
      } else {
        str += ch;
        this.advance();
      }
    }

    this.tokens.push({ type: 'STRING', value: str, line: this.line, col: startCol });
  }

  private readIdentifier(): void {
    const start = this.pos;
    const startCol = this.col;

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    const type = KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER';
    this.tokens.push({ type, value, line: this.line, col: startCol });
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(); // %
    this.advance(); // {
    while (!this.isAtEnd()) {
      if (this.peek() === '%' && this.peek(1) === '}') {
        this.advance();
        this.advance();
        break;
      }
      if (this.peek() === '\n') {
        this.line++;
        this.col = 1;
      }
      this.advance();
    }
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(offset: number = 0): string {
    const p = this.pos + offset;
    return p >= 0 && p < this.source.length ? this.source[p] : '';
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    this.col++;
    return ch;
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({ type, value, line: this.line, col: this.col });
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
  }
}
