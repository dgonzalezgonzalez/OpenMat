import { describe, it, expect } from 'vitest';
import { Interpreter } from '../src/engine/interpreter';
import { Matrix } from '../src/engine/matrix';

describe('Interpreter', () => {
  it('executes linear algebra calculations', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      A = [1, 2; 3, 4];
      d = det(A);
      B = inv(A);
      C = A * B;
    `);

    expect(res.outputs.length).toBe(0); // All suppressed with ';'
    const ws = res.workspace;
    expect(ws['A']).toBeInstanceOf(Matrix);
    expect(ws['d'].getScalar()).toBeCloseTo(-2);
    expect(ws['C'].data[0][0]).toBeCloseTo(1);
    expect(ws['C'].data[0][1]).toBeCloseTo(0);
    expect(ws['C'].data[1][0]).toBeCloseTo(0);
    expect(ws['C'].data[1][1]).toBeCloseTo(1);
  });

  it('handles 1-based matrix indexing and slicing', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      M = [10, 20, 30; 40, 50, 60];
      val = M(2, 3);
      row1 = M(1, :);
    `);

    const ws = res.workspace;
    expect(ws['val'].getScalar()).toBe(60);
    expect(ws['row1'].data).toEqual([[10, 20, 30]]);
  });

  it('executes for loops and math functions', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      sumVal = 0;
      for i = 1:5
        sumVal = sumVal + i;
      end
    `);

    expect(res.workspace['sumVal'].getScalar()).toBe(15);
  });

  it('formats unsuppressed output with ans =', () => {
    const interp = new Interpreter();
    const res = interp.execute('2 + 3');

    expect(res.outputs.length).toBe(1);
    expect(res.outputs[0].text).toContain('ans =');
    expect(res.outputs[0].text).toContain('5');
  });

  it('captures plotting commands and data series', () => {
    const interp = new Interpreter();
    const res = interp.execute(`
      x = linspace(0, 1, 10);
      y = sin(x);
      plot(x, y);
      title('Sine Wave');
    `);

    expect(res.plots.length).toBeGreaterThan(0);
    expect(res.plots[0].title).toBe('Sine Wave');
    expect(res.plots[0].series[0].x.length).toBe(10);
  });
});
