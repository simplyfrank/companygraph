# CompanyGraph Helm chart

Deploys the real application surface — **API** (Bun, `:8787`, mounted under
`/api/v1`), **PWA** (static React build via nginx), and toggleable **Neo4j** +
**Postgres** StatefulSets — with a ConfigMap/Secret, ServiceAccount, and an
Ingress that routes `/api/v1` → API and everything else → PWA.

> This chart supersedes the aspirational raw manifests in `../../k8s/` (which
> describe a larger Kafka/Airflow/Neo4j-cluster topology that the current app
> does not use — Neo4j Community cannot cluster). Prefer this chart.

## Build the images

Both Dockerfiles build from the **repository root** (Bun workspace monorepo):

```bash
docker build -f api/Dockerfile -t companygraph/api:0.1.0 .
docker build -f pwa/Dockerfile -t companygraph/pwa:0.1.0 .
# push to your registry, then set api.image.repository / pwa.image.repository
```

Image tags default to the chart's `appVersion` when `api.image.tag` /
`pwa.image.tag` are empty.

## Install

```bash
helm install companygraph ./helm/companygraph \
  --namespace companygraph --create-namespace \
  --set neo4j.auth.password=<strong> \
  --set postgres.auth.password=<strong> \
  --set config.oneloginIssuer=https://<tenant>.onelogin.com \
  --set config.oneloginClientId=<id> \
  --set secret.oneloginClientSecret=<secret> \
  --set ingress.host=companygraph.example.com
```

## Key operational notes

- **Auth is fail-closed.** Leave `config.oneloginIssuer` empty and every guarded
  `/api/v1` route returns `401`. The chart never sets `AUTH_DEV_FALLBACK` — on a
  non-loopback bind that flag makes the API refuse to start (auth-hardening
  FR-09). Configure OneLogin for any real deploy.
- **API is single-replica by design.** It writes `chat.db` + `analytics.sqlite`
  to a ReadWriteOnce PVC (`api.persistence`). Do not raise `api.replicaCount` or
  enable `hpa` until those stores are migrated to Postgres — a shared RWO volume
  corrupts SQLite.
- **External datastores:** set `neo4j.deploy=false` / `postgres.deploy=false`,
  point `neo4j.uri` at your bolt endpoint, and supply `secret.existingSecret`
  with a `postgres-uri` key (and `neo4j-password`, etc.).
- **Secrets in prod:** set `secret.create=false` and provide `secret.existingSecret`
  from an external-secrets operator / sealed-secrets. The in-chart Secret is a
  dev/staging convenience only.

## Probes

- API **readiness** → `GET /api/v1/healthz` (returns `503` while Neo4j is
  unreachable, so the pod is pulled from the Service until its graph is up).
- API **liveness** → TCP on `:8787` (a transient Neo4j outage won't restart the
  pod).

## Post-install

```bash
kubectl -n companygraph exec deploy/companygraph-api -- bun --cwd api run scripts/schema-apply.ts
```
