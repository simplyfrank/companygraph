#!/bin/bash
# Pre-commit transpile validation
# Runs bun build on the entry points to catch compile errors before commit

BUN="/Users/frank/.bun/bin/bun"
PROJECT="/Users/frank/Documents/coding/personalassistant"
FAILED=0

# Check if any .ts files in telegram/src are staged
TS_STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep '^telegram/src/.*\.ts$' | head -1)

if [ -n "$TS_STAGED" ]; then
  echo "Checking telegram transpile..."
  cd "$PROJECT/telegram"
  if ! $BUN build src/cloud/relay.ts --no-bundle > /dev/null 2>&1; then
    echo "FAIL: relay.ts transpile failed"
    FAILED=1
  fi
  if ! $BUN build src/local/agent.ts --no-bundle > /dev/null 2>&1; then
    echo "FAIL: agent.ts transpile failed"
    FAILED=1
  fi
fi

# Check if any .js files in pwa are staged — basic syntax check
JS_STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep '^pwa/.*\.js$' | head -1)

if [ -n "$JS_STAGED" ]; then
  echo "Checking PWA syntax..."
  for f in $(git diff --cached --name-only --diff-filter=ACMR | grep '^pwa/.*\.js$'); do
    if ! node -c "$PROJECT/$f" > /dev/null 2>&1; then
      echo "FAIL: $f has syntax errors"
      FAILED=1
    fi
  done
fi

if [ $FAILED -ne 0 ]; then
  echo "Pre-commit check failed. Fix errors before committing."
  exit 1
fi

echo "Pre-commit checks passed."
