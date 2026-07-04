import {
  SYSTEM_KINDS,
  SYSTEM_KIND_LABELS,
  type SystemKind,
} from "@companygraph/shared/schema/system-kind";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import type { Route } from "../../route";
import { toHash } from "../../route";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { HorizontalBarChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Systems.module.css";

interface SystemRow {
  system: { id: string; name: string; description: string; attributes_json?: string | null };
  uses: number;
  domains?: string[];
  integrations: number;
}

// system-augmentation-model T-14 — systemKind read path. Reads ONLY the
// `systemKind` key from `attributes_json`; the legacy journey-canvas
// shadow key `attributes.kind` is NOT the vocabulary and must never be
// read or written here (design-review pass-2 C-01, pinned).
function parseSystemKind(attributesJson: string | null | undefined): SystemKind | null {
  if (!attributesJson) return null;
  try {
    const attrs = JSON.parse(attributesJson) as Record<string, unknown>;
    const value = attrs.systemKind;
    return (SYSTEM_KINDS as readonly string[]).includes(value as string)
      ? (value as SystemKind)
      : null;
  } catch {
    return null;
  }
}

// Badge = catalog Pill. Tones (SYSTEM_KINDS order): functional → neutral,
// agentic → accent, AI-predictive → good; missing/unrecognized → warn +
// "unclassified". Labels always from SYSTEM_KIND_LABELS — never
// color-only (FR-09). No enum literal appears in pwa/ source (AC-01).
const KIND_TONES: Record<SystemKind, "neutral" | "accent" | "good"> = {
  [SYSTEM_KINDS[0]]: "neutral",
  [SYSTEM_KINDS[1]]: "accent",
  [SYSTEM_KINDS[2]]: "good",
};

function kindPill(kind: SystemKind | null) {
  if (kind === null) return <Pill tone="warn">unclassified</Pill>;
  return <Pill tone={KIND_TONES[kind]}>{SYSTEM_KIND_LABELS[kind]}</Pill>;
}

// URL-first filter state (FR-10): the active kind comes from
// `route.params.kind` (central hash parse — UX-06); unknown values are
// treated as "All".
function activeKindFromRoute(route: Route): SystemKind | null {
  const raw = route.params.kind;
  return (SYSTEM_KINDS as readonly string[]).includes(raw ?? "")
    ? (raw as SystemKind)
    : null;
}

function hashForKind(kind: SystemKind | null): string {
  return toHash(
    { surface: "explorer", tab: "systems" },
    kind ? { kind } : undefined,
  );
}

const FILTER_OPTIONS: ReadonlyArray<{ kind: SystemKind | null; label: string }> = [
  { kind: null, label: "All" },
  ...SYSTEM_KINDS.map((k) => ({ kind: k as SystemKind, label: SYSTEM_KIND_LABELS[k] })),
];

export function ExplorerSystems({ route }: { route: Route }) {
  const activeKind = activeKindFromRoute(route);

  // One Cypher shot — list every System with its USES_SYSTEM in-degree and
  // INTEGRATES_WITH neighbour count. `attributes_json` rides along so the
  // client can badge + filter by systemKind.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (s:System)
        OPTIONAL MATCH (s)<-[u:USES_SYSTEM]-()
        WITH s, count(u) AS uses
        OPTIONAL MATCH (s)-[r:INTEGRATES_WITH]-(other:System)
        WITH s, uses, count(DISTINCT other) AS integrations
        OPTIONAL MATCH (s)<-[:USES_SYSTEM]-(a:Activity)-[:PART_OF]->(j:UserJourney)-[:PART_OF]->(d:Domain)
        WITH s{.id, .name, .description, .attributes_json} AS system, uses, integrations, collect(DISTINCT d.name) AS domains
        RETURN system, uses, domains, integrations
        ORDER BY uses DESC, system.name ASC
        LIMIT 1001
      `),
    [],
  );

  const allRows: Array<SystemRow & { kind: SystemKind | null }> =
    data.status === "ok"
      ? (data.data.rows as unknown as SystemRow[]).map((r) => ({
          ...r,
          kind: parseSystemKind(r.system.attributes_json),
        }))
      : [];
  // Client-side narrowing — table + chart together (FR-10).
  const rows = activeKind === null ? allRows : allRows.filter((r) => r.kind === activeKind);

  return (
    <>
      <ViewHeader
        title="Systems"
        lede="Applications/systems in the architecture. The `uses` count is how many activities touch the system; `integrations` is the INTEGRATES_WITH out-degree."
      />

      <div role="group" aria-label="Filter by system kind" className={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => {
          const active = activeKind === opt.kind;
          return (
            <Button
              key={opt.label}
              tone={active ? "primary" : "ghost"}
              pressed={active}
              onClick={() => {
                location.hash = hashForKind(opt.kind);
              }}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>

      {data.status === "ok" && rows.length > 0 && (
        <div className={styles.dashboardGrid}>
          <HorizontalBarChartCard
            title="Activity usage by system"
            data={rows.map((r) => ({
              label: r.system.name,
              value: r.uses,
            }))}
            xLabel="activities"
          />
        </div>
      )}

      <div className={styles.sectionGap} />

      <Card>
        {data.status === "loading" && <Loading what="systems" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && allRows.length === 0 && (
          <p className={styles.emptyState}>
            No systems yet — create systems via the API or SME surfaces.
          </p>
        )}
        {data.status === "ok" && allRows.length > 0 && rows.length === 0 && activeKind !== null && (
          <div className={styles.emptyState}>
            <p>
              No {SYSTEM_KIND_LABELS[activeKind]} systems — clear the filter to see all
              systems.
            </p>
            <Button href="#/explorer/systems">Clear filter</Button>
          </div>
        )}
        {data.status === "ok" && rows.length > 0 && (
          <DataTable
            columns={[
              { id: "name",         label: "name", kind: "text" },
              { id: "kind",         label: "kind", kind: "text" },
              { id: "description",  label: "description", kind: "text" },
              { id: "uses",         label: "uses", kind: "num", align: "right" },
              { id: "domains",      label: "domains", kind: "text" },
              { id: "integrations", label: "integrations", kind: "num", align: "right" },
              { id: "id",           label: "id", kind: "id" },
            ]}
            rows={rows.map((row) => ({
              name: row.system.name,
              kind: kindPill(row.kind),
              description: row.system.description,
              uses: row.uses,
              domains: row.domains?.join(", ") || "",
              integrations: <Pill tone={row.integrations > 0 ? "accent" : "neutral"}>{row.integrations}</Pill>,
              id: row.system.id.slice(0, 8) + "…",
            }))}
          />
        )}
      </Card>
    </>
  );
}
