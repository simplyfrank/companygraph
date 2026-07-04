/**
 * Graph Analytics Engine — detect suboptimal patterns in the business-process graph.
 *
 * These functions operate on the same ErdEdge[] + label structures that the ERD
 * already has in memory, so they are cheap to run on every graph refresh.
 * Telemetry-dependent use cases (latency, traversal counts) are stubbed with
 * TODO markers for a future metrics bounded context.
 */

import type { ErdEdge } from "./useOntologyGraph";

// ── Types ──────────────────────────────────────────────────────────

export interface BottleneckResult {
  activityLabel: string;
  journeyCount: number;
  systemLabel: string | null;
  ownerRoles: string[];
}

export interface CycleResult {
  cycle: string[]; // ordered list of activity labels
  length: number;
}

export interface OrphanResult {
  entityType: string;
  entityLabel: string;
  createdAt: string | null;
}

export interface CouplingResult {
  fromContext: string;
  toContext: string;
  edgeCount: number;
  ratio: number; // cross-context edges / total edges in fromContext
}

export interface HotPathResult {
  path: string[]; // 3-node activity sequence
  traversalCount: number; // TODO: replace with real telemetry
}

export interface SpofResult {
  systemLabel: string;
  dependentJourneyCount: number;
  dependentRoleCount: number;
  journeyShare: number;
  hasBackup: boolean;
}

export interface FragmentationResult {
  journeyLabel: string;
  contextSwitches: number;
  contextSequence: string[];
}

export interface DeadCodeResult {
  label: string;
  instanceCount: number;
  schemaDefined: boolean;
  createdAt: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildAdjacency(edges: ErdEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.fromLabel)) adj.set(e.fromLabel, new Set());
    if (!adj.has(e.toLabel)) adj.set(e.toLabel, new Set());
    adj.get(e.fromLabel)!.add(e.toLabel);
    adj.get(e.toLabel)!.add(e.fromLabel); // undirected for BFS / cycle detection
  }
  return adj;
}

// ── UC-01 Bottleneck Detection ──────────────────────────────────────

export function detectBottlenecks(
  edges: ErdEdge[],
  _contextOf: (label: string) => string | null,
): BottleneckResult[] {
  // Count how many journeys (inferred from edges) touch each Activity node.
  // A simple proxy: count distinct fromLabel / toLabel pairs where type is CONTAINS.
  const activityJourneys = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type === "CONTAINS" || e.type === "FLOWS_TO") {
      if (!activityJourneys.has(e.toLabel)) activityJourneys.set(e.toLabel, new Set());
      activityJourneys.get(e.toLabel)!.add(e.fromLabel);
    }
  }

  const results: BottleneckResult[] = [];
  for (const [activityLabel, journeys] of activityJourneys) {
    if (journeys.size > 5) {
      results.push({
        activityLabel,
        journeyCount: journeys.size,
        systemLabel: null, // TODO: lookup from edges where type === "REQUIRES"
        ownerRoles: [], // TODO: lookup from edges where type === "OWNED_BY"
      });
    }
  }
  return results.sort((a, b) => b.journeyCount - a.journeyCount);
}

// ── UC-02 Circular Dependency Detection ────────────────────────────

export function detectCycles(
  labels: string[],
  edges: ErdEdge[],
): CycleResult[] {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== "FLOWS_TO" && e.type !== "CONTAINS") continue;
    if (!adj.has(e.fromLabel)) adj.set(e.fromLabel, new Set());
    adj.get(e.fromLabel)!.add(e.toLabel);
  }

  const cycles: CycleResult[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    const neighbours = adj.get(node) ?? new Set();
    for (const next of neighbours) {
      if (!visited.has(next)) {
        dfs(next, [...path, next]);
      } else if (recStack.has(next)) {
        // Found cycle — extract loop from path
        const cycleStart = path.indexOf(next);
        const cycle = path.slice(cycleStart);
        if (cycle.length >= 3) {
          cycles.push({ cycle, length: cycle.length });
        }
      }
    }
    recStack.delete(node);
  }

  for (const label of labels) {
    if (!visited.has(label)) dfs(label, [label]);
  }

  // Deduplicate cycles that are rotations of each other
  const seen = new Set<string>();
  const unique: CycleResult[] = [];
  for (const c of cycles) {
    const key = [...c.cycle].sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique;
}

// ── UC-03 Orphaned Entity Detection ──────────────────────────────

export function detectOrphans(
  labels: string[],
  edges: ErdEdge[],
): OrphanResult[] {
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.fromLabel);
    connected.add(e.toLabel);
  }
  return labels
    .filter((l) => !connected.has(l))
    .map((l) => ({
      entityType: "unknown", // TODO: derive from label metadata
      entityLabel: l,
      createdAt: null,
    }));
}

// ── UC-04 Cross-Context Coupling ─────────────────────────────────

export interface ContextCouplingInput {
  name: string;
  labels: string[];
}

export function detectCoupling(
  contexts: ContextCouplingInput[],
  edges: ErdEdge[],
  contextOf: (label: string) => string | null,
): CouplingResult[] {
  const results: CouplingResult[] = [];
  for (const ctxA of contexts) {
    const ctxASet = new Set(ctxA.labels);
    const totalEdges = edges.filter(
      (e) => ctxASet.has(e.fromLabel) || ctxASet.has(e.toLabel),
    ).length;
    if (totalEdges === 0) continue;

    const targetCounts = new Map<string, number>();
    for (const e of edges) {
      const fromInA = ctxASet.has(e.fromLabel);
      const toInA = ctxASet.has(e.toLabel);
      if (fromInA === toInA) continue; // internal edge
      const remote = fromInA ? e.toLabel : e.fromLabel;
      const remoteCtx = contextOf(remote);
      if (!remoteCtx) continue;
      targetCounts.set(remoteCtx, (targetCounts.get(remoteCtx) ?? 0) + 1);
    }

    for (const [remoteCtx, count] of targetCounts) {
      results.push({
        fromContext: ctxA.name,
        toContext: remoteCtx,
        edgeCount: count,
        ratio: count / totalEdges,
      });
    }
  }
  return results.sort((a, b) => b.ratio - a.ratio);
}

// ── UC-05 Hot Path Analysis (telemetry stub) ──────────────────────

export function detectHotPaths(
  _edges: ErdEdge[],
): HotPathResult[] {
  // TODO: requires traversal-telemetry from API gateway or APM.
  // Returns empty until metrics bounded context is built.
  return [];
}

// ── UC-06 Single Point of Failure ────────────────────────────────

export function detectSpofs(
  labels: string[],
  edges: ErdEdge[],
): SpofResult[] {
  const systemLabels = labels.filter((l) => l === "System"); // TODO: real type lookup
  if (systemLabels.length === 0) return [];

  const totalJourneys = new Set(edges.filter((e) => e.type === "CONTAINS").map((e) => e.fromLabel)).size;
  if (totalJourneys === 0) return [];

  const results: SpofResult[] = [];
  for (const sys of systemLabels) {
    const dependentJourneys = new Set(
      edges.filter((e) => e.toLabel === sys && e.type === "REQUIRES").map((e) => e.fromLabel),
    );
    const dependentRoles = new Set(
      edges.filter((e) => e.toLabel === sys && e.type === "OWNED_BY").map((e) => e.fromLabel),
    );
    const hasBackup = edges.some(
      (e) => e.fromLabel === sys && e.type === "HAS_BACKUP",
    );
    results.push({
      systemLabel: sys,
      dependentJourneyCount: dependentJourneys.size,
      dependentRoleCount: dependentRoles.size,
      journeyShare: dependentJourneys.size / totalJourneys,
      hasBackup,
    });
  }
  return results.sort((a, b) => b.journeyShare - a.journeyShare);
}

// ── UC-07 Process Fragmentation ──────────────────────────────────

export function detectFragmentation(
  journeyLabels: string[],
  edges: ErdEdge[],
  contextOf: (label: string) => string | null,
): FragmentationResult[] {
  const results: FragmentationResult[] = [];
  for (const journey of journeyLabels) {
    const journeyEdges = edges
      .filter((e) => e.fromLabel === journey && e.type === "CONTAINS")
      .map((e) => e.toLabel);

    const contextSequence: string[] = [];
    let switches = 0;
    for (let i = 0; i < journeyEdges.length; i++) {
      const edgeLabel = journeyEdges[i];
      if (!edgeLabel) continue;
      const ctx = contextOf(edgeLabel);
      if (!ctx) continue;
      if (contextSequence.length === 0 || contextSequence[contextSequence.length - 1] !== ctx) {
        contextSequence.push(ctx);
      }
    }
    for (let i = 1; i < contextSequence.length; i++) {
      if (contextSequence[i] !== contextSequence[i - 1]) switches++;
    }

    results.push({ journeyLabel: journey, contextSwitches: switches, contextSequence });
  }
  return results.sort((a, b) => b.contextSwitches - a.contextSwitches);
}

// ── UC-08 N+1 Anti-pattern (telemetry stub) ───────────────────────

export function detectNPlusOne(
  _openApiPaths: unknown[],
): { endpoint: string; childCallRatio: number }[] {
  // TODO: requires API gateway telemetry to compare list-call count vs detail-call count.
  return [];
}

// ── UC-09 Schema Drift (stub) ────────────────────────────────────

export function detectSchemaDrift(
  _labels: { name: string; json_schema_doc?: Record<string, unknown> }[],
  _openApiPaths: unknown[],
): { label: string; unusedProps: string[]; driftRatio: number }[] {
  // TODO: compare json_schema_doc properties against OpenAPI request/response field usage.
  return [];
}

// ── UC-10 Dead-Code Node Detection ────────────────────────────────

export function detectDeadCode(
  labels: { name: string; instanceCount?: number; createdAt?: string; json_schema_doc?: unknown }[],
): DeadCodeResult[] {
  return labels
    .filter((l) => (l.instanceCount ?? 0) === 0)
    .map((l) => ({
      label: l.name,
      instanceCount: 0,
      schemaDefined: !!l.json_schema_doc,
      createdAt: l.createdAt ?? null,
    }))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}
