// function-benchmark-scoring T-03 (unit half of AC-02/AC-04/AC-05/AC-06)
// — Neo4j-free unit test of the pure scoreFunctions: sub-score math per
// axis, applicability/exclusion, deterministic rank + seedKey tiebreak,
// and no recommendation key on any emitted object.

import { describe, it, expect } from "bun:test";
import {
  scoreFunctions,
  AUGMENTATION_WEIGHT,
  DEFAULT_WEIGHTS,
} from "../src/derive/function-benchmark-score";
import type {
  FunctionRead,
  FunctionActivity,
  FunctionKpiGrounded,
} from "@companygraph/shared/schema/function-benchmark";

const act = (o: Partial<FunctionActivity> & { id: string }): FunctionActivity => ({
  id: o.id,
  roleIds: o.roleIds ?? [],
  systemKinds: o.systemKinds ?? [],
  keyMarked: o.keyMarked ?? false,
  coveredByKpi: o.coveredByKpi ?? false,
});

const kpi = (o: Partial<FunctionKpiGrounded> & { kpi_id: string }): FunctionKpiGrounded => ({
  kpi_id: o.kpi_id,
  name: o.name ?? o.kpi_id,
  metricId: o.metricId ?? "m-1",
  metricName: o.metricName ?? "Metric",
  benchmarkProse: o.benchmarkProse ?? "prose",
  latestValue: o.latestValue ?? null,
  target_value: o.target_value ?? null,
  target_direction: o.target_direction ?? null,
  warning_threshold: o.warning_threshold ?? null,
  critical_threshold: o.critical_threshold ?? null,
});

const fn = (o: Partial<FunctionRead> & { seedKey: string }): FunctionRead => ({
  seedKey: o.seedKey,
  name: o.name ?? o.seedKey,
  domainId: o.domainId ?? `d-${o.seedKey}`,
  activities: o.activities ?? [],
  groundedKpis: o.groundedKpis ?? [],
});

const run = (functions: FunctionRead[]) =>
  scoreFunctions({
    functions,
    augmentationWeights: AUGMENTATION_WEIGHT,
    compositeWeights: DEFAULT_WEIGHTS,
  });

describe("metricBenchmark (AC-02, DD-04)", () => {
  it("on_target KPI scores higher than a missing one", () => {
    const good = fn({
      seedKey: "a",
      groundedKpis: [
        kpi({ kpi_id: "k1", latestValue: 120, target_value: 100, target_direction: "higher_is_better" }),
      ],
    });
    const bad = fn({
      seedKey: "b",
      groundedKpis: [
        kpi({ kpi_id: "k2", latestValue: 50, target_value: 100, target_direction: "higher_is_better" }),
      ],
    });
    const { functions } = run([good, bad]);
    const g = functions.find((f) => f.seedKey === "a")!;
    const b = functions.find((f) => f.seedKey === "b")!;
    expect(g.metricBenchmark.score!).toBeGreaterThan(b.metricBenchmark.score!);
    expect(g.metricBenchmark.score).toBe(1);
  });

  it("no-value MEASURES KPI is no_data, excluded from denominator", () => {
    const f = fn({
      seedKey: "a",
      groundedKpis: [
        kpi({ kpi_id: "k1", latestValue: 120, target_value: 100, target_direction: "higher_is_better" }),
        kpi({ kpi_id: "k2", latestValue: null, target_value: 100, target_direction: "higher_is_better" }),
      ],
    });
    const { functions } = run([f]);
    const mb = functions[0]!.metricBenchmark;
    expect(mb.scoredCount).toBe(1);
    expect(mb.noDataCount).toBe(1);
    expect(mb.score).toBe(1);
  });

  it("zero grounded KPIs → metricGrounded:false, score null, excluded from composite", () => {
    const f = fn({
      seedKey: "a",
      activities: [act({ id: "x", roleIds: ["r"], systemKinds: ["functional"], coveredByKpi: true })],
      groundedKpis: [],
    });
    const { functions } = run([f]);
    const s = functions[0]!;
    expect(s.metricBenchmark.metricGrounded).toBe(false);
    expect(s.metricBenchmark.score).toBeNull();
    // composite = mean of coverage + automation only (metric term dropped)
    const expected = (s.coverage.score + s.automation.score) / 2;
    expect(s.composite).toBeCloseTo(expected, 10);
  });

  it("grounded-but-all-no_data → metricGrounded:true, score null, dropped from composite", () => {
    const f = fn({
      seedKey: "a",
      activities: [act({ id: "x", coveredByKpi: false })],
      groundedKpis: [kpi({ kpi_id: "k1", latestValue: null, target_value: 100, target_direction: "higher_is_better" })],
    });
    const { functions } = run([f]);
    const s = functions[0]!;
    expect(s.metricBenchmark.metricGrounded).toBe(true);
    expect(s.metricBenchmark.score).toBeNull();
    const expected = (s.coverage.score + s.automation.score) / 2;
    expect(s.composite).toBeCloseTo(expected, 10);
  });
});

describe("coverage (AC-04, DD-08)", () => {
  it("three core ratios; keyMarked:false drops marked-key term (not scored 0)", () => {
    const f = fn({
      seedKey: "a",
      activities: [
        act({ id: "1", roleIds: ["r"], systemKinds: ["functional"], coveredByKpi: true }),
        act({ id: "2", roleIds: [], systemKinds: [], coveredByKpi: false }),
      ],
    });
    const { functions } = run([f]);
    const c = functions[0]!.coverage;
    expect(c.keyMarked).toBe(false);
    expect(c.markedKeyCoveredRatio).toBeNull();
    expect(c.roleRatio).toBe(0.5);
    expect(c.systemRatio).toBe(0.5);
    expect(c.kpiRatio).toBe(0.5);
    expect(c.score).toBeCloseTo(0.5, 10); // mean of 3 ratios, NOT 4 with a 0
  });

  it("marked-key contributes when ≥1 activity marked", () => {
    const f = fn({
      seedKey: "a",
      activities: [
        act({ id: "1", roleIds: ["r"], systemKinds: ["functional"], coveredByKpi: true, keyMarked: true }),
        act({ id: "2", roleIds: ["r"], systemKinds: ["functional"], coveredByKpi: false, keyMarked: true }),
      ],
    });
    const { functions } = run([f]);
    const c = functions[0]!.coverage;
    expect(c.keyMarked).toBe(true);
    expect(c.markedKeyCoveredRatio).toBe(0.5);
    // roleRatio 1, systemRatio 1, kpiRatio 0.5, markedKeyCoveredRatio 0.5 → mean 0.75
    expect(c.score).toBeCloseTo(0.75, 10);
  });

  it("zero activities → unmodeled:true, coverage 0", () => {
    const { functions } = run([fn({ seedKey: "a", activities: [] })]);
    const c = functions[0]!.coverage;
    expect(c.unmodeled).toBe(true);
    expect(c.score).toBe(0);
  });
});

describe("automation (AC-05, DD-06, Risk 8)", () => {
  it("ai_predictive/agentic score higher than functional-only or no-system", () => {
    const hi = fn({ seedKey: "a", activities: [act({ id: "1", systemKinds: ["ai_predictive"] })] });
    const lo = fn({ seedKey: "b", activities: [act({ id: "1", systemKinds: ["functional"] })] });
    const none = fn({ seedKey: "c", activities: [act({ id: "1", systemKinds: [] })] });
    const { functions } = run([hi, lo, none]);
    const a = functions.find((f) => f.seedKey === "a")!.automation;
    const b = functions.find((f) => f.seedKey === "b")!.automation;
    const c = functions.find((f) => f.seedKey === "c")!.automation;
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeGreaterThan(c.score);
    expect(c.augmentationTerm).toBe(0); // no system → 0 augmentation
  });

  it("byKind counts each activity once under best kind; sum === activities-with-system", () => {
    const f = fn({
      seedKey: "a",
      activities: [
        act({ id: "1", systemKinds: ["functional", "agentic"] }), // best agentic
        act({ id: "2", systemKinds: ["ai_predictive"] }),
        act({ id: "3", systemKinds: [] }), // no system
      ],
    });
    const { functions } = run([f]);
    const au = functions[0]!.automation;
    expect(au.byKind.agentic).toBe(1);
    expect(au.byKind.ai_predictive).toBe(1);
    expect(au.byKind.functional).toBe(0);
    const sum = au.byKind.functional + au.byKind.agentic + au.byKind.ai_predictive;
    expect(sum).toBe(2); // activities with ≥1 system
    expect(au.weights).toEqual(AUGMENTATION_WEIGHT);
  });

  it("all-functional degeneracy surfaces via byKind", () => {
    const f = fn({
      seedKey: "a",
      activities: [act({ id: "1", systemKinds: ["functional"] }), act({ id: "2", systemKinds: ["functional"] })],
    });
    const { functions } = run([f]);
    const au = functions[0]!.automation;
    expect(au.byKind.functional).toBe(2);
    expect(au.augmentationTerm).toBeCloseTo(0.34, 10);
  });
});

describe("composite + rank (AC-06, NFR-04)", () => {
  it("ranks composite DESC, ties by seedKey ASC; deterministic", () => {
    // two functions with identical (empty) content → composite tie → seedKey ASC
    const { functions } = run([fn({ seedKey: "zebra" }), fn({ seedKey: "alpha" })]);
    expect(functions.map((f) => f.seedKey)).toEqual(["alpha", "zebra"]);
    // repeat call byte-identical
    const again = run([fn({ seedKey: "zebra" }), fn({ seedKey: "alpha" })]);
    expect(JSON.stringify(again.functions)).toBe(JSON.stringify(functions));
  });

  it("meta echoes weights + functionCount", () => {
    const { meta } = run([fn({ seedKey: "a" })]);
    expect(meta.functionCount).toBe(1);
    expect(meta.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("no recommendation/suggestion key on any emitted object", () => {
    const { functions } = run([
      fn({
        seedKey: "a",
        activities: [act({ id: "1", roleIds: ["r"], systemKinds: ["agentic"], coveredByKpi: true })],
        groundedKpis: [kpi({ kpi_id: "k1", latestValue: 5, target_value: 5, target_direction: "higher_is_better" })],
      }),
    ]);
    const json = JSON.stringify(functions);
    expect(json.includes("recommendation")).toBe(false);
    expect(json.includes("suggestion")).toBe(false);
  });
});
