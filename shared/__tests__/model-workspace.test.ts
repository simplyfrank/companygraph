import { describe, expect, test } from "bun:test";
import {
  modelCreateSchema,
  modelPatchSchema,
  modelReadSchema,
  moduleCreateSchema,
  versionPublishSchema,
  instanceCreateSchema,
  instanceUpgradeSchema,
  instanceEdgeSchema,
  domainAttachSchema,
} from "../src/schema/model-workspace";

// model-workspace-core T-01 — REST-boundary zod schemas.
//
// NOTE (tasks rev 3 deviation, recorded in STATUS.md): the tasks file
// names `shared/src/schema/__tests__/model-workspace.test.ts`, but the
// shared workspace's unit runner (scripts/test-unit.sh) only discovers
// `shared/__tests__/**`, so the file lives here to actually run in CI.

const UUID_A = "01900000-0000-7000-8000-000000000001";
const UUID_B = "01900000-0000-7000-8000-000000000002";

describe("model-workspace zod schemas (T-01)", () => {
  test("modelCreateSchema requires name; accepts optional description/attributes", () => {
    expect(modelCreateSchema.safeParse({ name: "Client A" }).success).toBe(true);
    expect(
      modelCreateSchema.safeParse({
        name: "Client A",
        description: "x",
        attributes: { industry: "retail" },
      }).success,
    ).toBe(true);
    expect(modelCreateSchema.safeParse({}).success).toBe(false);
    expect(modelCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  test("modelPatchSchema.parse({}) is valid (all-optional) and rejects server fields", () => {
    expect(modelPatchSchema.safeParse({}).success).toBe(true);
    expect(modelPatchSchema.safeParse({ name: "Renamed" }).success).toBe(true);
    // .strict() — server-owned lifecycle fields are rejected at the boundary.
    expect(modelPatchSchema.safeParse({ ordinal: 7 }).success).toBe(false);
    expect(modelPatchSchema.safeParse({ isReference: true }).success).toBe(false);
  });

  test("modelReadSchema carries server fields (ordinal, status, isReference, moduleInstanceCount)", () => {
    const parsed = modelReadSchema.safeParse({
      id: UUID_A,
      name: "Retail Reference",
      description: "",
      ordinal: 1,
      status: "active",
      isReference: true,
      moduleInstanceCount: 0,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:00.000Z",
      attributes: {},
    });
    expect(parsed.success).toBe(true);
    expect(modelReadSchema.safeParse({ id: UUID_A, name: "x" }).success).toBe(false);
  });

  test("moduleCreateSchema requires sourceModelId + sourceJourneyId + name", () => {
    expect(
      moduleCreateSchema.safeParse({
        sourceModelId: UUID_A,
        sourceJourneyId: UUID_B,
        name: "Checkout",
      }).success,
    ).toBe(true);
    expect(moduleCreateSchema.safeParse({ name: "Checkout" }).success).toBe(false);
  });

  test("versionPublishSchema — explicit-version mode is optional int ≥ 1 (D-3)", () => {
    expect(versionPublishSchema.safeParse({}).success).toBe(true);
    expect(versionPublishSchema.safeParse({ version: 3 }).success).toBe(true);
    expect(versionPublishSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(versionPublishSchema.safeParse({ version: 1.5 }).success).toBe(false);
  });

  test("instanceCreateSchema rejects a body missing targetDomainId (D-2)", () => {
    expect(
      instanceCreateSchema.safeParse({ moduleId: UUID_A }).success,
    ).toBe(false);
    expect(
      instanceCreateSchema.safeParse({ moduleId: UUID_A, targetDomainId: UUID_B }).success,
    ).toBe(true);
    expect(
      instanceCreateSchema.safeParse({
        moduleId: UUID_A,
        version: 2,
        targetDomainId: UUID_B,
      }).success,
    ).toBe(true);
  });

  test("instanceUpgradeSchema requires toVersion", () => {
    expect(instanceUpgradeSchema.safeParse({ toVersion: 2 }).success).toBe(true);
    expect(
      instanceUpgradeSchema.safeParse({ toVersion: 1, allowDowngrade: true }).success,
    ).toBe(true);
    expect(instanceUpgradeSchema.safeParse({}).success).toBe(false);
  });

  test("instanceEdgeSchema rejects a lifecycle edge type (IN_MODEL) — B-01", () => {
    expect(
      instanceEdgeSchema.safeParse({ type: "IN_MODEL", from: UUID_A, to: UUID_B }).success,
    ).toBe(false);
    expect(
      instanceEdgeSchema.safeParse({ type: "HAS_VERSION", from: UUID_A, to: UUID_B }).success,
    ).toBe(false);
  });

  test("instanceEdgeSchema accepts a synthetic <uuid>::a0 handle in from (B-01)", () => {
    expect(
      instanceEdgeSchema.safeParse({
        type: "USES_SYSTEM",
        from: `${UUID_A}::a0`,
        to: UUID_B,
      }).success,
    ).toBe(true);
    expect(
      instanceEdgeSchema.safeParse({
        type: "PRECEDES",
        from: `${UUID_A}::a0`,
        to: `${UUID_A}::journey`,
      }).success,
    ).toBe(true);
    // Garbage handles rejected.
    expect(
      instanceEdgeSchema.safeParse({
        type: "PRECEDES",
        from: "not-a-handle",
        to: UUID_B,
      }).success,
    ).toBe(false);
  });

  test("domainAttachSchema requires name (B-02)", () => {
    expect(domainAttachSchema.safeParse({ name: "Ops" }).success).toBe(true);
    expect(domainAttachSchema.safeParse({}).success).toBe(false);
    expect(
      domainAttachSchema.safeParse({ name: "Ops", description: "d", attributes: {} }).success,
    ).toBe(true);
  });
});
