#!/usr/bin/env bash
# Unit suite (root `bun run test`).
#
# Two constraints shape this script (see ARCHITECTURE-REVIEW-2026-06-30 §5):
#   1. FILE-level exclusion of *.integration.test.ts — merely name-filtering
#      (--test-name-pattern) still loads those files, whose imports dial a
#      stopped Neo4j and hang the run.
#   2. NAME-level exclusion of tests titled "integration: …" — a few plain
#      *.test.ts files mix unit + integration describes (search-helper,
#      chat/persistence, chat/seed-attrs-presence).
# Each workspace runs with its own cwd so bun's discovery can never sweep
# duplicate trees elsewhere in the repo (e.g. design/companygraph_v2/).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

status=0

(
  cd api
  files=$(find __tests__ src -name '*.test.ts' ! -name '*.integration.test.ts' 2>/dev/null)
  [ -n "$files" ] && bun test --test-name-pattern '^(?!integration:)' $files
) || status=1

(
  cd shared
  files=$(find __tests__ -name '*.test.ts' ! -name '*.integration.test.ts' 2>/dev/null)
  [ -n "$files" ] && bun test --test-name-pattern '^(?!integration:)' $files
) || status=1

exit $status
