import { describe, it, expect } from 'vitest';
import { Matrix } from '../src/engine/matrix';

describe('Matrix Engine', () => {
  it('creates matrices with zeros, ones, and eye', () => {
    const z = Matrix.zeros(2, 3);
    expect(z.rows).toBe(2);
    expect(z.cols).toBe(3);
    expect(z.data).toEqual([[0, 0, 0], [0, 0, 0]]);

    const o = Matrix.ones(2, 2);
    expect(o.data).toEqual([[1, 1], [1, 1]]);

    const e = Matrix.eye(3);
    expect(e.data).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]);
  });

  it('performs 1-based indexing get and set', () => {
    const m = Matrix.zeros(2, 2);
    m.set(1, 1, 10);
    m.set(2, 2, 20);
    expect(m.get(1, 1)).toBe(10);
    expect(m.get(2, 2)).toBe(20);
    expect(() => m.get(0, 1)).toThrow();
  });

  it('performs matrix multiplication', () => {
    // [1 2; 3 4] * [2 0; 1 2] = [4 4; 10 8]
    const a = new Matrix(2, 2, [[1, 2], [3, 4]]);
    const b = new Matrix(2, 2, [[2, 0], [1, 2]]);
    const c = a.mul(b);
    expect(c.data).toEqual([[4, 4], [10, 8]]);
  });

  it('computes determinant and inverse', () => {
    const a = new Matrix(2, 2, [[4, 7], [2, 6]]);
    // det(a) = 4*6 - 7*2 = 24 - 14 = 10
    expect(a.det()).toBeCloseTo(10);

    const invA = a.inv();
    expect(invA).not.toBeNull();
    const product = a.mul(invA!);
    expect(product.data[0][0]).toBeCloseTo(1);
    expect(product.data[0][1]).toBeCloseTo(0);
    expect(product.data[1][0]).toBeCloseTo(0);
    expect(product.data[1][1]).toBeCloseTo(1);
  });

  it('reports a singular matrix instead of throwing on inverse', () => {
    const singular = new Matrix(2, 2, [[1, 2], [2, 4]]);
    expect(singular.inv()).toBeNull();
  });

  it('performs element-wise operations and transpose', () => {
    const a = new Matrix(2, 2, [[1, 2], [3, 4]]);
    const b = new Matrix(2, 2, [[10, 20], [30, 40]]);

    expect(a.dotMul(b).data).toEqual([[10, 40], [90, 160]]);
    expect(a.dotPow(2).data).toEqual([[1, 4], [9, 16]]);
    expect(a.transpose().data).toEqual([[1, 3], [2, 4]]);
  });
});
