// story-spec-core T-05/T-06/T-07 (design §4.1–§4.5) — dedicated
// storage for the UserStory / AcceptanceCriterion surface.
//
// Rules (design §1):
//  - Story/AC domain fields are TOP-LEVEL Neo4j properties written by
//    this module's own parameterized Cypher (DD-03); the generic
//    `createNode`/`patchNode` primitives stay byte-for-byte unchanged.
//  - Model scoping resolves THROUGH the story's DESCRIBES_ACTIVITY
//    activity's membership in `scopedNodeIds(driver, modelId)` (§3.4) —
//    consumed from model-workspace-core, never re-implemented.
//  - Model-existence gate (tasks C-06 pin): every exported function
//    first resolves `getModel(driver, modelId)` — miss throws the
//    existing `404 model_not_found` — BEFORE calling `scopedNodeIds`,
//    so an unknown model can never masquerade as a valid empty /
//    detached result.
//  - Two-shape membership gate (DD-11): detail/PATCH/DELETE (and the
//    AC routes' parent gate) distinguish (a) the story's activity
//    resolves but is ∉ scoped set → 404 story_not_found (cross-model
//    isolation), from (b) no activity resolves → DETACHED, the request
//    proceeds (repair access under any model route).
//  - `derived` clears on any hand edit, enforced HERE not in the route
//    (DD-05).

import type { Driver } from "neo4j-driver";
import type {
  StoryCreateInput,
  StoryPatchInput,
  StoryRead,
  AcCreateInput,
  AcPatchInput,
  AcRead,
  BootstrapResult,
} from "@companygraph/shared/schema/story-spec";
import { generateId } from "../ids";
import { ValidationError } from "../errors";
import { createEdge } from "./edges";
import { scopedNodeIds } from "./model-scope";
import { getModel } from "./models";
import { deriveStories, type DeriveActivityInput, type DeriveNodeRef } from "../derive/story-derive";

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

interface StoryProps {
  id: string;
  name: string;
  description: string;
  persona?: string | null;
  action?: string | null;
  benefit?: string | null;
  narrative?: string | null;
  derived?: boolean | null;
  sourceActivityId?: string | null;
  createdAt: string;
  updatedAt: string;
  attributes_json?: string | null;
}

interface AcProps {
  id: string;
  name: string;
  description: string;
  given: string;
  when: string;
  then: string;
  ordinal: number;
  derived?: boolean | null;
  createdAt: string;
  updatedAt: string;
  attributes_json?: string | null;
}

// The read boundary tolerates prop-less rows minted through the generic
// node route (C-07 pin — nullable derived props, accepted degrade).
function deserializeStory(
  props: StoryProps,
  join: {
    activityId: string | null;
    activityName: string | null;
    roleId: string | null;
    roleName: string | null;
    acCount: number;
    detached: boolean;
  },
): StoryRead {
  const row: StoryRead = {
    id: props.id,
    name: props.name ?? "",
    description: props.description ?? "",
    persona: props.persona ?? null,
    action: props.action ?? null,
    benefit: props.benefit ?? null,
    narrative: props.narrative ?? null,
    derived: props.derived ?? false,
    sourceActivityId: props.sourceActivityId ?? null,
    activityId: join.activityId,
    activityName: join.activityName,
    acCount: join.acCount,
    detached: join.detached,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    attributes: JSON.parse(props.attributes_json ?? "{}"),
  };
  if (join.roleId !== null) {
    row.roleId = join.roleId;
    row.roleName = join.roleName;
  }
  return row;
}

function deserializeAc(props: AcProps): AcRead {
  return {
    id: props.id,
    name: props.name ?? "",
    description: props.description ?? "",
    given: props.given,
    when: props.when,
    then: props.then,
    ordinal: props.ordinal,
    derived: props.derived ?? false,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    attributes: JSON.parse(props.attributes_json ?? "{}"),
  };
}

function assembleNarrative(persona: string, action: string, benefit: string): string {
  return `As a ${persona}, I want to ${action}, so that ${benefit}.`;
}

// ---------------------------------------------------------------------------
// Shared gates
// ---------------------------------------------------------------------------

// Model-existence gate (tasks C-06 pin) + scoped-set fetch. The scoped
// set is MIXED/UNLABELED (Domain/UserJourney/Activity/ModuleInstance) —
// the `:Activity` label in each query restricts the join; nothing is
// filtered JS-side (design §4.1 comment).
async function resolveModelScope(driver: Driver, modelId: string): Promise<string[]> {
  await getModel(driver, modelId); // 404 model_not_found on miss
  return [...(await scopedNodeIds(driver, modelId))];
}

// DD-08: the supplied activityId must resolve to an `:Activity` whose
// id ∈ the scoped set — one check covers "another model's activity" and
// "scoped id that is not an Activity".
async function assertActivityInScope(
  driver: Driver,
  scoped: string[],
  activityId: string,
  field: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (a:Activity {id: $activityId}) WHERE a.id IN $scoped RETURN a.id AS id`,
      { activityId, scoped },
    );
    if (r.records.length === 0) {
      throw new ValidationError("story_activity_not_in_model", { field, activityId }, 404);
    }
  } finally {
    await session.close();
  }
}

// DD-07: `Role` is a global reference node — existence + label only,
// NO model-membership check. Miss → the EXISTING generic `not_found`.
async function assertRoleExists(driver: Driver, roleId: string): Promise<void> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(`MATCH (r:Role {id: $roleId}) RETURN r.id AS id`, { roleId });
    if (r.records.length === 0) {
      throw new ValidationError("not_found", { field: "roleId", roleId }, 404);
    }
  } finally {
    await session.close();
  }
}

// Two-shape membership gate (DD-11, design §4.2). Returns the story's
// detached flag; throws 404 story_not_found when the story is absent or
// belongs (through a resolving activity) to another model.
async function gateStory(
  driver: Driver,
  scoped: string[],
  storyId: string,
): Promise<{ detached: boolean }> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // NOTE: `s.id` is a grouping key — without it, `collect()` over a
    // failed MATCH still yields one row (empty list) and an absent
    // story would masquerade as detached.
    const r = await session.run(
      `MATCH (s:UserStory {id: $storyId})
       OPTIONAL MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       RETURN s.id AS id, collect(a.id) AS activityIds`,
      { storyId },
    );
    const rec = r.records[0];
    if (!rec) throw new ValidationError("story_not_found", { storyId }, 404);
    const activityIds = (rec.get("activityIds") as Array<string | null>).filter(
      (id): id is string => typeof id === "string",
    );
    // Shape (b): no activity resolves at all → detached, proceed.
    if (activityIds.length === 0) return { detached: true };
    // Shape (a): at least one activity resolves — the story is attached;
    // it belongs under this model route iff ANY resolved target is in
    // the scoped set (a DD-12 fanout degrades to visibility, never to a
    // cross-model grant).
    if (!activityIds.some((id) => scoped.includes(id))) {
      throw new ValidationError("story_not_found", { storyId }, 404);
    }
    return { detached: false };
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Story reads (FR-05, §4.1)
// ---------------------------------------------------------------------------

const STORY_ROW_RETURN = `
  RETURN s,
         a.id AS activityId, a.name AS activityName, a IS NULL AS detached,
         r.id AS roleId, r.name AS roleName, count(DISTINCT ac) AS acCount`;

function rowFromRecord(rec: { get: (k: string) => unknown }): StoryRead {
  return deserializeStory((rec.get("s") as { properties: StoryProps }).properties, {
    activityId: (rec.get("activityId") as string | null) ?? null,
    activityName: (rec.get("activityName") as string | null) ?? null,
    roleId: (rec.get("roleId") as string | null) ?? null,
    roleName: (rec.get("roleName") as string | null) ?? null,
    acCount: rec.get("acCount") as number,
    detached: rec.get("detached") as boolean,
  });
}

// §4.1 list query — verbatim in shape. Detached rows are INCLUDED by
// design (DD-11 / deviations D-4): a detached story is
// model-unattributable and stays listed under any model's route until
// repaired. Do NOT re-narrow to an inner MATCH. Attached rows of other
// models stay excluded (AC-08).
export async function listStories(driver: Driver, modelId: string): Promise<StoryRead[]> {
  const scoped = await resolveModelScope(driver, modelId);
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (s:UserStory)
       OPTIONAL MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WITH s, a
       WHERE (a IS NOT NULL AND a.id IN $scoped)
          OR a IS NULL
       OPTIONAL MATCH (s)-[:STORY_FOR_ROLE]->(r:Role)
       OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
       ${STORY_ROW_RETURN}
       ORDER BY s.createdAt ASC`,
      { scoped },
    );
    return result.records.map(rowFromRecord);
  } finally {
    await session.close();
  }
}

// Internal single-row read (post-create/patch response body + detail).
async function readStoryRow(driver: Driver, storyId: string): Promise<StoryRead> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (s:UserStory {id: $storyId})
       OPTIONAL MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       OPTIONAL MATCH (s)-[:STORY_FOR_ROLE]->(r:Role)
       OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
       ${STORY_ROW_RETURN}`,
      { storyId },
    );
    const rec = result.records[0];
    if (!rec) throw new ValidationError("story_not_found", { storyId }, 404);
    return rowFromRecord(rec);
  } finally {
    await session.close();
  }
}

// Detail — two-shape gate, then row + embedded ACs ordered by ordinal
// ASC (§4.2). A detached story returns 200 with detached:true (the
// second real producer of detached:true, alongside the list).
export async function getStory(
  driver: Driver,
  modelId: string,
  storyId: string,
): Promise<StoryRead> {
  const scoped = await resolveModelScope(driver, modelId);
  await gateStory(driver, scoped, storyId);
  const row = await readStoryRow(driver, storyId);
  row.acceptanceCriteria = await readAcs(driver, storyId);
  return row;
}

// ---------------------------------------------------------------------------
// Story writes (FR-05, §4.2)
// ---------------------------------------------------------------------------

export async function createStory(
  driver: Driver,
  modelId: string,
  input: StoryCreateInput,
): Promise<StoryRead> {
  const scoped = await resolveModelScope(driver, modelId);
  await assertActivityInScope(driver, scoped, input.activityId, "activityId");
  if (input.roleId !== undefined) await assertRoleExists(driver, input.roleId);

  // Narrative is assembled server-side, never client-supplied (§3.1).
  const narrative = assembleNarrative(input.persona, input.action, input.benefit);
  const id = generateId();
  const now = new Date().toISOString();

  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (s:UserStory {
           id: $id, name: $name, description: $description,
           persona: $persona, action: $action, benefit: $benefit,
           narrative: $narrative, derived: false,
           sourceActivityId: $activityId,
           createdAt: $now, updatedAt: $now, attributes_json: $attrs
         })`,
        {
          id,
          name: narrative,
          description: input.description ?? "",
          persona: input.persona,
          action: input.action,
          benefit: input.benefit,
          narrative,
          activityId: input.activityId,
          now,
          attrs: JSON.stringify(input.attributes ?? {}),
        },
      ),
    );
  } finally {
    await session.close();
  }

  // Edge wiring rides the existing createEdge primitive — the
  // registry endpoint whitelist runs for free; ids are server-generated
  // UUIDv7 so the cross-type uniqueness pre-check short-circuits (DD-10).
  await createEdge(driver, { type: "DESCRIBES_ACTIVITY", fromId: id, toId: input.activityId });
  if (input.roleId !== undefined) {
    await createEdge(driver, { type: "STORY_FOR_ROLE", fromId: id, toId: input.roleId });
  }

  return readStoryRow(driver, id);
}

export async function patchStory(
  driver: Driver,
  modelId: string,
  storyId: string,
  patch: StoryPatchInput,
): Promise<StoryRead> {
  const scoped = await resolveModelScope(driver, modelId);
  // A detached story is patchable — re-point is the DD-11 repair path.
  await gateStory(driver, scoped, storyId);

  // Re-point validation happens BEFORE any write (DD-07/DD-08).
  if (patch.activityId !== undefined) {
    await assertActivityInScope(driver, scoped, patch.activityId, "activityId");
  }
  if (patch.roleId !== undefined) await assertRoleExists(driver, patch.roleId);

  const current = await readStoryRow(driver, storyId);

  // Re-assemble `narrative` when any of persona/action/benefit changed
  // (only when all three resolve — a prop-less C-07 row stays null-safe
  // until the repair PATCH supplies the missing fields).
  const persona = patch.persona ?? current.persona;
  const action = patch.action ?? current.action;
  const benefit = patch.benefit ?? current.benefit;
  const narrativeChanged =
    patch.persona !== undefined || patch.action !== undefined || patch.benefit !== undefined;
  const narrative =
    narrativeChanged && persona !== null && action !== null && benefit !== null
      ? assembleNarrative(persona, action, benefit)
      : null;

  // Dynamic SET — omitted fields untouched (mirrors patchNode); DD-05:
  // ALWAYS SET s.derived = false (an edit is an edit). Every re-point
  // also runs SET s.sourceActivityId in the SAME tx as its edge delete
  // (design §4.2, review C-03).
  const sets: string[] = ["s.updatedAt = $updatedAt", "s.derived = false"];
  const params: Record<string, unknown> = {
    storyId,
    updatedAt: new Date().toISOString(),
  };
  if (patch.persona !== undefined) {
    sets.push("s.persona = $persona");
    params.persona = patch.persona;
  }
  if (patch.action !== undefined) {
    sets.push("s.action = $action");
    params.action = patch.action;
  }
  if (patch.benefit !== undefined) {
    sets.push("s.benefit = $benefit");
    params.benefit = patch.benefit;
  }
  if (narrative !== null) {
    sets.push("s.narrative = $narrative", "s.name = $narrative");
    params.narrative = narrative;
  }
  if (patch.description !== undefined) {
    sets.push("s.description = $description");
    params.description = patch.description;
  }
  if (patch.attributes !== undefined) {
    sets.push("s.attributes_json = $attrsJson");
    params.attrsJson = JSON.stringify(patch.attributes);
  }
  if (patch.activityId !== undefined) {
    sets.push("s.sourceActivityId = $newActivityId");
    params.newActivityId = patch.activityId;
  }

  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      if (patch.activityId !== undefined) {
        // Re-point: drop the old edge(s) in the same tx as the
        // sourceActivityId SET; the new edge rides createEdge below.
        await tx.run(
          `MATCH (s:UserStory {id: $storyId})-[e:DESCRIBES_ACTIVITY]->() DELETE e`,
          { storyId },
        );
      }
      if (patch.roleId !== undefined) {
        await tx.run(
          `MATCH (s:UserStory {id: $storyId})-[e:STORY_FOR_ROLE]->() DELETE e`,
          { storyId },
        );
      }
      await tx.run(`MATCH (s:UserStory {id: $storyId}) SET ${sets.join(", ")}`, params);
    });
  } finally {
    await session.close();
  }

  if (patch.activityId !== undefined) {
    await createEdge(driver, {
      type: "DESCRIBES_ACTIVITY",
      fromId: storyId,
      toId: patch.activityId,
    });
  }
  if (patch.roleId !== undefined) {
    await createEdge(driver, { type: "STORY_FOR_ROLE", fromId: storyId, toId: patch.roleId });
  }

  return readStoryRow(driver, storyId);
}

// Single-transaction cascade (design §4.4): the story's ACs + all three
// edge types drop in ONE DETACH DELETE tx — no orphan ACs, no dangling
// edges. The story's Activity/Role are never in the DELETE list, so
// they survive (AC-05). A detached story is deletable under any model
// route (DD-11 repair).
export async function deleteStory(
  driver: Driver,
  modelId: string,
  storyId: string,
): Promise<void> {
  const scoped = await resolveModelScope(driver, modelId);
  await gateStory(driver, scoped, storyId);
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (s:UserStory {id: $storyId})
         OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
         DETACH DELETE ac, s`,
        { storyId },
      ),
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// AC CRUD (FR-06, §4.3)
// ---------------------------------------------------------------------------

async function readAcs(driver: Driver, storyId: string): Promise<AcRead[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s:UserStory {id: $storyId})
       RETURN ac ORDER BY ac.ordinal ASC`,
      { storyId },
    );
    return result.records.map((rec) =>
      deserializeAc((rec.get("ac") as { properties: AcProps }).properties),
    );
  } finally {
    await session.close();
  }
}

export async function listAcs(
  driver: Driver,
  modelId: string,
  storyId: string,
): Promise<AcRead[]> {
  const scoped = await resolveModelScope(driver, modelId);
  await gateStory(driver, scoped, storyId); // parent gate — 404 story_not_found on miss/cross-model
  return readAcs(driver, storyId);
}

export async function createAc(
  driver: Driver,
  modelId: string,
  storyId: string,
  input: AcCreateInput,
): Promise<AcRead> {
  const scoped = await resolveModelScope(driver, modelId);
  // Detached parent PROCEEDS — a detached story's ACs stay editable
  // during repair (DD-11 / design-review N-05).
  await gateStory(driver, scoped, storyId);

  const id = generateId();
  const now = new Date().toISOString();
  const session = driver.session();
  let props: AcProps;
  try {
    // `ordinal = coalesce(max(existing.ordinal), 0) + 1` allocated
    // in-tx when omitted (§4.3).
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (s:UserStory {id: $storyId})
         OPTIONAL MATCH (existing:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
         WITH coalesce(max(existing.ordinal), 0) + 1 AS next
         CREATE (ac:AcceptanceCriterion {
           id: $id, name: $name, description: "",
           given: $given, \`when\`: $when, \`then\`: $then,
           ordinal: coalesce($ordinal, next), derived: $derived,
           createdAt: $now, updatedAt: $now, attributes_json: "{}"
         })
         RETURN ac`,
        {
          storyId,
          id,
          name: `${input.when} → ${input.then}`,
          given: input.given,
          when: input.when,
          then: input.then,
          ordinal: input.ordinal ?? null,
          derived: false,
          now,
        },
      ),
    );
    props = (result.records[0]!.get("ac") as { properties: AcProps }).properties;
  } finally {
    await session.close();
  }

  await createEdge(driver, { type: "ACCEPTANCE_OF", fromId: id, toId: storyId });
  return deserializeAc(props);
}

// Membership check: the AC must be under the named story, else
// 404 acceptance_criterion_not_found (§4.3).
async function assertAcUnderStory(
  driver: Driver,
  storyId: string,
  acId: string,
): Promise<void> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (ac:AcceptanceCriterion {id: $acId})-[:ACCEPTANCE_OF]->(s:UserStory {id: $storyId})
       RETURN ac.id AS id`,
      { acId, storyId },
    );
    if (r.records.length === 0) {
      throw new ValidationError("acceptance_criterion_not_found", { storyId, acId }, 404);
    }
  } finally {
    await session.close();
  }
}

export async function patchAc(
  driver: Driver,
  modelId: string,
  storyId: string,
  acId: string,
  patch: AcPatchInput,
): Promise<AcRead> {
  const scoped = await resolveModelScope(driver, modelId);
  await gateStory(driver, scoped, storyId);
  await assertAcUnderStory(driver, storyId, acId);

  // Dynamic SET; DD-05: ALWAYS SET ac.derived = false. Reorder (FR-13)
  // is just a `{ordinal}` patch — no dedicated route.
  const sets: string[] = ["ac.updatedAt = $updatedAt", "ac.derived = false"];
  const params: Record<string, unknown> = { acId, updatedAt: new Date().toISOString() };
  if (patch.given !== undefined) {
    sets.push("ac.given = $given");
    params.given = patch.given;
  }
  if (patch.when !== undefined) {
    sets.push("ac.`when` = $when");
    params.when = patch.when;
  }
  if (patch.then !== undefined) {
    sets.push("ac.`then` = $then");
    params.then = patch.then;
  }
  if (patch.when !== undefined || patch.then !== undefined) {
    sets.push(
      "ac.name = coalesce($whenName, ac.`when`) + ' → ' + coalesce($thenName, ac.`then`)",
    );
    params.whenName = patch.when ?? null;
    params.thenName = patch.then ?? null;
  }
  if (patch.ordinal !== undefined) {
    sets.push("ac.ordinal = $ordinal");
    params.ordinal = patch.ordinal;
  }

  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(
        `MATCH (ac:AcceptanceCriterion {id: $acId}) SET ${sets.join(", ")} RETURN ac`,
        params,
      ),
    );
    return deserializeAc(
      (result.records[0]!.get("ac") as { properties: AcProps }).properties,
    );
  } finally {
    await session.close();
  }
}

export async function deleteAc(
  driver: Driver,
  modelId: string,
  storyId: string,
  acId: string,
): Promise<void> {
  const scoped = await resolveModelScope(driver, modelId);
  await gateStory(driver, scoped, storyId);
  await assertAcUnderStory(driver, storyId, acId);
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(`MATCH (ac:AcceptanceCriterion {id: $acId}) DETACH DELETE ac`, { acId }),
    );
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap (FR-09, §4.5, DD-02/DD-04/DD-08/DD-09)
// ---------------------------------------------------------------------------

interface NeighborhoodRow {
  activity: DeriveNodeRef;
  roles: DeriveNodeRef[];
  systems: DeriveNodeRef[];
  locations: DeriveNodeRef[];
  journeyName: string | null;
  hasStory: boolean;
}

// DD-02 starter-AC templates. Orphan activity (no parent journey) →
// article-free "the workflow" phrasing; no-role activity → "the user
// performs <activity>" (every clause template is total, FR-08).
function starterAc(
  journeyName: string | null,
  roleName: string | undefined,
  activityName: string,
): { given: string; when: string; then: string } {
  const journey = journeyName === null ? "workflow" : `${journeyName.toLowerCase()} workflow`;
  return {
    given: `the ${journey} preconditions are met`,
    when: `the ${roleName ?? "user"} performs ${activityName}`,
    then: `the ${journey} advances`,
  };
}

export async function bootstrapStories(
  driver: Driver,
  modelId: string,
  opts?: { activityIds?: string[] },
): Promise<BootstrapResult> {
  // C-06 gate — unknown model → 404 model_not_found, never a silent {0,0}.
  const scoped = await resolveModelScope(driver, modelId);

  // Optional `{activityIds}` narrowing — each must resolve to a scoped
  // `:Activity` of :modelId (DD-08, field "activityIds").
  const narrow = opts?.activityIds;
  if (narrow !== undefined) {
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (a:Activity) WHERE a.id IN $narrow AND a.id IN $scoped
         RETURN collect(a.id) AS ok`,
        { narrow, scoped },
      );
      const ok = new Set((r.records[0]?.get("ok") as string[]) ?? []);
      const bad = narrow.find((id) => !ok.has(id));
      if (bad !== undefined) {
        throw new ValidationError(
          "story_activity_not_in_model",
          { field: "activityIds", activityId: bad },
          404,
        );
      }
    } finally {
      await session.close();
    }
  }

  // Read the scoped activities + structural neighborhood. The scoped
  // set is passed WHOLE — the `:Activity` label does the restriction
  // (design §4.5 step 1). Pinned-module activities live in
  // snapshot_json, are not in scopedNodeIds, and count in NEITHER
  // created nor skipped (DD-09) — a pinned-only model yields {0,0}.
  const session = driver.session({ defaultAccessMode: "READ" });
  let rows: NeighborhoodRow[];
  try {
    const result = await session.run(
      `MATCH (a:Activity) WHERE a.id IN $scoped ${narrow !== undefined ? "AND a.id IN $narrow" : ""}
       OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
       WITH a, collect(DISTINCT r { .id, .name, .createdAt }) AS roles
       OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)
       WITH a, roles, collect(DISTINCT sys { .id, .name, .createdAt }) AS systems
       OPTIONAL MATCH (a)-[:AT_LOCATION]->(loc:Location)
       WITH a, roles, systems, collect(DISTINCT loc { .id, .name, .createdAt }) AS locations
       OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
       WITH a, roles, systems, locations, collect(j.name)[0] AS journeyName
       RETURN a { .id, .name, .createdAt } AS activity, roles, systems, locations, journeyName,
              EXISTS { MATCH (:UserStory)-[:DESCRIBES_ACTIVITY]->(a) } AS hasStory
       ORDER BY a.createdAt ASC`,
      narrow !== undefined ? { scoped, narrow } : { scoped },
    );
    rows = result.records.map((rec) => ({
      activity: rec.get("activity") as DeriveNodeRef,
      roles: rec.get("roles") as DeriveNodeRef[],
      systems: rec.get("systems") as DeriveNodeRef[],
      locations: rec.get("locations") as DeriveNodeRef[],
      journeyName: (rec.get("journeyName") as string | null) ?? null,
      hasStory: rec.get("hasStory") as boolean,
    }));
  } finally {
    await session.close();
  }

  // Skip rule (DD-04): any activity with ≥1 existing DESCRIBES_ACTIVITY
  // story is skipped — re-running never double-derives.
  const skippedRows = rows.filter((r) => r.hasStory);
  const candidates = rows.filter((r) => !r.hasStory);

  const inputs: DeriveActivityInput[] = candidates.map((r) => ({
    activity: r.activity,
    roles: r.roles,
    systems: r.systems,
    locations: r.locations,
    journeyName: r.journeyName,
  }));
  const derived = deriveStories(inputs);

  // Persist each candidate as an ORDINARY EDITABLE node (derived:true;
  // a later PATCH clears the flag — DD-05). Edge ids are
  // server-generated UUIDv7, so the cross-type uniqueness pre-check
  // never builds its scan (DD-10).
  for (const story of derived) {
    const input = candidates.find((c) => c.activity.id === story.activityId)!;
    const storyId = generateId();
    const now = new Date().toISOString();
    const writeSession = driver.session();
    try {
      await writeSession.executeWrite((tx) =>
        tx.run(
          `CREATE (s:UserStory {
             id: $id, name: $narrative, description: "",
             persona: $persona, action: $action, benefit: $benefit,
             narrative: $narrative, derived: true,
             sourceActivityId: $activityId,
             createdAt: $now, updatedAt: $now, attributes_json: "{}"
           })`,
          {
            id: storyId,
            persona: story.persona,
            action: story.action,
            benefit: story.benefit,
            narrative: story.narrative,
            activityId: story.activityId,
            now,
          },
        ),
      );
    } finally {
      await writeSession.close();
    }
    await createEdge(driver, {
      type: "DESCRIBES_ACTIVITY",
      fromId: storyId,
      toId: story.activityId,
    });
    if (story.roleId !== undefined) {
      await createEdge(driver, { type: "STORY_FOR_ROLE", fromId: storyId, toId: story.roleId });
    }

    // One derived starter AC per story (DD-02 recorded default).
    const clauses = starterAc(input.journeyName, story.roleName, story.action);
    const acId = generateId();
    const acSession = driver.session();
    try {
      await acSession.executeWrite((tx) =>
        tx.run(
          `CREATE (ac:AcceptanceCriterion {
             id: $id, name: $name, description: "",
             given: $given, \`when\`: $when, \`then\`: $then,
             ordinal: 1, derived: true,
             createdAt: $now, updatedAt: $now, attributes_json: "{}"
           })`,
          {
            id: acId,
            name: `${clauses.when} → ${clauses.then}`,
            given: clauses.given,
            when: clauses.when,
            then: clauses.then,
            now: new Date().toISOString(),
          },
        ),
      );
    } finally {
      await acSession.close();
    }
    await createEdge(driver, { type: "ACCEPTANCE_OF", fromId: acId, toId: storyId });
  }

  return { created: derived.length, skipped: skippedRows.length };
}
