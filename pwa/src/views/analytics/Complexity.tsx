import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface ComplexRow {
  journey: { id: string; name: string };
  activities: number;
  fanOut: number;
  fanIn: number;
}

export function AnalyticsComplexity() {
  // Per-journey cyclomatic-ish proxy: count activities, PRECEDES fan-out,
  // PRECEDES fan-in. The real complexity metrics (centrality, modularity)
  // are owned by cto-analytics.
  const data = useFetch(
    () =>
      api.cypher(`
        MATCH (j:UserJourney)
        OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
        WITH j, count(a) AS activities, collect(a) AS as
        UNWIND as AS a
        OPTIONAL MATCH (a)-[fo:PRECEDES]->(:Activity)
        WITH j, activities, count(fo) AS fanOut, as
        UNWIND as AS a2
        OPTIONAL MATCH (a2)<-[fi:PRECEDES]-(:Activity)
        WITH j, activities, fanOut, count(fi) AS fanIn
        RETURN j{.id, .name} AS journey, activities, fanOut, fanIn
        ORDER BY activities DESC, j.name
        LIMIT 1001
      `),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Journey complexity"
        lede="Quick complexity proxy per journey — activity count + PRECEDES fan-in/out. Centrality, modularity, and redundancy live in the cto-analytics spec."
      />
      <Card>
        {data.status === "loading" && <Loading what="complexity" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && (
          <DataTable
            columns={[
              { id: "name",       label: "journey", kind: "text" },
              { id: "activities", label: "activities", kind: "num", align: "right" },
              { id: "fanOut",     label: "fan-out", kind: "num", align: "right" },
              { id: "fanIn",      label: "fan-in", kind: "num", align: "right" },
              { id: "score",      label: "score", kind: "text" },
              { id: "id",         label: "id", kind: "id" },
            ]}
            rows={(data.data.rows as unknown as ComplexRow[]).map((r) => {
              const score = r.activities + r.fanOut + r.fanIn;
              const tone = score > 8 ? "warn" : score > 4 ? "accent" : "good";
              return {
                name: r.journey.name,
                activities: r.activities,
                fanOut: r.fanOut,
                fanIn: r.fanIn,
                score: <Pill tone={tone}>{score}</Pill>,
                id: r.journey.id.slice(0, 8) + "…",
              };
            })}
          />
        )}
      </Card>
    </>
  );
}
