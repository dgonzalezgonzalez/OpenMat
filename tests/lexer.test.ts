import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';

describe('Lexer', () => {
  it('tokenizes matrix literals with space and semicolon delimiters', () => {
    const lexer = new Lexer('A = [1 2; 3 4];');
    const tokens = lexer.tokenize();

    expect(tokens[0]).toMatchObject({ type: 'IDENTIFIER', value: 'A' });
    expect(tokens[1]).toMatchObject({ type: 'OPERATOR', value: '=' });
    expect(tokens[2]).toMatchObject({ type: 'DELIMITER', value: '[' });
    expect(tokens[3]).toMatchObject({ type: 'NUMBER', value: '1' });
    expect(tokens[4]).toMatchObject({ type: 'DELIMITER', value: ',' });
    expect(tokens[5]).toMatchObject({ type: 'NUMBER', value: '2' });
    expect(tokens[6]).toMatchObject({ type: 'DELIMITER', value: ';' });
    expect(tokens[7]).toMatchObject({ type: 'NUMBER', value: '3' });
    expect(tokens[8]).toMatchObject({ type: 'DELIMITER', value: ',' });
    expect(tokens[9]).toMatchObject({ type: 'NUMBER', value: '4' });
    expect(tokens[10]).toMatchObject({ type: 'DELIMITER', value: ']' });
    expect(tokens[11]).toMatchObject({ type: 'DELIMITER', value: ';' });
  });

  it('distinguishes transpose from string quotes', () => {
    const lexer1 = new Lexer("A'");
    const t1 = lexer1.tokenize();
    expect(t1[1]).toMatchObject({ type: 'OPERATOR', value: "'" });

    const lexer2 = new Lexer("str = 'hello world';");
    const t2 = lexer2.tokenize();
    expect(t2[2]).toMatchObject({ type: 'STRING', value: 'hello world' });
  });

  it('tokenizes element-wise operators and comments', () => {
    const lexer = new Lexer('y = x .* 2 + 1; % test comment');
    const tokens = lexer.tokenize();

    expect(tokens[3]).toMatchObject({ type: 'OPERATOR', value: '.*' });
    expect(tokens[tokens.length - 1].type).toBe('EOF');
  });
});
