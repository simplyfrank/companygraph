import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

// Live (type → fromLabel → toLabel) whitelist read from the ontology-manager
// registry. graph-core's original matrix was frozen; the registry now owns it,
// so this view reads the DB instead of mirroring a stale const.
export function OntologyEdges() {
  const data = useFetch(() => api.ontology.listEdgeTypes(), []);

  const rows =
    data.status === "ok"
      ? data.data.flatMap((e) =>
          (e.endpoints.length ? e.endpoints : [{ fromLabel: "—", toLabel: "—" }]).map((ep) => ({
            type: <Pill tone="accent">{e.name}</Pill>,
            from: ep.fromLabel,
            to: ep.toLabel,
          })),
        )
      : [];

  return (
    <>
      <ViewHeader
        title="Edge endpoint matrix"
        lede="The live (type → fromLabel → toLabel) whitelist from the ontology-manager registry, enforced by the edge-write validator in api/src/storage/edges.ts."
      />
      <Card title="EDGE_ENDPOINTS">
        {data.status === "loading" && <Loading what="edge types" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "type", label: "type", kind: "text" },
              { id: "from", label: "from label", kind: "text" },
              { id: "to", label: "to label", kind: "text" },
            ]}
            rows={rows}
          />
        )}
      </Card>
    </>
  );
}
