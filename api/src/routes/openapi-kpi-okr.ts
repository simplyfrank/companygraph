// kpi-okr-governance FR-12 / design §4.7 (DD-08) — OpenAPI coverage for
// the KPI/SLA/OKR/roll-down surface. Owned by kpi-okr-governance; wired
// into getOpenApiDoc() via a single sanctioned call in openapi.ts (§4.9).
//
// Every route in the design §5 table is registered here, generated from
// the SAME zod definitions the handlers parse with (no hand-maintained
// copy). Response shapes for computed payloads (trends, compliance,
// roll-down reads) are permissive records — the runtime shape is built
// from driver Records, not zod; the integration test packs pin them.

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  kpiSchema,
  slaSchema,
  kpiMeasurementSchema,
  slaBreachSchema,
  kpiAlignmentSchema,
  slaAlignmentSchema,
  kpiCreateRequestSchema,
  kpiPatchRequestSchema,
  slaCreateRequestSchema,
  slaPatchRequestSchema,
  kpiAlignmentCreateRequestSchema,
  slaAlignmentCreateRequestSchema,
  kpiTrendsQuerySchema,
  slaComplianceQuerySchema,
  listQuerySchema,
} from "@companygraph/shared/schema/kpi-sla";
import {
  createKpiMeasurementSchema,
} from "./kpi-measurements";
import {
  createSlaBreachSchema,
  updateSlaBreachSchema,
} from "./sla-breaches";
import {
  okrDirectiveCreateSchema,
  keyResultCreateSchema,
} from "./okr-crud";
import {
  kpiRollDownSchema,
  okrRollDownSchema,
  rollDownCommitSchema,
  rollDownAdjustmentSchema,
  kpiProductRollDownSchema,
  okrProductRollDownSchema,
  kpiProgramRollDownSchema,
  okrProgramRollDownSchema,
  approveRollDownSchema,
  rejectRollDownSchema,
  notifyRollDownSchema,
  slaDomainRollDownSchema,
} from "./roll-down";
import { errorEnvelopeSchema } from "./openapi";

// DEC-02 — the audit endpoints return this PLACEHOLDER shape (one
// synthetic row derived from node timestamps, user_id always "system").
// There is NO real audit trail behind them; documented honestly so
// downstream consumers do not assume one exists.
const auditPlaceholderRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
  action: z.literal("view"),
  user_id: z.literal("system"),
  timestamp: z.string(),
});

const permissiveRecord = z.record(z.unknown());
const permissiveArray = z.array(permissiveRecord);

export function registerKpiOkrPaths(registry: OpenAPIRegistry): void {
  // ── Schemas ────────────────────────────────────────────────────────
  // Documented READ shapes (DD-03 leniency gap: the create handlers
  // enforce presence + primitive type of required fields only; enum
  // membership beyond the as-built checks is NOT enforced at runtime —
  // stored values may be laxer than these documented shapes).
  registry.register("Kpi", kpiSchema);
  registry.register("Sla", slaSchema);
  registry.register("KpiMeasurement", kpiMeasurementSchema);
  registry.register("SlaBreach", slaBreachSchema);
  registry.register("KpiAlignment", kpiAlignmentSchema);
  registry.register("SlaAlignment", slaAlignmentSchema);
  // Request/query schemas — the ones the handlers actually parse with.
  registry.register("KpiCreateRequest", kpiCreateRequestSchema);
  registry.register("KpiPatchRequest", kpiPatchRequestSchema);
  registry.register("SlaCreateRequest", slaCreateRequestSchema);
  registry.register("SlaPatchRequest", slaPatchRequestSchema);
  registry.register("KpiAlignmentCreateRequest", kpiAlignmentCreateRequestSchema);
  registry.register("SlaAlignmentCreateRequest", slaAlignmentCreateRequestSchema);
  registry.register("KpiTrendsQuery", kpiTrendsQuerySchema);
  registry.register("SlaComplianceQuery", slaComplianceQuerySchema);
  registry.register("ListQuery", listQuerySchema);
  registry.register("KpiMeasurementCreateRequest", createKpiMeasurementSchema);
  registry.register("SlaBreachCreateRequest", createSlaBreachSchema);
  registry.register("SlaBreachUpdateRequest", updateSlaBreachSchema);
  registry.register("OkrDirectiveCreateRequest", okrDirectiveCreateSchema);
  registry.register("KeyResultCreateRequest", keyResultCreateSchema);
  registry.register("KpiRollDownRequest", kpiRollDownSchema);
  registry.register("OkrRollDownRequest", okrRollDownSchema);
  registry.register("RollDownCommitRequest", rollDownCommitSchema);
  registry.register("RollDownAdjustmentRequest", rollDownAdjustmentSchema);
  registry.register("KpiProductRollDownRequest", kpiProductRollDownSchema);
  registry.register("OkrProductRollDownRequest", okrProductRollDownSchema);
  registry.register("KpiProgramRollDownRequest", kpiProgramRollDownSchema);
  registry.register("OkrProgramRollDownRequest", okrProgramRollDownSchema);
  registry.register("RollDownApproveRequest", approveRollDownSchema);
  registry.register("RollDownRejectRequest", rejectRollDownSchema);
  registry.register("RollDownNotifyRequest", notifyRollDownSchema);
  registry.register("SlaDomainRollDownRequest", slaDomainRollDownSchema);
  registry.register("AuditPlaceholderRow", auditPlaceholderRowSchema);

  const err400 = {
    description: "validation error (details.issues[] envelope, FR-11b)",
    content: { "application/json": { schema: errorEnvelopeSchema } },
  };
  const err404 = {
    description: "not found",
    content: { "application/json": { schema: errorEnvelopeSchema } },
  };
  const jsonOk = (schema: z.ZodTypeAny, description = "ok") => ({
    description,
    content: { "application/json": { schema } },
  });
  const rowsOf = (schema: z.ZodTypeAny) => z.object({ rows: z.array(schema) });

  // ── KPI CRUD (FR-01, FR-10a, FR-13) ────────────────────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/kpis",
    description: "Create KPI (FR-01). Returns 200 (not 201) with the flat node properties; id is server-generated UUIDv7 (FR-14).",
    request: { body: { content: { "application/json": { schema: kpiCreateRequestSchema } } } },
    responses: { 200: jsonOk(kpiSchema, "created (200, pinned as-built)"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpis",
    description: "List KPIs (FR-10a) ordered created_at DESC. ?include_archived=true|1 includes archived rows.",
    responses: { 200: jsonOk(rowsOf(kpiSchema)) },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpis/{id}",
    description: "KPI resource (FR-13). Archived KPIs are returned — archived_at tells the caller.",
    responses: { 200: jsonOk(kpiSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/kpis/{id}",
    description: "Partial update over the documented allow-list (FR-01). 404 when missing or archived.",
    request: { body: { content: { "application/json": { schema: kpiPatchRequestSchema } } } },
    responses: { 200: jsonOk(kpiSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/kpis/{id}/archive",
    description: "Archive KPI (FR-13; replaces the retired POST /kpis/{id} overload, DEC-01). Second archive → 404.",
    responses: { 200: jsonOk(kpiSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpis/{id}/audit",
    description: "Audit log (FR-13). DEC-02 PLACEHOLDER: exactly one synthetic row built from node timestamps with user_id \"system\" — no real audit trail exists behind this endpoint.",
    responses: { 200: jsonOk(rowsOf(auditPlaceholderRowSchema)), 400: err400, 404: err404 },
  });

  // ── SLA CRUD (FR-05, FR-10b, FR-13) — mirror ───────────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/slas",
    description: "Create SLA (FR-05). Returns 200 (pinned as-built); UUIDv7 id (FR-14).",
    request: { body: { content: { "application/json": { schema: slaCreateRequestSchema } } } },
    responses: { 200: jsonOk(slaSchema, "created (200, pinned as-built)"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/slas",
    description: "List SLAs (FR-10b) ordered created_at DESC. ?include_archived=true|1 includes archived rows.",
    responses: { 200: jsonOk(rowsOf(slaSchema)) },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/slas/{id}",
    description: "SLA resource (FR-13). Archived SLAs are returned.",
    responses: { 200: jsonOk(slaSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/slas/{id}",
    description: "Partial update (FR-05). 404 when missing or archived.",
    request: { body: { content: { "application/json": { schema: slaPatchRequestSchema } } } },
    responses: { 200: jsonOk(slaSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/slas/{id}/archive",
    description: "Archive SLA (FR-13; replaces the retired POST /slas/{id} overload, DEC-01).",
    responses: { 200: jsonOk(slaSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/slas/{id}/audit",
    description: "Audit log (FR-13). DEC-02 PLACEHOLDER row shape — see /kpis/{id}/audit.",
    responses: { 200: jsonOk(rowsOf(auditPlaceholderRowSchema)), 400: err400, 404: err404 },
  });

  // ── KPI measurements (FR-02, Postgres-backed) ──────────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/kpi-measurements",
    description: "Record a KPI measurement (FR-02; Postgres kpi_measurements). 201 echoes the raw pg row — NUMERIC value is a STRING on the echo; the GETs parse it to a number.",
    request: { body: { content: { "application/json": { schema: createKpiMeasurementSchema } } } },
    responses: { 201: jsonOk(permissiveRecord, "created (raw pg row)"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpi-measurements",
    description: "List measurements for a KPI (FR-02). ?kpi_id= is required (400 without); limit/offset default 100/0.",
    responses: { 200: jsonOk(rowsOf(kpiMeasurementSchema)), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpi-measurements/{id}",
    description: "Single measurement (FR-02).",
    responses: { 200: jsonOk(kpiMeasurementSchema), 404: err404 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/kpi-measurements/{id}",
    description: "Delete measurement (FR-02).",
    responses: { 200: jsonOk(z.object({ deleted: z.literal(true) })), 404: err404 },
  });

  // ── SLA breaches (FR-06, Postgres-backed) ──────────────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/sla-breaches",
    description: "Record an SLA breach (FR-06; Postgres sla_breaches). resolution_status is forced to 'open' on create; severity enum enforced.",
    request: { body: { content: { "application/json": { schema: createSlaBreachSchema } } } },
    responses: { 201: jsonOk(slaBreachSchema, "created"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/sla-breaches",
    description: "List breaches (FR-06). ?sla_id= required; optional ?resolution_status= filter.",
    responses: { 200: jsonOk(rowsOf(slaBreachSchema)), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/sla-breaches/{id}",
    description: "Single breach (FR-06).",
    responses: { 200: jsonOk(slaBreachSchema), 404: err404 },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/sla-breaches/{id}",
    description: "Partial resolution update (FR-06). Empty body → 400 'no fields to update'. NOTE: the DB CHECK omits 'investigating' — the update schema mirrors the DB, not slaBreachSchema.",
    request: { body: { content: { "application/json": { schema: updateSlaBreachSchema } } } },
    responses: { 200: jsonOk(slaBreachSchema), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/sla-breaches/{id}",
    description: "Delete breach (FR-06).",
    responses: { 200: jsonOk(z.object({ deleted: z.literal(true) })), 404: err404 },
  });

  // ── KPI trends (FR-03 — reads Neo4j :KPIMeasurement nodes, V-02) ───
  registry.registerPath({
    method: "get", path: "/api/v1/kpi-trends/{kpiId}",
    description: "Trend payload (FR-03): linear-regression trend (slope per WEEK), moving average, z-score anomalies. Query params per KpiTrendsQuery. SPLIT-BRAIN (V-02): reads Neo4j :KPIMeasurement nodes, NOT the Postgres rows POST /kpi-measurements writes.",
    responses: { 200: jsonOk(permissiveRecord, "trend payload"), 400: err400, 404: err404 },
  });

  // ── Alignments (FR-04) ─────────────────────────────────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/kpi-alignments",
    description: "Create KPI alignment (FR-04). weight ∈ [0,1] enforced. alignment_id is a Neo4j elementId — an OPAQUE string, not a UUID.",
    request: { body: { content: { "application/json": { schema: kpiAlignmentCreateRequestSchema } } } },
    responses: { 200: jsonOk(permissiveRecord, "created"), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/kpi-alignments",
    description: "List KPI alignments (FR-04). ?target_type=&target_id= required. target_type 'domain' lists by the KPI's domain_id property, not edges (pinned as-built).",
    responses: { 200: jsonOk(rowsOf(permissiveRecord)), 400: err400 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/kpi-alignments/{id}",
    description: "Delete by raw elementId (FR-04) — send unencoded; the router does not URL-decode this segment.",
    responses: { 200: jsonOk(z.object({ deleted: z.literal(true) })), 404: err404 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/sla-alignments",
    description: "Create SLA alignment (FR-04). target_type journey|activity only.",
    request: { body: { content: { "application/json": { schema: slaAlignmentCreateRequestSchema } } } },
    responses: { 200: jsonOk(permissiveRecord, "created"), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/sla-alignments",
    description: "List SLA alignments (FR-04). ?target_type=&target_id= required.",
    responses: { 200: jsonOk(rowsOf(permissiveRecord)), 400: err400 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/sla-alignments/{id}",
    description: "Delete by raw elementId (FR-04).",
    responses: { 200: jsonOk(z.object({ deleted: z.literal(true) })), 404: err404 },
  });

  // ── SLA compliance (FR-07 — reads Neo4j :SLABreach nodes, V-02) ────
  registry.registerPath({
    method: "get", path: "/api/v1/sla-compliance/all",
    description: "Aggregate compliance across all unarchived SLAs (FR-07). SPLIT-BRAIN (V-02): reads Neo4j :SLABreach nodes, not Postgres.",
    responses: { 200: jsonOk(permissiveRecord), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/sla-compliance/{slaId}",
    description: "Per-SLA compliance rates, breach patterns, risk score (FR-07). ?window_days= per SlaComplianceQuery.",
    responses: { 200: jsonOk(permissiveRecord), 400: err400, 404: err404 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/sla-compliance/domain/{domainId}",
    description: "Domain-level compliance across the domain's SLAs (FR-07).",
    responses: { 200: jsonOk(permissiveRecord), 400: err400 },
  });

  // ── OKR directives + key results (FR-08, FR-10c) ───────────────────
  registry.registerPath({
    method: "post", path: "/api/v1/okr-directives",
    description: "Create OKR directive (FR-08). Returns the RAW neo4j Node serialization (pinned as-built) — read .properties.",
    request: { body: { content: { "application/json": { schema: okrDirectiveCreateSchema } } } },
    responses: { 200: jsonOk(permissiveRecord, "raw Node"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/okr-directives",
    description: "Without params (FR-10c): top-level directives (no domain_id in attributes_json — bug-compatible string-contains predicate) as {rows:[mapped]}, ordered createdAt DESC. With ?domain_id=/?product_id=: as-built filtered handlers returning a BARE ARRAY (substring match on attributes_json). The shape asymmetry is pinned.",
    responses: { 200: jsonOk(z.union([rowsOf(permissiveRecord), permissiveArray])) },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/okr-directives/{id}",
    description: "Patch directive (FR-08). Raw Node response.",
    request: { body: { content: { "application/json": { schema: okrDirectiveCreateSchema.partial() } } } },
    responses: { 200: jsonOk(permissiveRecord), 400: err400 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/okr-directives/{id}",
    description: "DETACH DELETE directive (FR-08). Returns {success:true} even for unknown ids (pinned as-built).",
    responses: { 200: jsonOk(z.object({ success: z.literal(true) })) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/key-results",
    description: "Create key result (FR-08). Raw Node response.",
    request: { body: { content: { "application/json": { schema: keyResultCreateSchema } } } },
    responses: { 200: jsonOk(permissiveRecord, "raw Node"), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/key-results",
    description: "List key results via HAS_KEY_RESULT (FR-08). ?directive_id= required. AS-BUILT DEFECT (pinned): each row's `attributes` is always {} — the mapper reads attributes_json off the Node object instead of .properties.",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "patch", path: "/api/v1/key-results/{id}",
    description: "Patch key result (FR-08).",
    request: { body: { content: { "application/json": { schema: keyResultCreateSchema.partial() } } } },
    responses: { 200: jsonOk(permissiveRecord), 400: err400 },
  });
  registry.registerPath({
    method: "delete", path: "/api/v1/key-results/{id}",
    description: "DETACH DELETE key result (FR-08). {success:true} even for unknown ids (pinned).",
    responses: { 200: jsonOk(z.object({ success: z.literal(true) })) },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/okr-performance",
    description: "Directive → key-result → KPI performance rows for ?domain_id= (FR-08).",
    responses: { 200: jsonOk(permissiveArray) },
  });

  // ── Roll-down (FR-09) — as-built, V-04 matcher shadow documented ───
  const rollDownCreated = jsonOk(
    z.object({ id: z.string().uuid(), status: z.string() }),
    "created (status pending)",
  );
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/kpi",
    description: "Batch KPI roll-down to domains (FR-09).",
    request: { body: { content: { "application/json": { schema: kpiRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/kpi",
    description: "KPI roll-down status (FR-09, as-built shape).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/kpi/{domainId}",
    description: "KPI roll-downs for a domain (FR-09). V-04: the literal path 'product'/'program' without a trailing id also matches this pattern — always use id-suffixed forms.",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/kpi/product",
    description: "KPI roll-down domain → products (FR-09).",
    request: { body: { content: { "application/json": { schema: kpiProductRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/kpi/product/{domainId}",
    description: "KPI product roll-down status by domain (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/kpi/program",
    description: "KPI roll-down program → products (FR-09).",
    request: { body: { content: { "application/json": { schema: kpiProgramRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/kpi/program/{programId}",
    description: "KPI program roll-down status (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/okr",
    description: "Batch OKR roll-down to domains (FR-09).",
    request: { body: { content: { "application/json": { schema: okrRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/okr",
    description: "OKR roll-down status (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/okr/{domainId}",
    description: "OKR roll-downs for a domain (FR-09). Same V-04 caveat as the KPI form.",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/okr/product",
    description: "OKR roll-down domain → products (FR-09).",
    request: { body: { content: { "application/json": { schema: okrProductRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/okr/product/{domainId}",
    description: "OKR product roll-down status by domain (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/okr/program",
    description: "OKR roll-down program → products (FR-09).",
    request: { body: { content: { "application/json": { schema: okrProgramRollDownSchema } } } },
    responses: { 200: rollDownCreated, 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/okr/program/{programId}",
    description: "OKR program roll-down status (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/sla/domain",
    description: "SLA roll-down domain → products (FR-09). 400 details use the standardized issues[] shape (DD-01 sanctioned change iii — the former e.flatten() shape is retired). Verifies domain/SLA/product existence → 422 on miss.",
    request: { body: { content: { "application/json": { schema: slaDomainRollDownSchema } } } },
    responses: {
      200: jsonOk(z.object({ id: z.string().uuid(), status: z.literal("created") })),
      400: err400,
      422: { description: "referenced domain/SLA/product not found", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/sla/domain/{domainId}",
    description: "SLA domain roll-down status (FR-09).",
    responses: { 200: jsonOk(permissiveArray), 400: err400 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/commit",
    description: "Domain commits/rejects a roll-down assignment (FR-09). AS-BUILT (pinned): roll_down_id is matched against the ASSIGNMENT id; always returns {success:true}.",
    request: { body: { content: { "application/json": { schema: rollDownCommitSchema } } } },
    responses: { 200: jsonOk(z.object({ success: z.literal(true) })), 400: err400 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/adjustment",
    description: "Domain requests target adjustments (FR-09).",
    request: { body: { content: { "application/json": { schema: rollDownAdjustmentSchema } } } },
    responses: { 200: jsonOk(z.object({ success: z.literal(true) })), 400: err400 },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/contributions",
    description: "Contribution analytics (FR-09). AS-BUILT DEFECT (pinned, flagged): the query is invalid Cypher (RETURN…WITH…RETURN) and this endpoint returns 500 neo4j_unreachable. Use the by-domain form.",
    responses: {
      500: { description: "as-built Cypher syntax error", content: { "application/json": { schema: errorEnvelopeSchema } } },
    },
  });
  registry.registerPath({
    method: "get", path: "/api/v1/roll-down/contributions/{domainId}",
    description: "Contributions for a domain (FR-09).",
    responses: { 200: jsonOk(permissiveArray) },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/approve",
    description: "Approve a roll-down assignment (FR-09).",
    request: { body: { content: { "application/json": { schema: approveRollDownSchema } } } },
    responses: { 200: jsonOk(z.object({ status: z.literal("approved") })), 400: err400 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/reject",
    description: "Reject a roll-down assignment (FR-09).",
    request: { body: { content: { "application/json": { schema: rejectRollDownSchema } } } },
    responses: { 200: jsonOk(z.object({ status: z.literal("rejected") })), 400: err400 },
  });
  registry.registerPath({
    method: "post", path: "/api/v1/roll-down/notify",
    description: "Send a roll-down notification (FR-09).",
    request: { body: { content: { "application/json": { schema: notifyRollDownSchema } } } },
    responses: { 200: jsonOk(z.object({ id: z.string().uuid(), status: z.literal("sent") })), 400: err400 },
  });

  // ── Domains list (FR-10d) ──────────────────────────────────────────
  registry.registerPath({
    method: "get", path: "/api/v1/domains",
    description: "Domain rows ordered by name (FR-10d) — the resource-shaped list the exec views consume.",
    responses: {
      200: jsonOk(rowsOf(z.object({ id: z.string(), name: z.string(), description: z.string().nullable() }))),
    },
  });
}
