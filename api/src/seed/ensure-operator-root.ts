// saas-operator-foundation T-05 (design §3.1, §4.1 — FR-01, FR-15, NFR-02,
// AC-01). Idempotent ensure of the "SaaS Operator" BusinessModel root.
//
// Rule A — compose, never fork: the create rides model-workspace-core's
// createModel storage call (imported, NEVER edited). Rule B — idempotency
// lives in this seed script, not in the owned-elsewhere handler: createModel
// server-generates the id and is non-idempotent, so a lookup-before-create
// guard keyed on the OQ-1 marker (name:"SaaS Operator" + attributes
// .saasOperatorRoot:true) makes a re-run a net-zero no-op.
//
// The root id is server-generated and discovered here — NEVER hard-coded. It
// is the operator-root handle every content spec + FunctionMap resolves.

import type { Driver } from "neo4j-driver";
import type { ModelRead } from "@companygraph/shared/schema/model-workspace";
import { createModel } from "../storage/models";

export const OPERATOR_ROOT_NAME = "SaaS Operator";
export const OPERATOR_ROOT_MARKER = "saasOperatorRoot"; // attributes.<marker>:true

interface ModelProps {
  id: string;
  name: string;
  description: string;
  ordinal: number;
  status: string;
  isReference: boolean;
  createdAt: string;
  updatedAt: string;
  attributes_json: string;
}

function toModelRead(props: ModelProps): ModelRead {
  return {
    id: props.id,
    name: props.name,
    description: props.description ?? "",
    ordinal: props.ordinal,
    status: (props.status ?? "active") as ModelRead["status"],
    isReference: props.isReference ?? false,
    moduleInstanceCount: 0,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    attributes: JSON.parse(props.attributes_json ?? "{}"),
  };
}

export async function ensureOperatorRoot(driver: Driver): Promise<ModelRead> {
  // 1. Lookup — match by name, then filter on the marker in TS (mirrors
  //    deserializeModel, models.ts:33; no APOC in the read).
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (m:BusinessModel {name: $name}) RETURN m`,
      { name: OPERATOR_ROOT_NAME },
    );
    for (const rec of result.records) {
      const props = (rec.get("m") as { properties: ModelProps }).properties;
      let attrs: Record<string, unknown> = {};
      try {
        attrs = JSON.parse(props.attributes_json ?? "{}");
      } catch {
        attrs = {};
      }
      if (attrs[OPERATOR_ROOT_MARKER] === true) {
        return toModelRead(props); // idempotent path — already ensured
      }
    }
  } finally {
    await session.close();
  }

  // 2. Create — non-reference; createModel server-assigns ordinal=max+1 and
  //    generates the id. Retail Model #1 (isReference:true, ordinal 1) is
  //    never matched by the name/marker key, so it is never mutated (NFR-02).
  return createModel(driver, {
    name: OPERATOR_ROOT_NAME,
    description:
      "The docorg vertical-SaaS operator (MOMS product + Helm control-plane) — coexists with retail Business Model #1.",
    attributes: { [OPERATOR_ROOT_MARKER]: true },
    isReference: false,
  });
}
