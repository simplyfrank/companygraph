import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface LabelRow { label: string; count: number }

export function OntologyCatalog() {
  // Per-label counts. graph-core ships a closed registry of 6 labels;
  // ontology-manager unfreezes this into a CRUD-able catalog.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (n)
        WITH labels(n)[0] AS label, count(n) AS count
        RETURN label, count
        ORDER BY label
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Entity catalogue"
        lede="Every node label in the graph with its instance count. graph-core's registry is closed at 6 labels — ontology-manager unfreezes it."
      />
      <Card title="Labels">
        {data.status === "loading" && <Loading what="catalog" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "label",  label: "label",      kind: "text" },
              { id: "count",  label: "instances",  kind: "num", align: "right" },
              { id: "source", label: "source",     kind: "text" },
            ]}
            rows={(data.data.rows as unknown as LabelRow[]).map((r) => ({
              label: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{r.label}</code>,
              count: r.count,
              source: <Pill tone="accent">graph-core registry</Pill>,
            }))}
          />
        )}
      </Card>
    </>
  );
}
