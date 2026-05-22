import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";

export function OntologyVersions() {
  return (
    <>
      <ViewHeader
        title="Schema versions"
        lede="History of schema edits. Versioning is part of ontology-manager — graph-core today has exactly one (frozen) schema version."
      />
      <Card title="Versions">
        <DataTable
          columns={[
            { id: "v",      label: "version", kind: "text" },
            { id: "summary",label: "summary", kind: "text" },
            { id: "ts",     label: "timestamp", kind: "id" },
            { id: "status", label: "status", kind: "text" },
          ]}
          rows={[
            {
              v: "0.1.0",
              summary: "Initial six-label schema + six-edge whitelist.",
              ts: "2026-05-23",
              status: <Pill tone="good">active</Pill>,
            },
          ]}
        />
      </Card>
    </>
  );
}
