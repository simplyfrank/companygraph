import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface SystemRow {
  system: { id: string; name: string; description: string };
  uses: number;
  integrations: number;
}

export function ExplorerSystems() {
  // One Cypher shot — list every System with its USES_SYSTEM in-degree and
  // INTEGRATES_WITH neighbour count.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (s:System)
        OPTIONAL MATCH (s)<-[u:USES_SYSTEM]-()
        WITH s, count(u) AS uses
        OPTIONAL MATCH (s)-[r:INTEGRATES_WITH]-(other:System)
        WITH s{.id, .name, .description} AS system, uses, count(DISTINCT other) AS integrations
        RETURN system, uses, integrations
        ORDER BY uses DESC, system.name ASC
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Systems"
        lede="Applications/systems in the architecture. The `uses` count is how many activities touch the system; `integrations` is the INTEGRATES_WITH out-degree."
      />
      <Card>
        {data.status === "loading" && <Loading what="systems" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "name",         label: "name", kind: "text" },
              { id: "description",  label: "description", kind: "text" },
              { id: "uses",         label: "uses", kind: "num", align: "right" },
              { id: "integrations", label: "integrations", kind: "num", align: "right" },
              { id: "id",           label: "id", kind: "id" },
            ]}
            rows={data.data.rows.map((r) => {
              const row = r as unknown as SystemRow;
              return {
                name: row.system.name,
                description: row.system.description,
                uses: row.uses,
                integrations: <Pill tone={row.integrations > 0 ? "accent" : "neutral"}>{row.integrations}</Pill>,
                id: row.system.id.slice(0, 8) + "…",
              };
            })}
          />
        )}
      </Card>
    </>
  );
}
