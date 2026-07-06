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

# Share the API's env with the test process (root .env is the source of
# truth locally; absent in CI, where the job env applies). Root-anchored
# so a direct `scripts/test-integration.sh` run from any cwd behaves
# identically to `bun run test:integration` from the repo root
# (kpi-okr-governance design §4.8a, review N-01).
ROOT="$(git rev-parse --show-toplevel)"
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a

cd "$ROOT/api"

# Bun 1.3.x transpiler bug: ontology-cache.integration.test.ts imports
# ESM exports from ontology/cache/{schema,edge-endpoints,attribute-zod}.ts
# which are stripped in large test suites. Run that file in isolation
# (CI runs it as a separate step before this script), then run the rest.
# Build the file list excluding the problematic file.
FILES=()
while IFS= read -r f; do
  FILES+=("$f")
done < <(find __tests__ src -name '*.test.ts' -o -name '*.integration.test.ts' | grep -v 'ontology-cache.integration.test.ts' | sort)

exec bun test --test-name-pattern '^integration:' --max-concurrency 1 "${FILES[@]}"
