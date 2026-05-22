# Registry + coverage test

**When to use:** You need a single place where N instances of the same shape are declared, with a test that guarantees the registry stays in sync with reality.
**Canonical examples:**
- `telegram/src/memory/dimensions.ts:42` — `LIFE_DIMENSIONS` (tables × keywords × retention × icon)
- `telegram/src/memory/memory-source-registry.ts:202` — `MEMORY_SOURCES` (retrieval adapters)
- `telegram/src/context/slot-registry.ts:418` — `SLOT_REGISTRY` (gateway slots with dep-ordered parallel resolution)
- `telegram/src/cloud/capability-registry.ts:72` — `CAPABILITIES` (reachability-probed integrations)

**Tests:** `telegram/src/memory/__tests__/dimension-coverage.test.ts` (the strongest example — scans migrations, asserts each table is in `LIFE_DIMENSIONS`).
**Related:** `memory-module.md`, `migration.md`.

## Shape

```ts
import type { LifeDimension } from "../memory/dimensions";

export interface Thing {
  name: string;                    // unique key
  dimension: LifeDimension;        // categorical tag every entry shares
  dependsOn?: readonly string[];   // optional: other entries this one reads from
  // ... per-kind fields (ttlMs, reachable(), search(), etc.)
}

// The registry is a `readonly` array; iteration order = declaration order.
export const THING_REGISTRY: readonly Thing[] = [
  thingA, thingB, thingC,
] as const;

// Typed accessors — callers go through these; they do NOT filter the array inline.
export function getThing(name: string): Thing | undefined {
  return THING_REGISTRY.find(t => t.name === name);
}
export function getThingsByDimension(d: LifeDimension): Thing[] {
  return THING_REGISTRY.filter(t => t.dimension === d);
}
```

The coverage test is the other half of the pattern — it greps the real source-of-truth domain (migration SQL for dimensions, `require(...)` probes for capabilities, etc.) and asserts every real-world entry is represented in the registry. The `dimension-coverage.test.ts:31` regex `/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi` is the canonical implementation.

Dependencies between entries (as in `slot-registry.ts:236` where `contactsContext` `dependsOn: ["calendarContext"]`) are resolved by the registry's own orchestrator via wave dispatch: collect entries with all deps satisfied, run in parallel via `Promise.all`, add to resolved set, repeat. Cycle / missing-dep fallback is "bail with fallback values" (`slot-registry.ts:449`), not throw.

Cross-wave data passing uses an explicit `upstream: Map<string, unknown>` threaded through every fetcher (`slot-registry.ts:42`). A producer stashes under a key like `calendarContext:_full`, a consumer reads it — typed via the `dependsOn` declaration. Do not use module-level mutable state for inter-entry communication; the test harness runs wavelets in parallel across test cases and will race.

The four reference registries differ in shape but share this contract:

| Registry | Shape tag | Coverage test source | What it prevents |
|---|---|---|---|
| `LIFE_DIMENSIONS` | `dimension` | Migration SQL `CREATE TABLE` | Untagged tables |
| `MEMORY_SOURCES` | `name` + `dimension` | Retrieval contract (manual) | Missing retrieval adapter |
| `SLOT_REGISTRY` | `key` + `dimension` + `dependsOn` | Gateway field usage (manual) | Silent slot drop |
| `CAPABILITIES` | `id` + `resides` + `queryMatch` | `capability-registry.test.ts` invariants | Offline-branch hallucination |

## Required (acceptance checklist)

- [ ] Entries are records with a stable unique key (`name` / `id` / `key` / `dimension`).
- [ ] Array exported as `readonly` / `as const` so callers can't mutate it.
- [ ] Typed accessors: `get<Thing>(name)`, `get<Thing>sByDimension(d)` — callers must not `.filter()` the raw array inline (grep for direct `MEMORY_SOURCES.filter` etc. to enforce).
- [ ] Coverage test that scans the underlying reality (migrations for dimensions; capability probes for capabilities; slot fetchers for slots) and asserts each is in the registry. Pattern: `dimension-coverage.test.ts:43`.
- [ ] Uniqueness test: no duplicate keys — `dimension-coverage.test.ts:84` asserts "no table in multiple dimensions".
- [ ] If `dependsOn` exists: validate every listed dep resolves to a known entry (otherwise the wave dispatcher silently uses fallback values, which is hard to debug).
- [ ] Adding a new entry is a single-file change (append to the array) — no central orchestrator file to edit. The orchestrator iterates the array.

## Anti-patterns

- Filtering the registry inside a business module (`MEMORY_SOURCES.filter(s => s.name === "fact")` in, say, `email-pipeline.ts`) → couples the business code to the array shape. Use the typed accessor. If the accessor you need doesn't exist, add it to the registry file.
- Encoding dimension names as string literals scattered through the codebase (`if (dim === "finance") ...`) → the canonical list is `ALL_DIMENSIONS` in `dimensions.ts:353`; import from there.
- Adding a registry without a coverage test → the registry drifts the first time someone adds a table / source / capability elsewhere. The coverage test is the whole point.
- Letting the coverage test accept an `ALLOW_LIST` grow unbounded → each entry in `dimension-coverage.test.ts::ALLOW_LIST:21` must have a justification comment. Real new tables always belong in `LIFE_DIMENSIONS`; `ALLOW_LIST` is strictly for FTS5 shadow tables and rename-new-table migration artifacts.
- Encoding dependencies as implicit ordering (put slot B after slot A in the array and hope) → use `dependsOn`; the wave dispatcher is the only correct serialization.

## Extending an existing registry

1. Append a new entry to the array. Keep it in logical grouping (finance entries together, etc.).
2. If the new entry has `dependsOn`, make sure the dep exists and produces a readable shape (for `slot-registry.ts`, producers stash under `"<key>:_full"` in `upstream` — see `calendarContext` at `:226`).
3. Re-run the coverage test: `NODE_ENV=test bun test <registry>-coverage.test.ts`. If it fails, the fix is almost always "add to registry," not "add to allow-list."

## Adding a new registry

1. Write the coverage test FIRST. Pick a source-of-truth that the test can mechanically enumerate — migration SQL, grep for `queryMatch:` in capabilities, filesystem listing of skills. The test must fail before your registry exists.
2. Define the record type with a unique key + at least one categorical tag (usually `dimension`).
3. Export the array as `readonly [...] as const`.
4. Add typed accessors: `get<X>(name)`, `get<X>sByDimension(d)`, etc. Callers are forbidden from `.filter()`ing the raw array inline.
5. Add the test. Verify it passes. Add one more row and verify it still passes (sanity check).
6. Update `/Users/frank/Documents/coding/personalassistant/.claude/patterns/README.md:99` "Source-of-truth files" table so future agents find it.
