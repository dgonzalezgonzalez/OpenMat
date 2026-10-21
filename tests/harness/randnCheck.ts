/**
 * Bit-for-bit check of the OpenMat RNG against values captured from MATLAB.
 *
 * `tests/fixtures/randn_seed5489.txt` holds 2,000 consecutive `randn` values
 * produced by MATLAB R2025b:
 *
 *     rng(5489);
 *     v = randn(1, 2000);
 *     for i = 1:2000, fprintf('%.17g\n', v(i)); end
 *
 * The file is a fixture, not a scratch file: it is the durable evidence that
 * `MatlabRng.nextNormal()` (the ziggurat port) matches MATLAB exactly. A
 * change to `src/engine/rng.ts` or `src/engine/ziggurat.ts` that perturbs even
 * one bit in one of these values fails here.
 *
 * The 500,000-value validation that originally justified the port was run
 * against the same generator; it is not checked in because 500k lines of
 * fixture is 10 MB of noise for the same signal.
 *
 * Usage:
 *   npx vite-node tests/harness/randnCheck.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MatlabRng } from '../../src/engine/rng';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '..', 'fixtures', 'randn_seed5489.txt');

const ref = readFileSync(fixture, 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map(Number);

const rng = new MatlabRng();
rng.seed(MatlabRng.DEFAULT_SEED);

let mismatches = 0;
let firstBad = -1;
let maxAbs = 0;

for (let i = 0; i < ref.length; i++) {
  const got = rng.nextNormal();
  const d = Math.abs(got - ref[i]);
  if (d > maxAbs) maxAbs = d;
  if (d !== 0) {
    mismatches++;
    if (firstBad < 0) firstBad = i;
  }
}

console.log(`compared ${ref.length} randn values against the MATLAB fixture`);
console.log(`mismatches: ${mismatches}${firstBad >= 0 ? ' first@' + firstBad : ''}`);
console.log(`max abs err: ${maxAbs}`);

// The uniform path must be unaffected by the ziggurat work.
const r2 = new MatlabRng();
r2.seed(MatlabRng.DEFAULT_SEED);
console.log(
  'rand(1,4): ' + [r2.nextDouble(), r2.nextDouble(), r2.nextDouble(), r2.nextDouble()].join(', ')
);
console.log('expected : 0.81472368639317894, 0.90579193707561922, 0.12698681629350606, 0.91337585613901939');

if (mismatches > 0) {
  console.error('RNG PARITY: FAIL');
  process.exit(1);
}
console.log('RNG PARITY: OK');
