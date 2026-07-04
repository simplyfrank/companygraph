// Ontology proposal API routes — CRUD for LLM-generated ontology proposals.
//
// Following the pattern of compliance-rules.ts:
// - Input validation using Zod schemas + safeParse
// - Direct error(status, code, message, details) calls (not throwers)
// - Emission of ontology change events after mutations
// - Properly typed Request params on every handler

import { ontologyProposalSchema, ontologyProposalPatchSchema } from "@companygraph/shared/schema/ontology";
import { ontologyEvents } from "../ontology/events";
import {
  createOntologyProposal,
  getOntologyProposal,
  listOntologyProposals,
  patchOntologyProposal,
  deleteOntologyProposal,
} from "../ontology/storage/ontology-proposals";
import { ok, error, readJson } from "./_helpers";
import { getDriver } from "../neo4j/driver";

export async function handleOntologyProposals(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const sourceScope = url.searchParams.get("source_scope") || undefined;
  const status = url.searchParams.get("status") || undefined;

  try {
    const proposals = await listOntologyProposals(driver, sourceScope, status);
    return ok(proposals);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(500, "neo4j_unreachable", "Failed to list ontology proposals", { cause: message });
  }
}

export async function handleCreateOntologyProposal(req: Request): Promise<Response> {
  const driver = getDriver();
  const actor = "system"; // TODO: Get from auth context

  const body = await readJson(req);
  const parsed = ontologyProposalSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid ontology proposal payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const proposal = await createOntologyProposal(driver, parsed.data, actor);
  ontologyEvents.emit();
  return ok(proposal);
}

export async function handleOntologyProposal(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return error(400, "invalid_payload", "Missing proposal id");
  }

  const proposal = await getOntologyProposal(driver, id);
  if (!proposal) {
    return error(404, "not_found", "Ontology proposal not found");
  }
  return ok(proposal);
}

export async function handlePatchOntologyProposal(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const actor = "system"; // TODO: Get from auth context

  if (!id) {
    return error(400, "invalid_payload", "Missing proposal id");
  }

  const body = await readJson(req);
  const parsed = ontologyProposalPatchSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid ontology proposal patch payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const proposal = await patchOntologyProposal(driver, id, parsed.data, actor);
  ontologyEvents.emit();
  return ok(proposal);
}

export async function handleDeleteOntologyProposal(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const actor = "system"; // TODO: Get from auth context

  if (!id) {
    return error(400, "invalid_payload", "Missing proposal id");
  }

  await deleteOntologyProposal(driver, id, actor);
  ontologyEvents.emit();
  return ok({ success: true });
}
