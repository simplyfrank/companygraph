// T-17 / B-03 sweep-2: Home-domain Settings surface (FR-21 writer)
//
// Allows the operator to set their home domain, which controls
// which entities show write buttons (advisory only, no server enforcement).

import { usePrefStore } from "../../store/prefStore";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { ViewHeader } from "../_shared";

export function SmeHome() {
  const home = usePrefStore().homeDomainId;
  const setHome = usePrefStore().setHomeDomain;

  const domains = useFetch(() => api.listDomains(), []);

  return (
    <>
      <ViewHeader
        title="Home domain"
        lede="Your home domain controls which entities show write buttons (Flag for review, Verify, Bulk sign-off). Entities outside your home domain stay read-only in the UI."
      />
      <Card>
        <label htmlFor="home-domain-select" style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>
          Home domain
        </label>
        <select
          id="home-domain-select"
          value={home ?? ""}
          onChange={(e) => setHome(e.target.value || null)}
          style={{ padding: "8px 12px", fontSize: 14, borderRadius: 4, border: "1px solid var(--border)", minWidth: 240 }}
        >
          <option value="">(none — all writes enabled)</option>
          {domains.status === "ok" &&
            domains.data.rows.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
        {home && domains.status === "ok" && (
          <p style={{ marginTop: 12, color: "var(--muted)" }}>
            Currently set: <strong>{domains.data.rows.find((d) => d.id === home)?.name ?? home}</strong>
          </p>
        )}
      </Card>
    </>
  );
}
