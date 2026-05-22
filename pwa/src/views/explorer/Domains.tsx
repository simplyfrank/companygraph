import type { Route } from "../../route";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { DomainCard } from "../../components/DomainCard";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Domains.module.css";

interface DomainStatRow {
  id: string;
  name: string;
  description: string;
  journeys: number;
  activities: number;
}

export function ExplorerDomains(_props: { route: Route }) {
  // Pull domains with their journey + activity counts in one shot.
  const domains = useFetch(
    () =>
      api.cypher(
        `MATCH (d:Domain)
         OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
         OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
         RETURN d.id AS id, d.name AS name, d.description AS description,
                count(DISTINCT j) AS journeys, count(DISTINCT a) AS activities
         ORDER BY d.name`,
      ),
    [],
  );

  return (
    <>
      <ViewHeader
        title="Domains"
        lede="Top-level business domains in the retail-process graph. Click a card to drop into its first journey's 3-lane graph."
      />
      {domains.status === "loading" && <Loading what="domains" />}
      {domains.status === "error" && <ErrorState message={domains.error} />}
      {domains.status === "ok" && (
        <div className={styles.grid}>
          {(domains.data.rows as unknown as DomainStatRow[]).map((d) => (
            <DomainCard
              key={d.id}
              domain={d}
              href={`#/explorer/journey-graph?domain=${encodeURIComponent(d.id)}`}
              counts={[
                { label: "journeys",   value: d.journeys },
                { label: "activities", value: d.activities },
                { label: "id",         value: d.id.slice(0, 8) + "…" },
              ]}
            />
          ))}
        </div>
      )}
    </>
  );
}
