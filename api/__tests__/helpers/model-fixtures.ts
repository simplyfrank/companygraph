// Shared fixture helpers for the model-workspace-core integration
// tests. API-only setup (design §8, review B-02): model domains are
// created through POST /api/v1/models + POST /api/v1/models/:id/domains
// — never direct-driver seeding. Journey/activity/reference nodes ride
// the generic graph-core routes (non-lifecycle labels).

export const API_BASE = "http://127.0.0.1:8787/api/v1";
export const UUIDV7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface Cleanup {
  modelIds: string[];
  nodeIds: Array<{ label: string; id: string }>;
}

export function newCleanup(): Cleanup {
  return { modelIds: [], nodeIds: [] };
}

export async function runCleanup(c: Cleanup): Promise<void> {
  for (const id of c.modelIds) {
    await fetch(`${API_BASE}/models/${id}`, { method: "DELETE" });
  }
  for (const { label, id } of c.nodeIds) {
    await fetch(`${API_BASE}/nodes/${label}/${id}?cascade=true`, { method: "DELETE" });
  }
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text.length > 0 ? JSON.parse(text) : null) as T,
  };
}

export async function createNode(
  c: Cleanup,
  label: string,
  name: string,
  attributes: Record<string, unknown> = {},
): Promise<string> {
  const { status, body } = await api<{ id: string }>("POST", `/nodes/${label}`, {
    name,
    attributes,
  });
  if (status !== 201) throw new Error(`createNode ${label} ${name}: ${status} ${JSON.stringify(body)}`);
  c.nodeIds.push({ label, id: body.id });
  return body.id;
}

export async function createEdge(
  type: string,
  fromId: string,
  toId: string,
): Promise<void> {
  const { status, body } = await api("POST", "/edges", { type, fromId, toId });
  if (status !== 201) throw new Error(`createEdge ${type}: ${status} ${JSON.stringify(body)}`);
}

export interface JourneyFixture {
  modelId: string;
  domainId: string;
  journeyId: string;
  activityIds: [string, string]; // [first, second] wired first -PRECEDES-> second
  roleId: string;
  systemId: string;
  locationId: string;
}

// One model with one domain + a two-activity journey wired to shared
// Role/System/Location reference nodes.
export async function buildModelWithJourney(
  c: Cleanup,
  prefix: string,
): Promise<JourneyFixture> {
  const model = await api<{ id: string }>("POST", "/models", { name: `${prefix}-model` });
  if (model.status !== 201) throw new Error(`create model: ${model.status}`);
  c.modelIds.push(model.body.id);

  const domain = await api<{ id: string }>("POST", `/models/${model.body.id}/domains`, {
    name: `${prefix}-domain`,
  });
  if (domain.status !== 201) throw new Error(`attach domain: ${domain.status}`);

  const journeyId = await createNode(c, "UserJourney", `${prefix}-journey`);
  await createEdge("PART_OF", journeyId, domain.body.id);

  const a1 = await createNode(c, "Activity", `${prefix}-act-first`);
  const a2 = await createNode(c, "Activity", `${prefix}-act-second`);
  await createEdge("PART_OF", a1, journeyId);
  await createEdge("PART_OF", a2, journeyId);
  await createEdge("PRECEDES", a1, a2);

  const roleId = await createNode(c, "Role", `${prefix}-role`);
  const systemId = await createNode(c, "System", `${prefix}-system`, {
    systemKind: "functional",
  });
  const locationId = await createNode(c, "Location", `${prefix}-location`);
  await createEdge("EXECUTES", roleId, a1);
  await createEdge("USES_SYSTEM", a1, systemId);
  await createEdge("AT_LOCATION", a2, locationId);

  return {
    modelId: model.body.id,
    domainId: domain.body.id,
    journeyId,
    activityIds: [a1, a2],
    roleId,
    systemId,
    locationId,
  };
}
