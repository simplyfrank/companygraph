import { describe, expect, test } from "bun:test";
import { deriveStories, type DeriveActivityInput } from "../src/derive/story-derive";
import { formulateUserStories } from "../../pwa/src/lib/userStories";
import type { JourneyData } from "../../pwa/src/components/JourneyCanvas";

// story-spec-core T-04 + T-06 / AC-06 (NFR-04) — parity harness:
// `deriveStories` (server, structural shape) and the client
// `formulateUserStories` (column-indexed JourneyData) cannot share one
// input object, so ONE canonical single-journey structural fixture is
// mapped to both shapes. The projected `roles`/`locations` arrays are
// ordered so array-index-0 is the same node the server selects by
// createdAt-then-id (the client picks filtered[0] by pure array order;
// JourneyData has no createdAt — the projection ordering is the
// coupling point, design §4.5). Neo4j-free (DD-01).

const JOURNEY_NAME = "Checkout";

// Canonical structural fixture: two activities in one journey.
//  - act-1: two executing roles (role-early wins by createdAt; role-tie
//    shares role-early's createdAt but loses the id tiebreak), one
//    system, two locations (loc-early wins).
//  - act-2: no roles (persona falls back to "user"), no locations.
const ROLE_EARLY = { id: "0197a000-0000-7000-8000-00000000r001", name: "Store Associate", createdAt: "2026-01-01T00:00:00.000Z" };
const ROLE_TIE = { id: "0197a000-0000-7000-8000-00000000r999", name: "Shift Lead", createdAt: "2026-01-01T00:00:00.000Z" };
const ROLE_LATE = { id: "0197a000-0000-7000-8000-00000000r000", name: "Manager", createdAt: "2026-02-01T00:00:00.000Z" };
const LOC_EARLY = { id: "0197a000-0000-7000-8000-00000000l001", name: "Front Register", createdAt: "2026-01-01T00:00:00.000Z" };
const LOC_LATE = { id: "0197a000-0000-7000-8000-00000000l002", name: "Back Office", createdAt: "2026-03-01T00:00:00.000Z" };
const SYS = { id: "0197a000-0000-7000-8000-00000000s001", name: "POS", createdAt: "2026-01-01T00:00:00.000Z" };
const ACT_1 = { id: "0197a000-0000-7000-8000-00000000a001", name: "scan items", createdAt: "2026-01-01T00:00:00.000Z" };
const ACT_2 = { id: "0197a000-0000-7000-8000-00000000a002", name: "print receipt", createdAt: "2026-01-02T00:00:00.000Z" };

const structural: DeriveActivityInput[] = [
  {
    activity: ACT_1,
    roles: [ROLE_LATE, ROLE_TIE, ROLE_EARLY], // deliberately shuffled — server sorts
    systems: [SYS],
    locations: [LOC_LATE, LOC_EARLY],
    journeyName: JOURNEY_NAME,
  },
  {
    activity: ACT_2,
    roles: [],
    systems: [],
    locations: [],
    journeyName: JOURNEY_NAME,
  },
];

// JourneyData projection of the SAME fixture. Index-0 of roles/
// locations = the server's createdAt-then-id pick (ROLE_EARLY,
// LOC_EARLY) — the coupling point.
const projected: JourneyData = {
  activities: [
    { id: ACT_1.id, name: ACT_1.name, column: 0 },
    { id: ACT_2.id, name: ACT_2.name, column: 1 },
  ],
  roles: [
    { id: ROLE_EARLY.id, name: ROLE_EARLY.name, columns: [0], durations: {} },
    { id: ROLE_TIE.id, name: ROLE_TIE.name, columns: [0], durations: {} },
    { id: ROLE_LATE.id, name: ROLE_LATE.name, columns: [0], durations: {} },
  ],
  systems: [{ id: SYS.id, name: SYS.name, usages: [{ column: 0 }] }],
  locations: [
    { id: LOC_EARLY.id, name: LOC_EARLY.name, columns: [0] },
    { id: LOC_LATE.id, name: LOC_LATE.name, columns: [0] },
  ],
  precedes: [{ from_col: 0, to_col: 1 }],
};

describe("story-spec-core AC-06 derivation parity (server ⇄ client)", () => {
  test("equal narrative strings per activity", () => {
    const server = deriveStories(structural);
    const client = formulateUserStories(projected, JOURNEY_NAME);
    expect(server.length).toBe(client.length);
    for (let i = 0; i < server.length; i++) {
      expect(server[i]!.narrative).toBe(client[i]!.narrative);
      expect(server[i]!.activityId).toBe(client[i]!.activityId);
    }
  });

  test("same primary role and location as the client's filtered[0]", () => {
    const server = deriveStories(structural);
    const client = formulateUserStories(projected, JOURNEY_NAME);
    expect(server[0]!.roleId).toBe(ROLE_EARLY.id);
    expect(server[0]!.roleId).toBe(client[0]!.roleId!);
    expect(server[0]!.roleName).toBe(client[0]!.roleName!);
    expect(server[0]!.locationId).toBe(LOC_EARLY.id);
    expect(server[0]!.locationId).toBe(client[0]!.locationId!);
    // No-role activity: both fall back to "user".
    expect(server[1]!.roleId).toBeUndefined();
    expect(client[1]!.roleId).toBeUndefined();
    expect(server[1]!.persona).toBe("user");
  });

  test("deterministic tiebreak (requirements B-02): equal createdAt → lowest id wins", () => {
    const server = deriveStories([
      { ...structural[0]!, roles: [ROLE_TIE, ROLE_EARLY] },
    ]);
    expect(server[0]!.roleId).toBe(ROLE_EARLY.id); // r001 < r999
  });

  test("orphan-activity fallback (requirements C-03): journeyName null → 'the workflow completes'", () => {
    const server = deriveStories([
      { activity: ACT_2, roles: [], systems: [], locations: [], journeyName: null },
    ]);
    expect(server[0]!.benefit).toBe("the workflow completes");
    expect(server[0]!.narrative).toBe(
      "As a user, I want to print receipt, so that the workflow completes.",
    );
  });
});
