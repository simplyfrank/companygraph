import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { DataTable } from "../../components/DataTable";
import { BarChartCard } from "../../components/charts";
import { ViewHeader } from "../_shared";
import styles from "./Ai.module.css";

// cto-analytics FR-07 / T-13 — AI-candidate filter + CSV export + empty state.
//
// RD-4 / RD-4a (2026-07-04): rule-based (no LLM), adopting chat's
// `leverage_score` ranking so analytics ≡ chat. An Activity is a candidate when
// its attributes satisfy the code-default `analytics_ai_candidate_definition`:
//   repetition == "high" AND data_richness == "high" AND leverage_score >= 0.5
// The definition ships as a code-default constant (design §10.2, RD-6) — the
// runtime-tunable settings subsystem is deferred to `cto-analytics-reporting`.
// The server engine (`api/src/analytics/ai-candidates.ts`) backs
// `GET /api/v1/analytics/ai-candidates`; this view mirrors the same rule
// client-side over the ratified `POST /api/v1/query/cypher` passthrough (DD-01).
//
// RD-5: chart colors are `var(--…)` tokens (the monochromatic accent ramp),
// never hardcoded hex.

// Code-default AI-candidate definition (RD-4a) — mirrors the server constant
// `ANALYTICS_AI_CANDIDATE_DEFINITION`.
const DEFINITION = {
  repetition_key: "repetition",
  repetition_match: "high",
  richness_key: "data_richness",
  richness_match: "high",
  leverage_score_key: "leverage_score",
  leverage_min: 0.5,
} as const;

// Named empty-state copy (FR-07 / AC-15). Names the real as-built attributes.
export const AI_EMPTY_STATE_COPY =
  "no activities tagged yet — see ontology-manager to register repetition + data_richness + leverage_score (or your configured) attributes on Activity";

interface CandidateRow {
  activity: { id: string; name: string };
  journey: { id: string; name: string } | null;
  systems: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
  repetition: string | null;
  dataRichness: string | null;
  leverageScore: number | null;
}

// RFC 4180 field quoting (AC-07 c). Quote when the field holds a comma, quote,
// CR, or LF; escape embedded quotes by doubling them.
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const CSV_HEADER = [
  "activity_id",
  "activity_name",
  "journey_name",
  "systems",
  "roles",
  "repetition",
  "data_richness",
  "leverage_score",
] as const;

// Build the RFC 4180 CSV body: UTF-8 BOM prefix + CRLF line endings (AC-07 c).
function buildCsv(rows: CandidateRow[]): string {
  const CRLF = "\r\n";
  const lines: string[] = [CSV_HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.activity.id,
        r.activity.name,
        r.journey ? r.journey.name : "",
        r.systems.map((s) => s.name).join("; "),
        r.roles.map((s) => s.name).join("; "),
        r.repetition ?? "",
        r.dataRichness ?? "",
        r.leverageScore == null ? "" : String(r.leverageScore),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return "﻿" + lines.join(CRLF) + CRLF;
}

// FR-07 Native Conflicts suppression (Resolves: C-04): on iOS Safari an
// `<a download>` often opens the CSV in-tab instead of downloading. Prefer the
// share-sheet flow (`navigator.share()` with a File when available); fall back
// to `<a download>` for desktop browsers.
async function exportCsv(rows: CandidateRow[]): Promise<void> {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const fileName = "ai-candidates.csv";

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (typeof File !== "undefined" && nav.share && nav.canShare) {
    const file = new File([blob], fileName, { type: "text/csv" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "AI candidates" });
        return;
      } catch {
        // User cancelled or share failed — fall through to the download path.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsAi() {
  // Pull every Activity with its scoring attributes + journey/systems/roles;
  // apply the rule-based definition client-side (mirrors the server engine).
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (a:Activity)
        OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
        WITH a, head(collect(j{.id, .name})) AS journey
        OPTIONAL MATCH (a)-[:USES_SYSTEM]->(s:System)
        WITH a, journey, collect(DISTINCT s{.id, .name}) AS systems
        OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
        WITH a, journey, systems, collect(DISTINCT r{.id, .name}) AS roles
        RETURN a{.id, .name} AS activity, journey, systems, roles,
               a.attributes_json AS attrs
        LIMIT 1001
      `),
    [],
  );

  const raw = data.status === "ok" ? (data.data.rows as unknown as Array<{
    activity: { id: string; name: string };
    journey: { id: string; name: string } | null;
    systems: Array<{ id: string; name: string }>;
    roles: Array<{ id: string; name: string }>;
    attrs: string | null;
  }>) : [];

  // Apply the rule-based definition + rank by leverage_score DESC (AC-07 a).
  const candidates: CandidateRow[] = raw
    .map((r) => {
      let attrs: Record<string, unknown> = {};
      if (typeof r.attrs === "string" && r.attrs.length > 0) {
        try {
          const parsed = JSON.parse(r.attrs);
          if (parsed && typeof parsed === "object") attrs = parsed as Record<string, unknown>;
        } catch {
          attrs = {};
        }
      }
      const repetition = attrs[DEFINITION.repetition_key];
      const richness = attrs[DEFINITION.richness_key];
      const leverage = attrs[DEFINITION.leverage_score_key];
      return {
        row: {
          activity: r.activity,
          journey: r.journey ?? null,
          systems: Array.isArray(r.systems) ? r.systems.filter((s) => s && s.id) : [],
          roles: Array.isArray(r.roles) ? r.roles.filter((s) => s && s.id) : [],
          repetition: typeof repetition === "string" ? repetition : null,
          dataRichness: typeof richness === "string" ? richness : null,
          leverageScore: typeof leverage === "number" ? leverage : null,
        } satisfies CandidateRow,
        repetition,
        richness,
        leverage,
      };
    })
    .filter(
      (m) =>
        m.repetition === DEFINITION.repetition_match &&
        m.richness === DEFINITION.richness_match &&
        typeof m.leverage === "number" &&
        m.leverage >= DEFINITION.leverage_min,
    )
    .map((m) => m.row)
    .sort(
      (a, b) =>
        (b.leverageScore ?? 0) - (a.leverageScore ?? 0) ||
        a.activity.name.localeCompare(b.activity.name),
    );

  // leverage_score distribution (RD-5 — accent ramp tokens, no hardcoded hex).
  const histogram = [
    { label: "0.5–0.6", max: 0.6, color: "var(--accent-300)" },
    { label: "0.6–0.7", max: 0.7, color: "var(--accent-500)" },
    { label: "0.7–0.8", max: 0.8, color: "var(--accent-700)" },
    { label: "≥ 0.8", max: Infinity, color: "var(--accent-900)" },
  ].map((b, i, all) => {
    const lo = i === 0 ? DEFINITION.leverage_min : all[i - 1]!.max;
    return {
      label: b.label,
      value: candidates.filter(
        (c) => (c.leverageScore ?? 0) >= lo && (c.leverageScore ?? 0) < b.max,
      ).length,
      color: b.color,
    };
  });

  return (
    <>
      <ViewHeader
        title="AI-leverage candidates"
        lede={`Activities flagged for automation by the rule-based definition — ${DEFINITION.repetition_key} = "${DEFINITION.repetition_match}", ${DEFINITION.richness_key} = "${DEFINITION.richness_match}", ${DEFINITION.leverage_score_key} ≥ ${DEFINITION.leverage_min} — ranked by leverage score. Adopts chat's leverage_score ranking so analytics and chat agree.`}
      />

      <div className={styles.dashboardGrid}>
        <BarChartCard title="Candidates by leverage score" data={histogram} yLabel="activities" />
      </div>

      <div style={{ height: 24 }} />

      <Card
        title="Candidates"
        actions={
          <Button
            tone="primary"
            onClick={() => void exportCsv(candidates)}
            disabled={candidates.length === 0}
          >
            Export CSV
          </Button>
        }
      >
        {data.status === "loading" && <p className={styles.empty}>Loading candidates…</p>}
        {data.status === "error" && <p className={styles.empty}>{data.error}</p>}
        {data.status === "ok" &&
          (candidates.length === 0 ? (
            <p className={styles.empty} data-testid="ai-empty-state">
              {AI_EMPTY_STATE_COPY}
            </p>
          ) : (
            <DataTable
              columns={[
                { id: "activity", label: "activity", kind: "text" },
                { id: "journey", label: "journey", kind: "text" },
                { id: "systems", label: "systems", kind: "text" },
                { id: "roles", label: "roles", kind: "text" },
                { id: "leverage", label: "leverage", kind: "num", align: "right" },
              ]}
              rows={candidates.map((c) => ({
                activity: (
                  <a
                    className={styles.link}
                    href={`#/explorer/activities/${encodeURIComponent(c.activity.id)}`}
                    data-testid="ai-activity-link"
                    data-activity-id={c.activity.id}
                  >
                    {c.activity.name}
                  </a>
                ),
                journey: c.journey ? c.journey.name : <span className={styles.none}>—</span>,
                systems:
                  c.systems.length > 0 ? (
                    <span className={styles.tagSet}>
                      {c.systems.map((s) => (
                        <span key={s.id} className={styles.tag} data-system-id={s.id}>
                          {s.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className={styles.none}>—</span>
                  ),
                roles:
                  c.roles.length > 0 ? (
                    <span className={styles.tagSet}>
                      {c.roles.map((r) => (
                        <span key={r.id} className={styles.tag} data-role-id={r.id}>
                          {r.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className={styles.none}>—</span>
                  ),
                leverage: (
                  <Pill tone={(c.leverageScore ?? 0) >= 0.8 ? "warn" : "accent"}>
                    {(c.leverageScore ?? 0).toFixed(2)}
                  </Pill>
                ),
              }))}
            />
          ))}
      </Card>
    </>
  );
}
