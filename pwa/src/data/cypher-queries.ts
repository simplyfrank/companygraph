// Consolidated read-only Cypher queries used by the read-path views
// and SME write-path resolvers. Per design §4.9 / §4.11 C-06: every
// ad-hoc Cypher string lives in this module so they are greppable and
// reviewable as one unit.
//
// All queries are READ-ONLY and pass through graph-core's
// `POST /api/v1/query/cypher` read-routing — no write keywords.

// FR-09 — activity multi-filter. AND-composed over system / role /
// location. LIMIT 1001 lets the API layer surface `result_truncated`
// when the 1000-row NFR-09 cap fires.
export const activityFilterAnd = `
  MATCH (a:Activity)
  WHERE ($systemId IS NULL OR EXISTS { (a)-[:USES_SYSTEM]->(:System {id: $systemId}) })
    AND ($roleId   IS NULL OR EXISTS { (:Role {id: $roleId})-[:EXECUTES]->(a) })
    AND ($locId    IS NULL OR EXISTS { (a)-[:AT_LOCATION]->(:Location {id: $locId}) })
  RETURN a.id AS id, a.name AS name, a.description AS description
  ORDER BY a.name ASC
  LIMIT 1001
`;

// FR-19 — review queue scoped to the operator's home domain. B-02 sweep-2
// fix: the needs_review predicate is pushed INTO the Cypher (regex against
// attributes_json), so the LIMIT 1001 truncates the actual needs-review set,
// not a broader set that the client-side filter would post-trim.
// C-09 fix: PART_OF*1..8 covers the full graph-core maxDepth ceiling so deeply
// nested Location→Location→…→Domain chains aren't silently excluded.
export const reviewQueueForDomain = `
  MATCH (n)
  WHERE n.attributes_json =~ '.*"_review"\\\\s*:\\\\s*\\\\{[^}]*"status"\\\\s*:\\\\s*"needs_review".*'
    AND (
      $homeDomainId IS NULL
      OR EXISTS {
        MATCH (n)-[:PART_OF*1..8]->(:Domain {id: $homeDomainId})
      }
    )
  RETURN n.id AS id, n.name AS name, labels(n)[0] AS label, n.attributes_json AS attrs, n.updatedAt AS updatedAt
  ORDER BY n.updatedAt DESC
  LIMIT 1001
`;

// FR-20 — resolve the role-name for a verifier so the journey header
// can render "Verified by '<role-name>' on <date>".
export const verifyingRoleName = `
  MATCH (r:Role {id: $roleId}) RETURN r.name AS name
`;

// FR-21 — out-of-domain advisory. Walks PART_OF up to depth 8 to find
// the Domain ancestor. Returns 0 rows for entities not under any
// Domain (in which case the hook treats the entity as in-home so write
// buttons remain enabled — the guard is advisory, not blocking).
export const homeDomainResolution = `
  MATCH (n {id: $id})-[:PART_OF*1..8]->(d:Domain)
  RETURN d.id AS domainId
  LIMIT 1
`;

// FR-22 — quarterly checklist. Lists all UserJourneys under the
// operator's home domain so the view can partition by `_verification.at`
// age client-side. LIMIT 1001 surfaces truncation.
export const quarterlyHomeJourneys = `
  MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id: $homeDomainId})
  RETURN j.id AS id, j.name AS name, j.description AS description, j.attributes_json AS attrs
  ORDER BY j.name ASC
  LIMIT 1001
`;

// Helper used by T-15a/T-15b canvas PathRow hydration (FR-10 / C-08
// fix). Hydrates node labels + names from id arrays in arbitrary
// order; the client re-orders the result via a Map to match the
// original id order.
export const hydrateNodesByIds = `
  MATCH (n) WHERE n.id IN $ids
  RETURN n.id AS id, labels(n)[0] AS label, n.name AS name
`;

// Companion to hydrateNodesByIds — resolves edge types from edge ids.
export const hydrateEdgesByIds = `
  MATCH ()-[r]->() WHERE r.id IN $ids
  RETURN r.id AS id, type(r) AS type
`;

// FR-06 — list all roles with activity counts. Used by Roles list view.
export const listRoles = `
  MATCH (r:Role)
  OPTIONAL MATCH (r)-[:EXECUTES]->(a:Activity)
  RETURN r.id AS id, r.name AS name, r.description AS description, count(a) AS activityCount
  ORDER BY r.name ASC
  LIMIT 1001
`;

// FR-06 — get a single role by id. Used by Roles detail view.
export const getRole = `
  MATCH (r:Role {id: $id})
  RETURN r.id AS id, r.name AS name, r.description AS description
  LIMIT 1
`;

// FR-07 — list all locations with activity counts and PART_OF hierarchy.
// Used by Locations list view.
export const listLocations = `
  MATCH (l:Location)
  OPTIONAL MATCH (l)-[:AT_LOCATION]->(a:Activity)
  OPTIONAL MATCH (l)-[:PART_OF]->(parent:Location)
  RETURN l.id AS id, l.name AS name, l.description AS description, count(a) AS activityCount, parent.name AS parentName
  ORDER BY l.name ASC
  LIMIT 1001
`;

// FR-07 — get a single location by id. Used by Locations detail view.
export const getLocation = `
  MATCH (l:Location {id: $id})
  RETURN l.id AS id, l.name AS name, l.description AS description
  LIMIT 1
`;
