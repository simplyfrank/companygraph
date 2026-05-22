import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";

interface Row { code: string; status: number; cause: string }

// Static — mirrors api/src/errors.ts ERROR_CODES + the routes that emit
// each one (per design.md §5.1).
const CODES: Row[] = [
  { code: "invalid_payload",              status: 400, cause: "zod validation failed on a request body" },
  { code: "unknown_label",                status: 400, cause: ":label URL param not in NODE_LABELS" },
  { code: "unknown_type",                 status: 400, cause: "edge type not in EDGE_TYPES (zod enum)" },
  { code: "edge_endpoint_missing",        status: 400, cause: "fromId or toId references no existing node" },
  { code: "edge_endpoint_label_mismatch", status: 400, cause: "(type, fromLabel, toLabel) not in EDGE_ENDPOINTS" },
  { code: "id_conflict",                  status: 409, cause: "createNode/createEdge with a duplicate id" },
  { code: "not_found",                    status: 404, cause: "GET/PATCH/DELETE targeted a missing id" },
  { code: "has_edges",                    status: 409, cause: "DELETE on a node with attached edges (use ?cascade=true)" },
  { code: "depth_exceeded",               status: 400, cause: "findPath/neighbors maxDepth > 8 (NFR-09)" },
  { code: "result_truncated",             status: 400, cause: "query exceeded the 1000-row cap (NFR-09)" },
  { code: "query_timeout",                status: 400, cause: "Cypher tx exceeded the 5 s timeout" },
  { code: "write_statement_rejected",     status: 400, cause: "POST /query/cypher with a write op (driver AccessMode error)" },
  { code: "parse_error",                  status: 400, cause: "POST /query/cypher with invalid Cypher syntax" },
  { code: "neo4j_unreachable",            status: 503, cause: "Neo4j connection down" },
];

const TONE: Record<number, "accent" | "warn" | "danger"> = {
  400: "warn", 404: "warn", 409: "warn", 503: "danger",
};

export function ApiErrors() {
  return (
    <>
      <ViewHeader
        title="Error codes"
        lede="Closed registry of every error code the API can emit. Mirrors api/src/errors.ts; the envelope.test.ts asserts exhaustive coverage."
      />
      <Card>
        <DataTable
          columns={[
            { id: "code",   label: "code", kind: "text" },
            { id: "status", label: "http", kind: "num", align: "right" },
            { id: "cause",  label: "cause", kind: "text" },
          ]}
          rows={CODES.map((c) => ({
            code: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.code}</code>,
            status: <Pill tone={TONE[c.status] ?? "neutral"}>{c.status}</Pill>,
            cause: c.cause,
          }))}
        />
      </Card>
    </>
  );
}
