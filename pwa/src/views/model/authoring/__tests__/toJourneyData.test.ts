// business-model-authoring T-15 — toJourneyData unit tests (design §4.8).
// Fixture graph with two ordered activities, a role executing both, a
// system on one, a PRECEDES between them.

import { describe, expect, test } from "bun:test";
import type { AuthoringGraph } from "@companygraph/shared/schema/authoring";
import { toJourneyData } from "../toJourneyData";

const UUID_J = "01900000-0000-7000-8000-000000000001";
const UUID_D = "01900000-0000-7000-8000-000000000002";
const UUID_A0 = "01900000-0000-7000-8000-000000000003";
const UUID_A1 = "01900000-0000-7000-8000-000000000004";
const UUID_R = "01900000-0000-7000-8000-000000000005";
const UUID_S = "01900000-0000-7000-8000-000000000006";
const UUID_J2 = "01900000-0000-7000-8000-000000000007";
const UUID_A2 = "01900000-0000-7000-8000-000000000008";

const fixture: AuthoringGraph = {
  journeys: [
    {
      id: UUID_J, name: "Checkout", domainId: UUID_D,
      activities: [
        { id: UUID_A0, name: "Browse", order: 0 },
        { id: UUID_A1, name: "Pay", order: 1 },
      ],
    },
    {
      id: UUID_J2, name: "Returns", domainId: UUID_D,
      activities: [{ id: UUID_A2, name: "Return", order: 0 }],
    },
  ],
  roles: [
    { id: UUID_R, name: "Cashier", executesActivityIds: [UUID_A0, UUID_A1] },
  ],
  systems: [
    { id: UUID_S, name: "POS", usedByActivityIds: [UUID_A1] },
  ],
  locations: [],
  precedes: [
    { fromActivityId: UUID_A0, toActivityId: UUID_A1 },
    { fromActivityId: UUID_A1, toActivityId: UUID_A2 }, // cross-journey
  ],
};

describe("toJourneyData T-15", () => {
  test("maps activities to dense columns 0,1 by server order", () => {
    const jd = toJourneyData(fixture, UUID_J);
    expect(jd.activities).toEqual([
      { id: UUID_A0, name: "Browse", column: 0 },
      { id: UUID_A1, name: "Pay", column: 1 },
    ]);
  });

  test("role executing both activities gets columns [0,1]", () => {
    const jd = toJourneyData(fixture, UUID_J);
    expect(jd.roles).toHaveLength(1);
    expect(jd.roles[0]!.columns).toEqual([0, 1]);
    expect(jd.roles[0]!.durations).toEqual({});
  });

  test("system on one activity gets usage at correct column", () => {
    const jd = toJourneyData(fixture, UUID_J);
    expect(jd.systems).toHaveLength(1);
    expect(jd.systems[0]!.usages).toEqual([{ column: 1 }]);
  });

  test("PRECEDES between both in-journey activities → {from_col:0, to_col:1}", () => {
    const jd = toJourneyData(fixture, UUID_J);
    expect(jd.precedes).toEqual([{ from_col: 0, to_col: 1 }]);
  });

  test("cross-journey PRECEDES is dropped", () => {
    const jd = toJourneyData(fixture, UUID_J);
    expect(jd.precedes).toHaveLength(1);
    expect(jd.precedes.find((p) => p.from_col === 1 && p.to_col === 0)).toBeUndefined();
  });

  test("role absent from a journey it doesn't execute in is omitted", () => {
    const jd = toJourneyData(fixture, UUID_J2);
    expect(jd.roles).toHaveLength(0);
  });

  test("empty graph for unknown journey id", () => {
    const jd = toJourneyData(fixture, "unknown");
    expect(jd.activities).toEqual([]);
    expect(jd.roles).toEqual([]);
  });
});
