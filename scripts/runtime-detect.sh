#!/usr/bin/env bash
# Probe for a Compose-v2-compatible container runtime and export the
# command to invoke as $COMPANYGRAPH_COMPOSE_CMD. Sourced by `bun run dev`
# / `bun run stop` (see package.json).
#
# Supported runtimes (probed in order): Docker Desktop, OrbStack, colima
# (each ship `docker compose`), Podman 4+ (`podman compose`).
# Rancher Desktop ships `docker compose` too and is picked up by the first
# probe.

set -e

probe() {
  local cmd="$1"
  $cmd version >/dev/null 2>&1
}

if probe "docker compose"; then
  export COMPANYGRAPH_COMPOSE_CMD="docker compose"
elif probe "podman compose"; then
  export COMPANYGRAPH_COMPOSE_CMD="podman compose"
else
  cat >&2 <<'EOF'
companygraph: no Compose runtime detected.

Tried: docker compose, podman compose.

Install one of:
  - Docker Desktop  (https://www.docker.com/products/docker-desktop/)
  - OrbStack        (https://orbstack.dev/)  — recommended for macOS
  - colima          (https://github.com/abiosoft/colima)
  - Podman 4+       (https://podman.io/)
  - Rancher Desktop (https://rancherdesktop.io/)

…then re-run `bun run dev`.
EOF
  exit 1
fi
