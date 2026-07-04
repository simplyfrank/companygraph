import { useState, useMemo } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import { useOntologyGraph } from "../ontology/useOntologyGraph";
import styles from "./ContextAlignment.module.css";

// ── Bounded context type definition ──

type BoundedContext = {
  name: string;
  buOwner?: string | undefined;       // Business Unit responsible for this context (optional)
  labels: string[];
  color: string;
  description: string;
};

const DEFAULT_BOUNDED_CONTEXTS: BoundedContext[] = [];

type AlignmentStatus = "aligned" | "review" | "blocked";

function contextOf(label: string, contexts: BoundedContext[]): string | null {
  return contexts.find((c) => c.labels.includes(label))?.name ?? null;
}

interface CrossContextEdge {
  edgeType: string;
  description: string;
  usageExample: string;
  fromLabel: string;
  toLabel: string;
  fromContext: string | null;
  toContext: string | null;
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function ContextAlignment() {
  const [graphKey] = useState(0);
  const { edges, edgeTypes, boundedContexts: bcData, isLoading, error } = useOntologyGraph(graphKey);
  const domains = useFetch(() => api.listDomains(), []);
  
  // Convert API bounded contexts to local format
  const [boundedContexts, setBoundedContexts] = useState<BoundedContext[]>(DEFAULT_BOUNDED_CONTEXTS);
  
  // Initialize bounded contexts from API data when available
  useMemo(() => {
    if (bcData.length > 0) {
      const colors = ["var(--tone-good)", "var(--tone-warn)", "var(--tone-danger)", "var(--tone-accent)"];
      const dynamicContexts = bcData.map((bc, index) => ({
        name: bc.name,
        labels: bc.entities,
        color: colors[index % colors.length] || "var(--tone-neutral)",
        description: bc.description || "",
        buOwner: bc.subdomain || undefined,
      }));
      setBoundedContexts(dynamicContexts);
    }
  }, [bcData]);

  const [selectedCtx, setSelectedCtx] = useState<string | null>(null);
  const [alignmentNotes, setAlignmentNotes] = useState<Record<string, string>>({});
  const [alignmentStatus, setAlignmentStatus] = useState<Record<string, AlignmentStatus>>({});

  // Derive cross-context edges
  const crossContextEdges = useMemo((): CrossContextEdge[] => {
    return edges
      .map((e) => ({
        edgeType: e.type,
        description: e.source.description,
        usageExample: e.source.usage_example,
        fromLabel: e.fromLabel,
        toLabel: e.toLabel,
        fromContext: contextOf(e.fromLabel, boundedContexts),
        toContext: contextOf(e.toLabel, boundedContexts),
      }))
      .filter((e) => e.fromContext !== e.toContext);
  }, [edges, boundedContexts]);

  // For each context, derive its published + consumed cross-context contracts
  const contextContracts = useMemo(() => {
    return boundedContexts.map((ctx) => {
      const ctxSet = new Set(ctx.labels);
      const publishes = crossContextEdges.filter((e) => ctxSet.has(e.fromLabel));
      const consumes = crossContextEdges.filter((e) => ctxSet.has(e.toLabel));

      // Count real graph nodes for this context
      const edgeCount = edges.filter(
        (e) => ctxSet.has(e.fromLabel) || ctxSet.has(e.toLabel),
      ).length;

      return { ctx, publishes, consumes, edgeCount };
    });
  }, [crossContextEdges, edges]);

  // Dependency matrix: which contexts depend on which
  const dependencyMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, CrossContextEdge[]>> = {};
    for (const c of boundedContexts) {
      matrix[c.name] = {};
      for (const d of boundedContexts) {
        (matrix[c.name] as Record<string, CrossContextEdge[]>)[d.name] = [];
      }
    }
    for (const e of crossContextEdges) {
      if (e.fromContext && e.toContext) {
        const row = matrix[e.fromContext];
        if (row) {
          if (!row[e.toContext]) row[e.toContext] = [];
          row[e.toContext]!.push(e);
        }
      }
    }
    return matrix;
  }, [crossContextEdges, boundedContexts]);

  const selected = selectedCtx
    ? contextContracts.find((c) => c.ctx.name === selectedCtx)
    : null;

  const statusTone = (s: AlignmentStatus | undefined) => {
    if (s === "aligned") return "good" as const;
    if (s === "blocked") return "danger" as const;
    return "warn" as const;
  };

  const statusLabel = (s: AlignmentStatus | undefined) => {
    if (s === "aligned") return "Aligned";
    if (s === "blocked") return "Blocked";
    return "In review";
  };

  return (
    <>
      <ViewHeader
        title="Context Alignment"
        lede="Cross-context API contracts and team alignment across bounded contexts. Each context publishes and consumes integration points — track and ratify them here."
      />

      {isLoading && <Loading what="ontology graph" />}
      {error && <ErrorState message={error} />}

      {!isLoading && (
        <>
          {/* ── Summary row ── */}
          <div className={styles.summaryRow}>
            {boundedContexts.map((ctx) => {
              const contract = contextContracts.find((c) => c.ctx.name === ctx.name)!;
              const status = alignmentStatus[ctx.name];
              return (
                <button
                  key={ctx.name}
                  className={`${styles.summaryCard} ${selectedCtx === ctx.name ? styles.summaryCardActive : ""}`}
                  style={{ borderTopColor: ctx.color }}
                  onClick={() => setSelectedCtx(ctx.name === selectedCtx ? null : ctx.name)}
                >
                  <div className={styles.summaryCardTop}>
                    <span className={styles.summaryCtxName}>{ctx.name}</span>
                    <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
                  </div>
                  <span className={styles.summaryBu}>{ctx.buOwner}</span>
                  <div className={styles.summaryStats}>
                    <span><strong>{contract.publishes.length}</strong> publishes</span>
                    <span><strong>{contract.consumes.length}</strong> consumes</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel for selected context ── */}
          {selected && (
            <div className={styles.detailGrid}>
              {/* Left: context info + notes */}
              <Card title={selected.ctx.name}>
                <div className={styles.detailMeta}>
                  <SecLabel>OWNING TEAM</SecLabel>
                  <p className={styles.detailValue}>{selected.ctx.buOwner}</p>
                  <SecLabel>DESCRIPTION</SecLabel>
                  <p className={styles.detailValue}>{selected.ctx.description}</p>
                  <SecLabel>ENTITY TYPES</SecLabel>
                  <div className={styles.labelPills}>
                    {selected.ctx.labels.map((l) => (
                      <Pill key={l} tone="neutral">{l}</Pill>
                    ))}
                  </div>
                  <SecLabel>ALIGNMENT STATUS</SecLabel>
                  <div className={styles.statusRow}>
                    {(["aligned", "review", "blocked"] as AlignmentStatus[]).map((s) => (
                      <button
                        key={s}
                        className={`${styles.statusBtn} ${alignmentStatus[selected.ctx.name] === s ? styles.statusBtnActive : ""}`}
                        onClick={() =>
                          setAlignmentStatus((prev) => ({ ...prev, [selected.ctx.name]: s }))
                        }
                      >
                        <Pill tone={statusTone(s)}>{statusLabel(s)}</Pill>
                      </button>
                    ))}
                  </div>
                  <SecLabel>ALIGNMENT NOTES</SecLabel>
                  <textarea
                    className={styles.notes}
                    placeholder="Record alignment decisions, open questions, or blockers for this context…"
                    value={alignmentNotes[selected.ctx.name] ?? ""}
                    onChange={(e) =>
                      setAlignmentNotes((prev) => ({ ...prev, [selected.ctx.name]: e.target.value }))
                    }
                    rows={4}
                  />
                </div>
              </Card>

              {/* Right: publishes */}
              <Card title={`Publishes (${selected.publishes.length})`}>
                {selected.publishes.length === 0 ? (
                  <p className={styles.empty}>This context has no outbound cross-context API contracts.</p>
                ) : (
                  <div className={styles.contractList}>
                    {selected.publishes.map((e, i) => (
                      <div key={i} className={styles.contractRow}>
                        <div className={styles.contractHeader}>
                          <code className={styles.edgeType}>{e.edgeType}</code>
                          <span className={styles.contractFlow}>
                            <span className={styles.fromLabel}>{e.fromLabel}</span>
                            <span className={styles.arrow}>→</span>
                            <span className={styles.toLabel}>{e.toLabel}</span>
                          </span>
                          <Pill tone="neutral">{e.toContext ?? "external"}</Pill>
                        </div>
                        <p className={styles.contractDesc}>{e.description}</p>
                        {e.usageExample && (
                          <code className={styles.contractExample}>{e.usageExample}</code>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Consumes */}
              <Card title={`Consumes (${selected.consumes.length})`}>
                {selected.consumes.length === 0 ? (
                  <p className={styles.empty}>This context has no inbound cross-context API dependencies.</p>
                ) : (
                  <div className={styles.contractList}>
                    {selected.consumes.map((e, i) => (
                      <div key={i} className={styles.contractRow}>
                        <div className={styles.contractHeader}>
                          <code className={styles.edgeType}>{e.edgeType}</code>
                          <span className={styles.contractFlow}>
                            <span className={styles.fromLabel}>{e.fromLabel}</span>
                            <span className={styles.arrow}>→</span>
                            <span className={styles.toLabel}>{e.toLabel}</span>
                          </span>
                          <Pill tone="accent">{e.fromContext ?? "external"}</Pill>
                        </div>
                        <p className={styles.contractDesc}>{e.description}</p>
                        {e.usageExample && (
                          <code className={styles.contractExample}>{e.usageExample}</code>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── Dependency matrix ── */}
          <div style={{ height: 24 }} />
          <Card title="Cross-context dependency matrix">
            <p className={styles.matrixLede}>
              Each cell shows the number of integration contracts. Read rows as "this context <strong>publishes to</strong> columns".
            </p>
            <div className={styles.matrixWrap}>
              <table className={styles.matrix}>
                <thead>
                  <tr>
                    <th className={styles.matrixCorner}>From ↓ / To →</th>
                    {boundedContexts.map((c) => (
                      <th key={c.name} className={styles.matrixColHead}>
                        <span style={{ color: c.color }}>{c.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {boundedContexts.map((from) => (
                    <tr key={from.name}>
                      <th className={styles.matrixRowHead} style={{ color: from.color }}>
                        {from.name}
                      </th>
                      {boundedContexts.map((to) => {
                        const contracts = dependencyMatrix[from.name]?.[to.name] ?? [];
                        const isSelf = from.name === to.name;
                        return (
                          <td
                            key={to.name}
                            className={`${styles.matrixCell} ${isSelf ? styles.matrixSelf : contracts.length > 0 ? styles.matrixHit : ""}`}
                            title={contracts.map((c) => `${c.edgeType}: ${c.fromLabel} → ${c.toLabel}`).join("\n")}
                          >
                            {isSelf ? (
                              <span className={styles.matrixSelfMark}>—</span>
                            ) : contracts.length > 0 ? (
                              <span className={styles.matrixCount}>{contracts.length}</span>
                            ) : (
                              <span className={styles.matrixZero}>·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Full cross-context contract registry ── */}
          <div style={{ height: 24 }} />
          <Card title={`Integration contract registry (${crossContextEdges.length} contracts)`}>
            {crossContextEdges.length === 0 && (
              <p className={styles.empty}>
                No cross-context edges defined yet. Add edge types in the Ontology manager that connect entities from different bounded contexts.
              </p>
            )}
            {crossContextEdges.length > 0 && (
              <table className={styles.registryTable}>
                <thead>
                  <tr>
                    <th>Edge type</th>
                    <th>From</th>
                    <th>Producer context</th>
                    <th>To</th>
                    <th>Consumer context</th>
                    <th>Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {crossContextEdges.map((e, i) => {
                    const fromCtxDef = boundedContexts.find((c) => c.name === e.fromContext);
                    const toCtxDef = boundedContexts.find((c) => c.name === e.toContext);
                    return (
                      <tr key={i}>
                        <td><code className={styles.edgeType}>{e.edgeType}</code></td>
                        <td className={styles.labelCell}>{e.fromLabel}</td>
                        <td>
                          {fromCtxDef ? (
                            <span className={styles.ctxBadge} style={{ color: fromCtxDef.color, borderColor: fromCtxDef.color }}>
                              {fromCtxDef.name}
                            </span>
                          ) : <span className={styles.muted}>—</span>}
                        </td>
                        <td className={styles.labelCell}>{e.toLabel}</td>
                        <td>
                          {toCtxDef ? (
                            <span className={styles.ctxBadge} style={{ color: toCtxDef.color, borderColor: toCtxDef.color }}>
                              {toCtxDef.name}
                            </span>
                          ) : <span className={styles.muted}>—</span>}
                        </td>
                        <td className={styles.contractDescCell}>{e.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
