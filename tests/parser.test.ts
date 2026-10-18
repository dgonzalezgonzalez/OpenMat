import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';

describe('Parser', () => {
  it('parses assignments and matrix expressions', () => {
    const lexer = new Lexer('A = [1, 2; 3, 4];');
    const parser = new Parser(lexer.tokenize());
    const prog = parser.parse();

    expect(prog.body.length).toBe(1);
    const stmt = prog.body[0];
    expect(stmt.suppressOutput).toBe(true);
    expect(stmt.expression.type).toBe('Assignment');
  });

  it('parses colon range expressions', () => {
    const lexer = new Lexer('x = 1:2:10');
    const parser = new Parser(lexer.tokenize());
    const prog = parser.parse();

    expect(prog.body.length).toBe(1);
    const stmt = prog.body[0];
    expect(stmt.suppressOutput).toBe(false);
    expect((stmt.expression as any).value.type).toBe('RangeExpr');
  });

  it('parses for loops and if statements', () => {
    const code = `
      for i = 1:5
        if i == 3
          disp('three')
        end
      end
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const prog = parser.parse();

    expect(prog.body.length).toBe(1);
    expect(prog.body[0].expression.type).toBe('ForStatement');
  });
});
