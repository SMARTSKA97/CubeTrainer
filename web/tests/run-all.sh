#!/bin/sh
# Runs every test file; exits non-zero if any fails. Needs Node >= 22.18 (runs the TypeScript sources directly).
cd "$(dirname "$0")/.." || exit 1
status=0
for f in tests/*.test.mjs; do
  echo "== $f"
  NODE_NO_WARNINGS=1 node --import ./tests/register.mjs "$f" || status=1
done
exit $status
