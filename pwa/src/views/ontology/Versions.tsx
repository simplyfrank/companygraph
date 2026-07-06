import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

// Live schema-version ledger from the ontology-manager registry. Each row is
// a recorded registry mutation (label/edge-type create/update); the newest is
// the active schema version.
export function OntologyVersions() {
  const data = useFetch(() => api.ontology.listVersions(), []);

  const rows =
    data.status === "ok"
      ? data.data.map((v, i) => ({
          v: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{v.version_id.slice(0, 8)}</code>,
          summary: v.summary,
          actor: v.actor,
          ts: v.ts,
          status: i === 0 ? <Pill tone="good">active</Pill> : <Pill tone="neutral">superseded</Pill>,
        }))
      : [];

  return (
    <>
      <ViewHeader
        title="Schema versions"
        lede="The ontology-manager version ledger — one entry per registry mutation, newest first. The top row is the active schema version."
      />
      <Card title="Versions">
        {data.status === "loading" && <Loading what="schema versions" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "v", label: "version", kind: "text" },
              { id: "summary", label: "summary", kind: "text" },
              { id: "actor", label: "actor", kind: "text" },
              { id: "ts", label: "timestamp", kind: "id" },
              { id: "status", label: "status", kind: "text" },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </>
  );
}
