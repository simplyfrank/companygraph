# /design-to-web — Propagate design/ Token Changes into the PWA

Reconciles drift between the `design/` source folder and the React app —
**tokens only**. Wraps `sync.sh` (this directory), which diffs `design/**`
against `design-system.manifest.lock` (the same baseline the SessionStart
drift hook uses) and copies the token layer byte-for-byte into
`pwa/src/styles/companygraph/tokens.css`. Everything else — components,
mocks, vocabulary, `DESIGN.md` — is **reported, never auto-applied**; that
is a human decision or a `/wireframe-extract --reconcile` for the catalog
layer.

## When to use

- The SessionStart drift hook warned that `./design` no longer matches the
  last extraction and the drift is (or includes) token changes.
- You changed `design/` token values and want them live in the PWA without
  touching the component catalog.
- CI or you want to *check* whether the token snapshot is stale.

For component/mock/view drift, use `/wireframe-extract --reconcile` instead —
this skill is tokens-only by design.

## Commands

| Command | What it does | Exit codes |
|---|---|---|
| `.claude/skills/design-to-web/sync.sh` | Apply token drift, print reconciliation report | 0 applied/in-sync · 3 component drift outstanding |
| `sync.sh --check` | Dry run; CI gate | 2 = token snapshot STALE |
| `sync.sh --report` | List all `design/` drift, apply nothing | 3 = drift found |

## Hard boundaries (enforced by the script — do not work around them)

- `design/` is **read-only**; the script never edits the design source.
- Writes ONLY `pwa/src/styles/companygraph/tokens.css`.
- NEVER touches `pwa/src/styles/companygraph/index.css` (hand-owned import shim).
- NEVER rewrites `design-system.manifest.lock` — that file is owned by
  `/wireframe-extract`; rewriting it would blind the drift hook.
- NEVER edits `pwa/src/components`, `pwa/src/views`, or the manifest.

## After an apply

```bash
bun run typecheck
bun run scripts/design-conformance.ts   # surfaces touched in this run
```

Surface any failure — it means an upstream token change broke a surface's
token-resolvability or introduced a foreign-DS leak. Related: `/wireframe-extract`
(catalog layer), `/design-apply` (full design-drop conductor), `/stitch tokens-sync`
(yaml→css regeneration).
