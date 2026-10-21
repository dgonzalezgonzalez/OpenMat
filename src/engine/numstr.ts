/**
 * MATLAB-compatible conversion of numbers to text.
 *
 * MATLAB's `num2str` is not a plain `%.Ng` conversion:
 *
 *   - The number of significant digits depends on the magnitude of the
 *     largest element: `d = min(12, max(1, floor(log10(xmax)) + 1)) + 4`.
 *   - An array argument produces a *character matrix* whose rows are the
 *     rows of the input and whose columns are aligned, not a plain string.
 *   - An all-integer argument takes a completely different path
 *     (`int2str`) with its own field widths.
 *
 * The implementation mirrors `num2str.m` and `int2str.m` from
 * `/Applications/MATLAB_R2025b.app/toolbox/matlab/strfun/`, so OpenMat
 * reproduces MATLAB's output byte for byte.
 */

/**
 * The largest double for which `eps(x) <= 1`.
 *
 * MATLAB's integer fast path is guarded by `eps(xmax) <= 1`, which holds
 * exactly while `xmax < 2^53`. Above that the spacing between
 * representable doubles exceeds one and MATLAB falls back to the floating
 * point path, so `num2str(1e20)` prints `1e+20` rather than the full
 * integer.
 */
const MAX_EXACT_INTEGER = 9007199254740992;

/** The largest field width `num2str` allows for the significant digits. */
const MAX_FIELD_WIDTH = 12;

/** The extra digits `num2str` adds to the significant-digit count. */
const FLOAT_WIDTH_OFFSET = 4;

/**
 * The decimal exponent of a positive, finite, non-zero double.
 *
 * `Math.log10` is not exact around powers of ten, which would shift the
 * field width by a whole digit, so the exponent is read back from the
 * exponential representation instead.
 */
function decimalExponent(x: number): number {
  const e = Math.abs(x).toExponential();
  return parseInt(e.slice(e.indexOf('e') + 1), 10);
}

/** Remove trailing zeros (and a trailing decimal point) from a decimal text. */
function stripTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Format a number the way C's `printf` formats it with `%.*g`.
 *
 * C switches to exponential notation when the exponent of the rounded
 * value is below -4 or at least the requested precision, and it drops
 * trailing zeros in both layouts. `sprintf('%12.5g', 1e20)` is `1e+20` and
 * `sprintf('%12.5g', 34506.141651247097)` is `34506.1417`.
 */
export function formatG(value: number, precision: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf';
  if (value === 0) return '0';

  const negative = value < 0;
  const abs = Math.abs(value);

  // Round to `precision` significant digits first: C decides the layout
  // from the rounded value, so `9.9999` at precision 2 prints as `10`.
  const exponential = abs.toExponential(precision - 1);
  const eIndex = exponential.indexOf('e');
  const mantissa = stripTrailingZeros(exponential.slice(0, eIndex));
  const exp = parseInt(exponential.slice(eIndex + 1), 10);

  let body: string;
  if (exp < -4 || exp >= precision) {
    const sign = exp < 0 ? '-' : '+';
    const digits = Math.abs(exp).toString().padStart(2, '0');
    body = `${mantissa}e${sign}${digits}`;
  } else {
    // The rounded value already carries exactly `precision` significant
    // digits, so this only re-lays it out in fixed-point notation.
    const rounded = Number(exponential);
    body = stripTrailingZeros(rounded.toFixed(precision - 1 - exp));
  }

  return negative ? `-${body}` : body;
}

/** Format a number the way C's `printf` formats it with `%.0f`. */
function formatFixed0(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf';
  return value.toFixed(0);
}

/**
 * Remove the leading and trailing columns of a character matrix that are
 * blank in every row.
 *
 * MATLAB's `strtrim` on a character matrix works column-wise: a column is
 * dropped when it is whitespace in *all* rows. Interior blank columns are
 * kept, so `['  a'; 'b  ']` keeps its two leading spaces in the first row.
 */
function trimCharMatrix(rows: string[]): string {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const charAt = (r: number, c: number): string =>
    c < rows[r].length ? rows[r][c] : ' ';

  let start = 0;
  while (start < width && rows.every((_, r) => /\s/.test(charAt(r, start)))) {
    start++;
  }
  let end = width;
  while (end > start && rows.every((_, r) => /\s/.test(charAt(r, end - 1)))) {
    end--;
  }

  return rows.map((r) => r.slice(start, end)).join('\n');
}

/**
 * Insert the space MATLAB inserts before a minus sign that would otherwise
 * run into the previous field.
 *
 * MATLAB's `num2str` looks for a `-` that is preceded by something other
 * than whitespace (and other than the exponent marker `e`/`E`) and pushes a
 * space in front of it so the columns stay aligned.
 */
function padNegativeSigns(row: string): string {
  const marks: number[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const c = row[i];
    if (c === ' ' || c === '\t' || c === 'E' || c === 'e') continue;
    if (row[i + 1] === '-') marks.push(i + 1);
  }
  // Insert from the back so the earlier positions stay valid.
  for (let i = marks.length - 1; i >= 0; i--) {
    row = row.slice(0, marks[i]) + ' ' + row.slice(marks[i]);
  }
  return row;
}

/**
 * Convert a matrix to the text MATLAB's `num2str` produces.
 *
 * The result is a single string whose rows are separated by newlines, which
 * is how the command window renders a character matrix. MATLAB itself
 * returns a character array; keeping it as a string means `num2str` still
 * concatenates cleanly inside `['label: ' num2str(x)]`.
 */
export function num2strMatrix(m: { rows: number; cols: number; toFlatArray(): number[] }): string {
  const { rows, cols } = m;
  if (rows === 0 || cols === 0) return '';

  // MATLAB removes negative zero before formatting.
  const data = m.toFlatArray().map((z) => (z === 0 ? 0 : z));

  // The magnitude that sets the field width. Non-finite values are counted
  // as a three-digit number, exactly as MATLAB does.
  let xmax = 0;
  for (const z of data) {
    const magnitude = Number.isFinite(z) ? Math.abs(z) : 314;
    if (magnitude > xmax) xmax = magnitude;
  }

  // MATLAB's integer path: every element is an integer and the spacing at
  // the largest magnitude is at most one.
  const allIntegral = data.every((z) =>
    Number.isFinite(z) ? Math.trunc(z) === z : true
  );
  if (allIntegral && xmax < MAX_EXACT_INTEGER) {
    return int2str(rows, cols, data, xmax);
  }

  // The floating point path.
  const d =
    xmax === 0
      ? 1
      : Math.min(MAX_FIELD_WIDTH, Math.max(1, decimalExponent(xmax) + 1)) +
        FLOAT_WIDTH_OFFSET;
  const fieldWidth = d + FLOAT_WIDTH_OFFSET + 3;

  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += formatG(data[r * cols + c], d).padStart(fieldWidth, ' ');
    }
    if (cols > 1 && rowHasNegative(data, r, cols)) {
      line = padNegativeSigns(line);
    }
    lines.push(line);
  }

  return trimCharMatrix(lines);
}

/** True when any element of a row is negative. */
function rowHasNegative(data: number[], row: number, cols: number): boolean {
  for (let c = 0; c < cols; c++) {
    if (data[row * cols + c] < 0) return true;
  }
  return false;
}

/**
 * MATLAB's `int2str`: integers are printed with a fixed field width that
 * depends on the largest magnitude, and the columns are then aligned.
 */
function int2str(rows: number, cols: number, data: number[], widthMax: number): string {
  if (rows === 1 && cols === 1) {
    return formatFixed0(data[0]);
  }

  const width = widthMax === 0 ? 3 : decimalExponent(widthMax) + 3;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += formatFixed0(data[r * cols + c]).padStart(width, ' ');
    }
    lines.push(line);
  }

  return trimCharMatrix(lines);
}

/**
 * Convert a matrix to text using an explicit `printf` format string, the
 * way MATLAB's `num2str(x, fmt)` does.
 */
export function num2strWithFormat(
  m: { rows: number; cols: number; toFlatArray(): number[] },
  format: string
): string {
  const { rows, cols } = m;
  if (rows === 0 || cols === 0) return '';
  const data = m.toFlatArray().map((z) => (z === 0 ? 0 : z));

  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += formatValue(data[r * cols + c], format);
    }
    lines.push(line);
  }
  return trimCharMatrix(lines);
}

/**
 * Apply a `printf` format string to a single value.
 *
 * Only the conversions that make sense for a numeric array are supported;
 * anything else falls back to the general `%g` treatment.
 */
function formatValue(value: number, format: string): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf';

  const match = /^%([-+ 0#]*)(\d*)(?:\.(\d+))?([diufFeEgGsxXc])$/.exec(format);
  if (!match) return formatG(value, 6);

  const [, flags, widthText, precisionText, conversion] = match;
  const width = widthText ? parseInt(widthText, 10) : 0;
  const precision = precisionText !== undefined ? parseInt(precisionText, 10) : 6;

  let text: string;
  switch (conversion) {
    case 'd':
    case 'i':
    case 'u':
      text = Math.round(value).toFixed(0);
      break;
    case 'f':
    case 'F':
      text = value.toFixed(precision);
      break;
    case 'e':
    case 'E': {
      const exponential = value.toExponential(precision);
      text = conversion === 'E' ? exponential.toUpperCase() : exponential;
      break;
    }
    case 'g':
    case 'G':
      text = formatG(value, precision);
      if (conversion === 'G') text = text.toUpperCase();
      break;
    default:
      text = formatG(value, precision);
      break;
  }

  if (flags.includes('+') && value >= 0) text = `+${text}`;
  if (flags.includes(' ')) text = ` ${text}`;
  if (width > text.length) {
    const padChar = flags.includes('0') && !flags.includes('-') ? '0' : ' ';
    const padding = padChar.repeat(width - text.length);
    text = flags.includes('-') ? text + padding : padding + text;
  }
  return text;
}
