import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";

// The 6-edge / per-label whitelist matrix from graph-core's
// EDGE_ENDPOINTS const. Hard-coded here because the registry is closed
// in graph-core; ontology-manager will replace this with a live read.
const ENDPOINTS: Array<{ type: string; from: string; to: string }> = [
  { type: "PART_OF",         from: "UserJourney", to: "Domain" },
  { type: "PART_OF",         from: "Activity",    to: "UserJourney" },
  { type: "PART_OF",         from: "Location",    to: "Location" },
  { type: "EXECUTES",        from: "Role",        to: "Activity" },
  { type: "USES_SYSTEM",     from: "Activity",    to: "System" },
  { type: "AT_LOCATION",     from: "Activity",    to: "Location" },
  { type: "PRECEDES",        from: "Activity",    to: "Activity" },
  { type: "INTEGRATES_WITH", from: "System",      to: "System" },
];

export function OntologyEdges() {
  return (
    <>
      <ViewHeader
        title="Edge endpoint matrix"
        lede="The frozen (type → fromLabel → toLabel) whitelist enforced by api/src/storage/edges.ts. ontology-manager unfreezes this into a live DB-backed registry."
      />
      <Card title="EDGE_ENDPOINTS">
        <DataTable
          columns={[
            { id: "type", label: "type", kind: "text" },
            { id: "from", label: "from label", kind: "text" },
            { id: "to",   label: "to label",   kind: "text" },
          ]}
          rows={ENDPOINTS.map((e) => ({
            type: <Pill tone="accent">{e.type}</Pill>,
            from: e.from,
            to: e.to,
          }))}
        />
      </Card>
    </>
  );
}
