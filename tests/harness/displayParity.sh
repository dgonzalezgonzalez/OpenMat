#!/usr/bin/env bash
# Compare MATLAB's disp output with OpenMat's Matrix.format() for the
# display suite.
set -euo pipefail
cd "$(dirname "$0")/../.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

/Applications/MATLAB_R2025b.app/bin/matlab -batch "run('tests/display-suite/displayRules.m')" \
  > "$TMP/matlab.txt" 2>&1

npx vite-node tests/harness/displayRules.ts > "$TMP/openmat.txt" 2>&1

# Strip the harness banner that vite-node prints.
sed -i '' '/^npm notice/d' "$TMP/openmat.txt"

# MATLAB prints a leading blank line before some blocks; normalise trailing
# whitespace and drop blank lines for the comparison.
norm() {
  sed -e 's/[[:space:]]*$//' "$1" | grep -v '^$'
}

norm "$TMP/matlab.txt" > "$TMP/m.txt"
norm "$TMP/openmat.txt" > "$TMP/o.txt"

if diff -u "$TMP/m.txt" "$TMP/o.txt" > "$TMP/diff.txt"; then
  echo "DISPLAY PARITY: OK ($(wc -l < "$TMP/m.txt" | tr -d ' ') lines identical)"
  exit 0
fi

echo "DISPLAY PARITY: MISMATCH"
cat "$TMP/diff.txt"
exit 1
