import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface RoleRow { role: { id: string; name: string }; activities: number }

export function ExecPeople() {
  // Roles and how many activities each executes — proxy for "what the
  // organisation does today". Owned by cto-analytics; this is a preview.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (r:Role)
        OPTIONAL MATCH (r)-[:EXECUTES]->(a:Activity)
        RETURN r{.id, .name} AS role, count(a) AS activities
        ORDER BY activities DESC, r.name
        LIMIT 1001
      `),
    [],
  );
  return (
    <>
      <ViewHeader
        title="People"
        lede="Roles in the organisation and the count of activities each EXECUTES."
      />
      <Card>
        {data.status === "loading" && <Loading what="roles" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "name",       label: "role", kind: "text" },
              { id: "activities", label: "activities", kind: "num", align: "right" },
              { id: "id",         label: "id", kind: "id" },
            ]}
            rows={(data.data.rows as unknown as RoleRow[]).map((r) => ({
              name: r.role.name,
              activities: r.activities,
              id: r.role.id.slice(0, 8) + "…",
            }))}
          />
        )}
      </Card>
    </>
  );
}
