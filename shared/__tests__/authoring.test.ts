// business-model-authoring T-01 — schema unit tests (design §3.1–§3.5).
// NOTE: lives in shared/__tests__/ (not src/schema/__tests__/) because
// scripts/test-unit.sh discovers only this directory for the shared
// workspace — recorded as a path deviation in STATUS.md.

import { describe, expect, test } from "bun:test";
import {
  authoringApplySchema,
  authoringApplyResultSchema,
  authoringGraphSchema,
  domainPatchSchema,
} from "../src/schema/authoring";

const UUID_A = "01900000-0000-7000-8000-000000000001";
const UUID_B = "01900000-0000-7000-8000-000000000002";

const node = (over: Record<string, unknown> = {}) => ({
  clientKey: "j0",
  label: "UserJourney",
  name: "Checkout",
  ...over,
});

describe("authoringApplySchema (T-01)", () => {
  test("accepts the three structural labels", () => {
    for (const label of ["UserJourney", "Activity", "Role"]) {
      const r = authoringApplySchema.safeParse({ nodes: [node({ label })], edges: [] });
      expect(r.success).toBe(true);
    }
  });

  test("rejects a node row with label Domain (C-02 at the schema boundary)", () => {
    const r = authoringApplySchema.safeParse({ nodes: [node({ label: "Domain" })], edges: [] });
    expect(r.success).toBe(false);
  });

  test("a row with BOTH existingId and id fails parse (superRefine, DR-N-03)", () => {
    const r = authoringApplySchema.safeParse({
      nodes: [node({ existingId: UUID_A, id: UUID_B })],
      edges: [],
    });
    expect(r.success).toBe(false);
  });

  test("either existingId or id alone is fine", () => {
    expect(
      authoringApplySchema.safeParse({ nodes: [node({ existingId: UUID_A })], edges: [] }).success,
    ).toBe(true);
    expect(
      authoringApplySchema.safeParse({ nodes: [node({ id: UUID_B })], edges: [] }).success,
    ).toBe(true);
  });

  test("rejects an edge type outside PART_OF/EXECUTES/PRECEDES", () => {
    const bad = authoringApplySchema.safeParse({
      nodes: [],
      edges: [{ type: "USES_SYSTEM", from: "a0", to: "s0" }],
    });
    expect(bad.success).toBe(false);
    const ok = authoringApplySchema.safeParse({
      nodes: [],
      edges: [{ type: "PART_OF", from: "j0", to: UUID_A }],
    });
    expect(ok.success).toBe(true);
  });
});

describe("authoringApplyResultSchema (T-01)", () => {
  test("round-trips {imported, errors, ids} with canonical edge keys", () => {
    const payload = {
      imported: { nodes: 2, edges: 1 },
      errors: [
        {
          section: "edges",
          index: 0,
          code: "edge_endpoint_label_mismatch",
          message: "edge_endpoint_label_mismatch",
          details: { outOfModel: [UUID_A] },
        },
      ],
      ids: {
        nodes: { j0: UUID_A },
        edges: { [`PART_OF:j0->${UUID_B}`]: UUID_B },
      },
    };
    const r = authoringApplyResultSchema.safeParse(payload);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(payload);
  });
});

describe("authoringGraphSchema (T-01)", () => {
  test("accepts the id-based projection field names verbatim (§3.3)", () => {
    const r = authoringGraphSchema.safeParse({
      journeys: [
        {
          id: UUID_A,
          name: "Checkout",
          domainId: UUID_B,
          activities: [{ id: UUID_B, name: "Pay", order: 0 }],
        },
      ],
      roles: [{ id: UUID_A, name: "Cashier", executesActivityIds: [UUID_B] }],
      systems: [{ id: UUID_A, name: "POS", usedByActivityIds: [] }],
      locations: [{ id: UUID_A, name: "Store", activityIds: [] }],
      precedes: [{ fromActivityId: UUID_A, toActivityId: UUID_B }],
    });
    expect(r.success).toBe(true);
  });
});

describe("domainPatchSchema (T-01)", () => {
  test("rejects {} (at-least-one refine)", () => {
    expect(domainPatchSchema.safeParse({}).success).toBe(false);
  });
  test("accepts {name}", () => {
    expect(domainPatchSchema.safeParse({ name: "x" }).success).toBe(true);
  });
  test("accepts {description} alone; rejects empty name", () => {
    expect(domainPatchSchema.safeParse({ description: "" }).success).toBe(true);
    expect(domainPatchSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
