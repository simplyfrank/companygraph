// business-model-authoring T-01 (design §3.1–§3.3, §3.5) — REST-boundary
// zod shapes for the three authoring routes. NO new node label, edge
// type, or persisted schema is introduced here (NFR-01): these are
// request/response DTOs only — everything persisted is an instance of a
// label an upstream spec already registered.

import { z } from "zod";
import { uuidv7 } from "./nodes";

// A node row the wizard wants created or referenced. `clientKey` is a
// wizard-local handle (e.g. "j0", "a3", "role:cashier") used ONLY to
// wire edges within the same batch before the server has minted ids.
//
// Exactly one of three cases per row (DR-N-03 — mutually exclusive):
//   - neither `existingId` nor `id`  → NEW node: server mints a UUIDv7,
//     emits an import row, echoes the id (C-04).
//   - `existingId` set               → PICK-EXISTING global node (e.g. a
//     Role from the catalog, FR-05): NO import row emitted; clientKey
//     resolves to existingId for edge wiring.
//   - `id` set                       → RE-RUN of a previously minted
//     node: import row emitted WITH that id (MERGE-on-id upsert, C-04).
const authoringNodeSchema = z
  .object({
    clientKey: z.string().min(1),
    // NOT Domain — C-02 is enforced at the schema boundary: domains come
    // from mwc's POST /models/:id/domains, never from this endpoint.
    label: z.enum(["UserJourney", "Activity", "Role"]),
    name: z.string().min(1),
    description: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
    existingId: uuidv7.optional(),
    id: uuidv7.optional(),
  })
  .superRefine((row, ctx) => {
    if (row.existingId !== undefined && row.id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a node row cannot carry both existingId and id",
        path: ["existingId"],
      });
    }
  });

// An edge row addressed by clientKey OR an existing UUID on either end.
// `id` (optional) is the re-run case: reuse the previously echoed edge
// id. Domain/System/Location labels and USES_SYSTEM/AT_LOCATION/
// IN_MODEL/lifecycle edges are deliberately absent from the enums;
// wrong endpoint pairs surface as per-row
// `edge_endpoint_label_mismatch` from the registry validator, not as a
// zod reject.
const authoringEdgeSchema = z.object({
  type: z.enum(["PART_OF", "EXECUTES", "PRECEDES"]),
  from: z.string().min(1), // clientKey or existing UUID
  to: z.string().min(1), // clientKey or existing UUID
  id: uuidv7.optional(),
});

export const authoringApplySchema = z.object({
  nodes: z.array(authoringNodeSchema),
  edges: z.array(authoringEdgeSchema),
});
export type AuthoringApply = z.infer<typeof authoringApplySchema>;

// Response of POST …/authoring/apply (§3.2). `imported` + `errors` are
// realImport's shape verbatim (C-03); `errors[].index` refers to the
// CANONICAL assembled payload's row order (§4.3 step 4 — scope-rejected
// rows keep their canonical index; realImport's indexes are remapped).
// `details` carries the step-5 rejection shapes `{outOfModel:[…]}`
// (DD-07/DD-09) and `{labelMismatch:[…]}` (DR3-N-01) — it stays an open
// record, no dedicated schema per shape.
//
// `ids` (RR-N-04): the server-minted ids so the client can resubmit the
// exact UUIDv7s on a step re-run (C-04). Edge keys are the canonical
// "<type>:<from>-><to>" with the request tokens VERBATIM (DR-N-02).
// Ids are echoed for ALL rows INCLUDING failed/scope-rejected ones
// (DR2-C-03) — a retry with the echoed id MERGEs (create-on-absent).
export const authoringApplyResultSchema = z.object({
  imported: z.object({ nodes: z.number().int(), edges: z.number().int() }),
  errors: z
    .array(
      z.object({
        section: z.enum(["nodes", "edges"]),
        index: z.number().int(),
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  ids: z.object({
    // request row's clientKey -> UUIDv7 (existingId rows included,
    // mapped to their existingId, so every clientKey resolves).
    nodes: z.record(uuidv7),
    // canonical key "<type>:<from>-><to>" -> UUIDv7 (DR-N-02).
    edges: z.record(uuidv7),
  }),
});
export type AuthoringApplyResult = z.infer<typeof authoringApplyResultSchema>;

// The read route's response (§3.3) — id-based ONLY; no column math on
// the server (DD-05 — columns are the client mapper toJourneyData's job).
export const authoringGraphSchema = z.object({
  journeys: z.array(
    z.object({
      id: uuidv7,
      name: z.string(),
      domainId: uuidv7,
      // order: server-computed position — topological over the journey's
      // intra-journey PRECEDES chain; createdAt ascending for unordered ties.
      activities: z.array(
        z.object({ id: uuidv7, name: z.string(), order: z.number().int() }),
      ),
    }),
  ),
  roles: z.array(
    z.object({ id: uuidv7, name: z.string(), executesActivityIds: z.array(uuidv7) }),
  ),
  systems: z.array(
    z.object({ id: uuidv7, name: z.string(), usedByActivityIds: z.array(uuidv7) }),
  ),
  locations: z.array(
    z.object({ id: uuidv7, name: z.string(), activityIds: z.array(uuidv7) }),
  ),
  precedes: z.array(
    z.object({ fromActivityId: uuidv7, toActivityId: uuidv7 }),
  ),
});
export type AuthoringGraph = z.infer<typeof authoringGraphSchema>;

// PATCH …/domains/:domainId body (§3.5, DD-08) — deliberately narrow:
// name/description only, no `attributes` (avoids re-stating graph-core's
// replace-the-whole-map PATCH semantic on a second surface), no
// id/label fields (path-addressed).
export const domainPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: "at least one of name/description is required",
  });
export type DomainPatch = z.infer<typeof domainPatchSchema>;
