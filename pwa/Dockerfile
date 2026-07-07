# CompanyGraph PWA — Vite build served by unprivileged nginx.
# BUILD CONTEXT: the repository ROOT (workspace monorepo; depends on `shared`):
#   docker build -f pwa/Dockerfile -t companygraph/pwa:<tag> .
FROM oven/bun:1.1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY api/package.json ./api/package.json
COPY pwa/package.json ./pwa/package.json
COPY shared/package.json ./shared/package.json
RUN bun install --frozen-lockfile
COPY shared ./shared
COPY pwa ./pwa
WORKDIR /app/pwa
RUN bun run build

# ---------------------------------------------------------------------------
# nginxinc/nginx-unprivileged runs as uid 101 and needs no root at runtime.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY pwa/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/pwa/dist /usr/share/nginx/html
EXPOSE 8080
