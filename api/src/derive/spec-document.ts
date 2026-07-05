// requirements-export T-02 (FR-01, FR-02, FR-03, FR-05, NFR-01..NFR-04) —
// Pure document assembler. Composes upstream section reads through an
// injected SectionReader seam (OQ-1 pinned: in-process handler calls,
// no HTTP self-loopback). Each section failure degrades to the empty
// shape + meta.degraded[<section>] = <reason> (FR-03). No writes, no
// store queries (FR-02, NFR-02, NFR-03).

import type { Driver } from "neo4j-driver";
import type {
  SpecDocument,
  ModelSummary,
  StoryWithAcs,
  KeyActivityRow,
  KpiImpactSection,
  SystemModelSection,
} from "@companygraph/shared/schema/spec-export";

// ---------------------------------------------------------------------------
// SectionReader seam (OQ-1 pinned) — injected so the assembler is pure
// + testable with fixture readers (no Neo4j needed for AC-05 determinism).
// The default implementation (in api/src/routes/spec-export.ts, T-04)
// imports each upstream route's exported handler and calls it in-process.
// ---------------------------------------------------------------------------

export interface SectionReader {
  readModel(driver: Driver, modelId: string): Promise<ModelSummary>;
  readStories(driver: Driver, modelId: string): Promise<StoryWithAcs[]>;
  readKeyActivities(driver: Driver, modelId: string): Promise<KeyActivityRow[]>;
  readKpiImpact(driver: Driver, modelId: string): Promise<KpiImpactSection>;
  readSystemModel(driver: Driver, modelId: string): Promise<SystemModelSection>;
}

// Empty shapes for degraded sections (FR-03).
const EMPTY_KPI_IMPACT: KpiImpactSection = {
  matrix: [],
  gaps: [],
  rollup: { totalLinks: 0, coveredKpis: 0, totalKpis: 0, coverageRatio: 0 },
};

const EMPTY_SYSTEM_MODEL: SystemModelSection = {
  capabilities: [],
  gaps: {
    unsupportedSteps: [],
    capabilityGaps: [],
    capabilitiesWithoutSystem: [],
    orphanSystems: [],
  },
  contextMap: { contexts: [], unassigned: [] },
};

// ---------------------------------------------------------------------------
// assembleSpecDocument — pure composition (no Neo4j, no HTTP).
// Model existence is pre-checked by the caller (T-04), not here.
// ---------------------------------------------------------------------------

export async function assembleSpecDocument(
  modelId: string,
  readers: SectionReader,
  driver: Driver,
): Promise<SpecDocument> {
  const degraded: Record<string, string> = {};

  // Read each section independently; a failure degrades that section
  // (FR-03, NFR-03). Mirrors kpi-impact-mapping FR-09's degrade-not-crash.
  let model: ModelSummary | null = null;
  try {
    model = await readers.readModel(driver, modelId);
  } catch (e) {
    // Model read failure is unexpected (the caller pre-checked existence),
    // but degrade rather than crash.
    degraded.model = (e as Error).message;
    model = { id: modelId, name: "", description: null, isReference: false };
  }

  let stories: StoryWithAcs[] = [];
  try {
    stories = await readers.readStories(driver, modelId);
  } catch (e) {
    degraded.stories = (e as Error).message;
  }

  let keyActivities: KeyActivityRow[] = [];
  try {
    keyActivities = await readers.readKeyActivities(driver, modelId);
  } catch (e) {
    degraded.keyActivities = (e as Error).message;
  }

  let kpiImpact: KpiImpactSection = EMPTY_KPI_IMPACT;
  try {
    kpiImpact = await readers.readKpiImpact(driver, modelId);
  } catch (e) {
    degraded.kpiImpact = (e as Error).message;
  }

  let systemModel: SystemModelSection = EMPTY_SYSTEM_MODEL;
  try {
    systemModel = await readers.readSystemModel(driver, modelId);
  } catch (e) {
    degraded.systemModel = (e as Error).message;
  }

  // Compute meta.counts from the assembled (possibly-degraded) sections.
  // keyActivities = total ranked activities (matches AC-01's "≥1 key
  // activity" fixture — the full ranked list, not just marked ones).
  const acceptanceCriteria = stories.reduce(
    (sum, s) => sum + s.acceptanceCriteria.length,
    0,
  );
  const kpiLinks = kpiImpact.matrix.length;
  const gaps =
    kpiImpact.gaps.length +
    systemModel.gaps.unsupportedSteps.length +
    systemModel.gaps.capabilityGaps.length +
    systemModel.gaps.capabilitiesWithoutSystem.length +
    systemModel.gaps.orphanSystems.length;
  const capabilities = systemModel.capabilities.length;

  const meta = {
    generatedAt: new Date().toISOString(),
    modelId,
    counts: {
      stories: stories.length,
      acceptanceCriteria,
      keyActivities: keyActivities.length,
      kpiLinks,
      gaps,
      capabilities,
    },
    ...(Object.keys(degraded).length > 0 ? { degraded } : {}),
  };

  return {
    model,
    stories,
    keyActivities,
    kpiImpact,
    systemModel,
    meta,
  };
}
