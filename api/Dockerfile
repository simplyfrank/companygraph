# CompanyGraph API — Bun HTTP server (api/src/server.ts).
# BUILD CONTEXT: the repository ROOT (this is a Bun workspace monorepo and the
# api depends on the `shared` workspace):
#   docker build -f api/Dockerfile -t companygraph/api:<tag> .
FROM oven/bun:1.1 AS deps
WORKDIR /app
# Native module (better-sqlite3) needs a toolchain to compile at install time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Workspace manifests first for layer caching.
COPY package.json bun.lock ./
COPY api/package.json ./api/package.json
COPY pwa/package.json ./pwa/package.json
COPY shared/package.json ./shared/package.json
# NOTE: better-sqlite3 compiles a native addon in its postinstall. If Bun skips
# it (not in the default trusted-dependencies allowlist), add
#   "trustedDependencies": ["better-sqlite3"]
# to the root package.json so this install builds the addon with the toolchain
# above. Verify with: docker run --rm companygraph/api:<tag> bun -e \
#   'import("better-sqlite3").then(()=>console.log("ok"))'
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM oven/bun:1.1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# App reads all config from the environment (injected by the k8s ConfigMap /
# Secret). HOST/API_PORT default to 0.0.0.0:8787 via the chart's ConfigMap.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY shared ./shared
COPY api ./api
# Data dir for the chat + analytics SQLite files (chart mounts a PVC here).
RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun
WORKDIR /app/api
EXPOSE 8787
CMD ["bun", "run", "src/server.ts"]
