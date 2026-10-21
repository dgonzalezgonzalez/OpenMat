/**
 * Compare MATLAB's `disp` output for the display suite against OpenMat's
 * `Matrix.format()`.
 *
 * MATLAB side: `matlab -batch "run('tests/display-suite/display.m')"` prints
 * `--- case N` markers followed by the matrix rendering. This probe
 * reproduces the same cases in OpenMat and the two transcripts are diffed
 * line by line.
 */
import { Interpreter } from '../../src/engine/interpreter';
import { Matrix } from '../../src/engine/matrix';

/** Build a rows x cols matrix whose column-major contents are `start..`. */
function colMajor(rows: number, cols: number, start = 1): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) out.push(new Array(cols).fill(0));
  let k = start;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) out[r][c] = k++;
  }
  return out;
}

const cases: [string, () => Matrix][] = [
  ['case 1', () => Matrix.fromArray([[1, 2, 3], [4, 5, 6], [7, 8, 9]])],
  ['case 2', () => Matrix.fromArray(colMajor(10, 3))],
  ['case 3', () => Matrix.fromArray(colMajor(3, 10))],
  ['case 4', () => Matrix.fromArray(colMajor(2, 10))],
  ['case 5', () => Matrix.fromArray(colMajor(4, 7))],
  ['case 6', () => Matrix.fromArray(colMajor(3, 20))],
  ['case 7', () => Matrix.fromArray(colMajor(2, 30))],
  ['case 8', () => Matrix.fromArray(colMajor(3, 40))],
  ['case 9', () => Matrix.fromArray(colMajor(1, 14))],
  ['case 10', () => Matrix.fromArray(colMajor(1, 13))],
  ['case 11', () => Matrix.fromArray(colMajor(1, 30))],
  ['case 12', () => Matrix.fromArray(colMajor(1, 100))],
  ['case 13', () => Matrix.fromArray(colMajor(100, 3))],
  ['case 14', () => Matrix.fromArray(colMajor(1000, 2))],
  ['case 15', () => Matrix.fromArray(colMajor(2, 5, 12345))],
  ['case 16', () => Matrix.fromArray([[100000, 2, 3, 4, 5, 6]])],
  ['case 17', () => Matrix.fromArray(colMajor(10, 1))],
  ['case 18', () => Matrix.fromArray([[0, 1, -2, 3]])],
  ['case 19', () => Matrix.fromArray([[1.5, 2.25, 3.125]])],
  ['case 20', () => Matrix.fromArray([[1.5, 2.25], [3, 4]])],
  ['case 21', () => Matrix.fromArray([[1, 2.5, 3]])],
  ['case 22', () => Matrix.fromArray([[1.5, 2, 3, 4, 5, 6]])],
  ['case 23', () => Matrix.fromArray([[1e16, 2e16], [3e16, 4e16]])],
  ['case 24', () => Matrix.fromArray([[1e-5, 2e-5], [3e-5, 4e-5]])],
  ['case 25', () => Matrix.fromArray([[0.0001, 0.0002]])],
  ['case 26', () => Matrix.fromArray([[1e5, 2e5]])],
  ['case 27', () => Matrix.fromArray([[1234.5678, 2.25]])],
  ['case 28', () => Matrix.fromArray([[Infinity, -Infinity, NaN, 1]])],
  ['case 29', () => Matrix.fromArray([[0.1, 0.2, 0.3]])],
  ['case 30', () => {
    const v: number[][] = [[], [], []];
    for (let i = 0; i < 12; i++) v[i % 3].push(i / 11);
    return Matrix.fromArray(v);
  }]
];

const out: string[] = [];
for (const [name, build] of cases) {
  out.push('--- ' + name);
  out.push(build().format());
}
console.log(out.join('\n'));
