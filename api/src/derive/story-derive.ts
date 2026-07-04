// story-spec-core T-04 (design §4.5, DD-01) — pure, I/O-free server-side
// story derivation: a faithful port of the client's
// `formulateUserStories` (pwa/src/lib/userStories.ts), XD-09.
//
// Placement: `api/src/derive/` — NOT `storage/` (which is reserved for
// Neo4j-touching modules). This module opens NO Neo4j session, so the
// AC-06 parity test stays unit-only (DD-01 / deviations D-5; the FR-08
// literal `storage/story-derive.ts` path is superseded — do not "fix"
// it back).
//
// Differences from the client, both sanctioned by requirements:
//  - Deterministic primary Role/Location selection: lowest `createdAt`,
//    then lowest `id` (requirements B-02 — replaces the client's
//    order-dependent `[0]`).
//  - Orphan-activity fallback: `journeyName === null` →
//    `benefit = "the workflow completes"` (requirements C-03 — the
//    derivation is total; the client always has a journeyName).

export interface DeriveNodeRef {
  id: string;
  name: string;
  createdAt: string;
}

export interface DeriveActivityInput {
  activity: DeriveNodeRef;
  roles: DeriveNodeRef[]; // via EXECUTES
  systems: DeriveNodeRef[]; // via USES_SYSTEM
  locations: DeriveNodeRef[]; // via AT_LOCATION
  journeyName: string | null; // parent UserJourney (per-activity, via PART_OF); null = orphan
}

export interface DerivedStory {
  activityId: string;
  persona: string;
  action: string;
  benefit: string;
  narrative: string;
  roleId?: string;
  roleName?: string;
  systemIds: string[];
  locationId?: string;
  locationName?: string;
}

// Deterministic primary selection (requirements B-02): lowest
// `createdAt`, ties broken by lowest `id`. Returns undefined on [].
function primary(candidates: DeriveNodeRef[]): DeriveNodeRef | undefined {
  let best: DeriveNodeRef | undefined;
  for (const c of candidates) {
    if (
      best === undefined ||
      c.createdAt < best.createdAt ||
      (c.createdAt === best.createdAt && c.id < best.id)
    ) {
      best = c;
    }
  }
  return best;
}

// Mirrors the client's goalPhrase(journeyName); the orphan fallback is
// the server-only totality case (requirements C-03).
function goalPhrase(journeyName: string | null): string {
  if (journeyName === null) return "the workflow completes";
  return `the ${journeyName.toLowerCase()} workflow completes`;
}

export function deriveStories(inputs: DeriveActivityInput[]): DerivedStory[] {
  const stories: DerivedStory[] = [];

  for (const input of inputs) {
    const primaryRole = primary(input.roles);
    const primaryLoc = primary(input.locations);

    const persona = primaryRole?.name ?? "user";
    const action = input.activity.name;
    const benefit = goalPhrase(input.journeyName);
    const narrative = `As a ${persona}, I want to ${action}, so that ${benefit}.`;

    const story: DerivedStory = {
      activityId: input.activity.id,
      persona,
      action,
      benefit,
      narrative,
      systemIds: input.systems.map((s) => s.id),
    };
    if (primaryRole) {
      story.roleId = primaryRole.id;
      story.roleName = primaryRole.name;
    }
    if (primaryLoc) {
      story.locationId = primaryLoc.id;
      story.locationName = primaryLoc.name;
    }
    stories.push(story);
  }

  return stories;
}
