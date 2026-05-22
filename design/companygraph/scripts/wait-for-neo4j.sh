#!/usr/bin/env bash
# Poll bolt port + verify auth. Distinguishes "port not yet open" from
# "port open but auth mismatch" — the latter is the modal first-run
# failure when .env credentials don't match what docker-compose started
# Neo4j with.

set -e

# Load .env so we have NEO4J_USER + NEO4J_PASSWORD here too.
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-}"

if [[ -z "$NEO4J_PASSWORD" ]]; then
  echo "wait-for-neo4j: NEO4J_PASSWORD not set in .env — copy .env.example and set a non-'neo4j' value" >&2
  exit 1
fi

deadline=$((SECONDS + 60))

while (( SECONDS < deadline )); do
  # Probe bolt port — wget on the http management port is the cheapest
  # liveness signal (the docker healthcheck uses the same).
  if curl -sf -o /dev/null --connect-timeout 1 "http://127.0.0.1:7474"; then
    # Port is open. Try an authenticated query via the HTTP transactional
    # endpoint to verify creds match.
    if curl -sf -u "$NEO4J_USER:$NEO4J_PASSWORD" \
        -H "Content-Type: application/json" \
        -d '{"statements":[{"statement":"RETURN 1 AS ok"}]}' \
        "http://127.0.0.1:7474/db/neo4j/tx/commit" >/dev/null 2>&1; then
      echo "Neo4j ready."
      exit 0
    fi
    # Port is open but auth failed. Probably a compose/.env credential
    # mismatch. Worth surfacing immediately rather than waiting out the
    # deadline.
    cat >&2 <<EOF
wait-for-neo4j: bolt port open but auth failed.

Probable cause: credentials in .env don't match what docker-compose
started Neo4j with (named-volume retains the password from the first
boot — second-boot env changes do NOT propagate).

Fix:
  docker volume rm companygraph_neo4j_data
  bun run stop && bun run dev
EOF
    exit 1
  fi
  sleep 2
done

echo "wait-for-neo4j: Neo4j did not become ready within 60s" >&2
exit 1
