import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

export function SmeQuarterly() {
  const domains = useFetch(() => api.listDomains(), []);
  return (
    <>
      <ViewHeader
        title="Quarterly sign-off"
        lede="Per-domain quarterly review status. Owned by process-explorer-ui — graph-core has no sign-off persistence; the table below is read-only."
      />
      <Card title="Domains awaiting sign-off">
        {domains.status === "loading" && <Loading what="domains" />}
        {domains.status === "error" && <ErrorState message={domains.error} />}
        {domains.status === "ok" && (
          <DataTable
            columns={[
              { id: "name",   label: "domain", kind: "text" },
              { id: "due",    label: "due", kind: "text" },
              { id: "status", label: "status", kind: "text" },
            ]}
            rows={domains.data.rows.map((d) => ({
              name: d.name,
              due: "Q2 2026",
              status: <Pill tone="warn">pending</Pill>,
            }))}
          />
        )}
      </Card>
    </>
  );
}
