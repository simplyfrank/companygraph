#!/usr/bin/env bash
# Integration suite (root `bun run test:integration`). Needs Neo4j running
# (bun run dev, or the CI neo4j service).
#
# Selection is NAME-based ('^integration:') because integration tests live
# both in *.integration.test.ts files and as "integration: …" describes
# inside mixed *.test.ts files. Runs from api/ cwd so bun's discovery can
# never sweep duplicate trees elsewhere in the repo (e.g.
# design/companygraph_v2/).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)/api"

exec bun test --test-name-pattern '^integration:' --max-concurrency 1 __tests__ src
