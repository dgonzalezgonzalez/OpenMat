import { Matrix } from './matrix';
import { PlotData } from './types';

export type BuiltinFn = (args: any[], context: BuiltinContext) => any;

export interface BuiltinContext {
  workspace: Record<string, any>;
  output: (text: string) => void;
  addPlot: (plot: PlotData) => void;
  currentPlot?: PlotData;
  setCurrentPlot: (plot: PlotData | undefined) => void;
  holdOn: boolean;
  setHoldOn: (hold: boolean) => void;
  timerStart?: number;
  setTimerStart: (t: number) => void;
}

export const BUILTINS: Record<string, BuiltinFn> = {
  // Matrix constructors
  zeros: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.zeros(r, c);
  },

  ones: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.ones(r, c);
  },

  eye: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.eye(r, c);
  },

  rand: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.rand(r, c);
  },

  randn: (args) => {
    const r = toNum(args[0], 1);
    const c = args.length > 1 ? toNum(args[1], r) : r;
    return Matrix.randn(r, c);
  },

  linspace: (args) => {
    const start = toNum(args[0]);
    const stop = toNum(args[1]);
    const n = args.length > 2 ? toNum(args[2]) : 100;
    return Matrix.linspace(start, stop, n);
  },

  logspace: (args) => {
    const start = toNum(args[0]);
    const stop = toNum(args[1]);
    const n = args.length > 2 ? toNum(args[2]) : 50;
    const lin = Matrix.linspace(start, stop, n);
    return lin.map(v => Math.pow(10, v));
  },

  diag: (args) => {
    const v = toMatrix(args[0]);
    if (v.rows === 1 || v.cols === 1) {
      // Vector to diagonal matrix
      const flat = v.toFlatArray();
      const n = flat.length;
      const m = Matrix.zeros(n, n);
      for (let i = 0; i < n; i++) m.data[i][i] = flat[i];
      return m;
    } else {
      // Extract diagonal of matrix to vector
      const n = Math.min(v.rows, v.cols);
      const res = Matrix.zeros(n, 1);
      for (let i = 0; i < n; i++) res.data[i][0] = v.data[i][i];
      return res;
    }
  },

  // Shape and Inspection
  size: (args) => {
    const m = toMatrix(args[0]);
    if (args.length > 1) {
      const dim = toNum(args[1]);
      return dim === 1 ? Matrix.scalar(m.rows) : Matrix.scalar(m.cols);
    }
    return new Matrix(1, 2, [[m.rows, m.cols]]);
  },

  length: (args) => {
    const m = toMatrix(args[0]);
    return Matrix.scalar(Math.max(m.rows, m.cols));
  },

  numel: (args) => {
    const m = toMatrix(args[0]);
    return Matrix.scalar(m.rows * m.cols);
  },

  isempty: (args) => {
    const m = toMatrix(args[0]);
    return Matrix.scalar(m.rows === 0 || m.cols === 0 ? 1 : 0);
  },

  reshape: (args) => {
    const m = toMatrix(args[0]);
    const newRows = toNum(args[1]);
    const newCols = toNum(args[2]);
    const flat = m.toFlatArray();
    if (newRows * newCols !== flat.length) {
      throw new Error(`To RESHAPE the number of elements must not change (${newRows * newCols} vs ${flat.length})`);
    }
    return new Matrix(newRows, newCols, flat);
  },

  // Linear Algebra
  inv: (args) => toMatrix(args[0]).inv(),
  det: (args) => Matrix.scalar(toMatrix(args[0]).det()),
  trace: (args) => Matrix.scalar(toMatrix(args[0]).trace()),
  norm: (args) => Matrix.scalar(toMatrix(args[0]).norm()),
  transpose: (args) => toMatrix(args[0]).transpose(),

  // Element-wise Math Functions
  sin: (args) => toMatrix(args[0]).map(x => Math.sin(x)),
  cos: (args) => toMatrix(args[0]).map(x => Math.cos(x)),
  tan: (args) => toMatrix(args[0]).map(x => Math.tan(x)),
  asin: (args) => toMatrix(args[0]).map(x => Math.asin(x)),
  acos: (args) => toMatrix(args[0]).map(x => Math.acos(x)),
  atan: (args) => toMatrix(args[0]).map(x => Math.atan(x)),
  exp: (args) => toMatrix(args[0]).map(x => Math.exp(x)),
  log: (args) => toMatrix(args[0]).map(x => Math.log(x)),
  log10: (args) => toMatrix(args[0]).map(x => Math.log10(x)),
  sqrt: (args) => toMatrix(args[0]).map(x => Math.sqrt(x)),
  abs: (args) => toMatrix(args[0]).map(x => Math.abs(x)),
  floor: (args) => toMatrix(args[0]).map(x => Math.floor(x)),
  ceil: (args) => toMatrix(args[0]).map(x => Math.ceil(x)),
  round: (args) => toMatrix(args[0]).map(x => Math.round(x)),

  // Statistics & Reductions
  sum: (args) => {
    const m = toMatrix(args[0]);
    const dim = args.length > 1 ? toNum(args[1]) : (m.rows === 1 ? 2 : 1);
    return m.sum(dim);
  },

  mean: (args) => {
    const m = toMatrix(args[0]);
    const dim = args.length > 1 ? toNum(args[1]) : (m.rows === 1 ? 2 : 1);
    return m.mean(dim);
  },

  min: (args) => Matrix.scalar(toMatrix(args[0]).min()),
  max: (args) => Matrix.scalar(toMatrix(args[0]).max()),

  // System & I/O
  disp: (args, ctx) => {
    const val = args[0];
    if (val instanceof Matrix) {
      ctx.output(val.format());
    } else if (typeof val === 'string') {
      ctx.output(val);
    } else {
      ctx.output(String(val));
    }
    return null;
  },

  tic: (_args, ctx) => {
    ctx.setTimerStart(performance.now());
    return null;
  },

  toc: (_args, ctx) => {
    if (ctx.timerStart === undefined) {
      ctx.output('Elapsed time is 0.000000 seconds.');
    } else {
      const elapsed = (performance.now() - ctx.timerStart) / 1000;
      ctx.output(`Elapsed time is ${elapsed.toFixed(6)} seconds.`);
    }
    return null;
  },

  help: (args, ctx) => {
    const topic = args[0] ? String(args[0]) : '';
    if (!topic) {
      ctx.output('OpenMat - Open-Source MATLAB-Compatible Scientific Computing Environment\nAvailable functions: zeros, ones, eye, rand, linspace, sin, cos, exp, log, inv, det, plot, scatter, etc.');
    } else {
      ctx.output(`HELP: Information about ${topic}\nIn OpenMat, '${topic}' conforms to the standard MATLAB calling specification.`);
    }
    return null;
  },

  who: (_args, ctx) => {
    const keys = Object.keys(ctx.workspace);
    ctx.output('Your variables are:\n' + keys.join('   '));
    return null;
  },

  whos: (_args, ctx) => {
    const keys = Object.keys(ctx.workspace);
    const header = '  Name      Size            Bytes  Class';
    const lines = [header];
    for (const k of keys) {
      const val = ctx.workspace[k];
      if (val instanceof Matrix) {
        lines.push(`  ${k.padEnd(8)}  ${`${val.rows}x${val.cols}`.padEnd(14)}  ${(val.rows * val.cols * 8).toString().padEnd(6)} double`);
      } else if (typeof val === 'string') {
        lines.push(`  ${k.padEnd(8)}  ${`1x${val.length}`.padEnd(14)}  ${(val.length * 2).toString().padEnd(6)} char`);
      }
    }
    ctx.output(lines.join('\n'));
    return null;
  },

  clear: (args, ctx) => {
    if (args.length === 0 || args[0] === 'all') {
      for (const k of Object.keys(ctx.workspace)) {
        delete ctx.workspace[k];
      }
    } else {
      for (const a of args) {
        delete ctx.workspace[String(a)];
      }
    }
    return null;
  },

  clc: (_args, ctx) => {
    ctx.output('\x1Bc'); // Clear screen signal
    return null;
  },

  // Plotting Commands
  plot: (args, ctx) => {
    return handlePlot(args, ctx, 'line');
  },

  scatter: (args, ctx) => {
    return handlePlot(args, ctx, 'scatter');
  },

  bar: (args, ctx) => {
    return handlePlot(args, ctx, 'bar');
  },

  histogram: (args, ctx) => {
    return handlePlot(args, ctx, 'histogram');
  },

  title: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.title = String(args[0]);
    }
    return null;
  },

  xlabel: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.xlabel = String(args[0]);
    }
    return null;
  },

  ylabel: (args, ctx) => {
    if (ctx.currentPlot && args[0]) {
      ctx.currentPlot.ylabel = String(args[0]);
    }
    return null;
  },

  grid: (args, ctx) => {
    if (ctx.currentPlot) {
      const state = args[0] ? String(args[0]).toLowerCase() : 'on';
      ctx.currentPlot.grid = state !== 'off';
    }
    return null;
  },

  hold: (args, ctx) => {
    const state = args[0] ? String(args[0]).toLowerCase() : 'on';
    ctx.setHoldOn(state === 'on');
    return null;
  },

  figure: (_args, ctx) => {
    ctx.setCurrentPlot(undefined);
    return null;
  }
};

function handlePlot(args: any[], ctx: BuiltinContext, type: 'line' | 'scatter' | 'bar' | 'histogram'): null {
  let x: number[] = [];
  let y: number[] = [];
  let label = `data_${(ctx.currentPlot?.series.length || 0) + 1}`;

  if (args.length === 1) {
    const m = toMatrix(args[0]);
    y = m.toFlatArray();
    x = Array.from({ length: y.length }, (_, i) => i + 1);
  } else if (args.length >= 2) {
    const mx = toMatrix(args[0]);
    const my = toMatrix(args[1]);
    x = mx.toFlatArray();
    y = my.toFlatArray();
    if (args.length >= 3 && typeof args[2] === 'string') {
      label = args[2];
    }
  }

  const colors = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];
  const color = colors[(ctx.currentPlot?.series.length || 0) % colors.length];

  if (ctx.holdOn && ctx.currentPlot) {
    ctx.currentPlot.series.push({ label, x, y, color });
    ctx.addPlot(ctx.currentPlot);
  } else {
    const newPlot: PlotData = {
      id: 'plot_' + Date.now(),
      type,
      grid: true,
      series: [{ label, x, y, color }]
    };
    ctx.setCurrentPlot(newPlot);
    ctx.addPlot(newPlot);
  }

  return null;
}

function toNum(val: any, fallback: number = 0): number {
  if (val instanceof Matrix) return val.getScalar();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function toMatrix(val: any): Matrix {
  if (val instanceof Matrix) return val;
  if (typeof val === 'number') return Matrix.scalar(val);
  if (Array.isArray(val)) return Matrix.fromArray(val);
  return Matrix.scalar(0);
}
