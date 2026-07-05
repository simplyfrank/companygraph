// kpi-impact-mapping T-01 — shared schema unit tests.

import { describe, test, expect } from "bun:test";
import {
  activityLinkCreateSchema,
  storyLinkCreateSchema,
  impactLinkRowSchema,
  matrixCellSchema,
  rollupRowSchema,
} from "../kpi-impact";

describe("kpi-impact T-01 schemas", () => {
  test("activityLinkCreateSchema accepts a well-formed body", () => {
    const r = activityLinkCreateSchema.safeParse({
      activityId: "act-1",
      kpiId: "kpi-1",
      direction: "increases",
      weight: 0.5,
    });
    expect(r.success).toBe(true);
  });

  test("activityLinkCreateSchema rejects weight > 1", () => {
    const r = activityLinkCreateSchema.safeParse({
      activityId: "act-1", kpiId: "kpi-1", direction: "increases", weight: 1.5,
    });
    expect(r.success).toBe(false);
  });

  test("activityLinkCreateSchema rejects weight < 0", () => {
    const r = activityLinkCreateSchema.safeParse({
      activityId: "act-1", kpiId: "kpi-1", direction: "increases", weight: -0.1,
    });
    expect(r.success).toBe(false);
  });

  test("activityLinkCreateSchema rejects out-of-enum direction", () => {
    const r = activityLinkCreateSchema.safeParse({
      activityId: "act-1", kpiId: "kpi-1", direction: "sideways", weight: 0.5,
    });
    expect(r.success).toBe(false);
  });

  test("storyLinkCreateSchema rejects weight > 1", () => {
    const r = storyLinkCreateSchema.safeParse({
      storyId: "s-1", kpiId: "kpi-1", direction: "decreases", weight: 2,
    });
    expect(r.success).toBe(false);
  });

  test("storyLinkCreateSchema rejects weight < 0", () => {
    const r = storyLinkCreateSchema.safeParse({
      storyId: "s-1", kpiId: "kpi-1", direction: "decreases", weight: -1,
    });
    expect(r.success).toBe(false);
  });

  test("storyLinkCreateSchema rejects out-of-enum direction", () => {
    const r = storyLinkCreateSchema.safeParse({
      storyId: "s-1", kpiId: "kpi-1", direction: "flat", weight: 0.5,
    });
    expect(r.success).toBe(false);
  });

  test("impactLinkRowSchema accepts direction:null (undirected base-route)", () => {
    const r = impactLinkRowSchema.safeParse({
      linkId: "link-1", sourceId: "act-1", sourceName: "Browse",
      kpiId: "kpi-1", kpiName: "Revenue",
      direction: null, weight: null, notes: null, createdAt: null,
    });
    expect(r.success).toBe(true);
  });

  test("matrixCellSchema accepts null (no link)", () => {
    const r = matrixCellSchema.safeParse(null);
    expect(r.success).toBe(true);
  });

  test("matrixCellSchema accepts a directed cell", () => {
    const r = matrixCellSchema.safeParse({ direction: "increases", weight: 0.8 });
    expect(r.success).toBe(true);
  });

  test("rollupRowSchema.status rejects out-of-enum string", () => {
    const r = rollupRowSchema.safeParse({
      kpiId: "k-1", kpiName: "Rev", unit: "$",
      targetValue: 100, targetDirection: "higher_is_better",
      latestValue: 90, status: "great",
      impactLinkCount: 2, aggregateImpactWeight: 0.5,
    });
    expect(r.success).toBe(false);
  });

  test("rollupRowSchema accepts no_data status", () => {
    const r = rollupRowSchema.safeParse({
      kpiId: "k-1", kpiName: "Rev", unit: "$",
      targetValue: null, targetDirection: null,
      latestValue: null, status: "no_data",
      impactLinkCount: 0, aggregateImpactWeight: 0,
    });
    expect(r.success).toBe(true);
  });
});
