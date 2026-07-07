// T-16b: Quarterly bulk sign-off (FR-22, FR-23 / AC-18, AC-19)
//
// Partitions journeys under the operator's home domain into "Overdue"
// (no _verification.at or > 90 days old) and "Current" (verified within
// 90 days). Bulk sign-off writes _verification to selected journeys via
// a single /api/v1/import call, preserving _review via RMW (B-01 fix).

import { useMemo, useState } from "react";
import { cypherDedup } from "../../data/reads";
import { quarterlyHomeJourneys } from "../../data/cypher-queries";
import { usePrefStore } from "../../store/prefStore";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { PieChartCard } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Quarterly.module.css";

interface JourneyRow {
  id: string;
  name: string;
  description: string;
  attrs: string;
}

interface ParsedJourney {
  id: string;
  name: string;
  description: string;
  verifiedAt: string | null;
  isOverdue: boolean;
}

function parseJourneys(rows: JourneyRow[]): ParsedJourney[] {
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  return rows.map((r) => {
    let attrs: Record<string, unknown> = {};
    try { attrs = JSON.parse(r.attrs) as Record<string, unknown>; } catch { /* */ }
    const verif = attrs._verification as { at?: string } | undefined;
    const verifiedAt = verif?.at ?? null;
    const isOverdue = !verifiedAt || verifiedAt < cutoff;
    return { id: r.id, name: r.name, description: r.description, verifiedAt, isOverdue };
  });
}

export function SmeQuarterly() {
  const homeDomainId = usePrefStore().homeDomainId;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOff, setSignedOff] = useState<Set<string>>(new Set());

  const data = useFetch(
    () => cypherDedup<JourneyRow>(quarterlyHomeJourneys, { homeDomainId: homeDomainId ?? null }),
    [homeDomainId],
  );

  const journeys = useMemo(() => {
    if (data.status !== "ok") return { overdue: [] as ParsedJourney[], current: [] as ParsedJourney[] };
    const parsed = parseJourneys(data.data.rows);
    return {
      overdue: parsed.filter((j) => j.isOverdue && !signedOff.has(j.id)),
      current: parsed.filter((j) => !j.isOverdue || signedOff.has(j.id)),
    };
  }, [data, signedOff]);

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOverdue = (): void => {
    setSelected(new Set(journeys.overdue.map((j) => j.id)));
  };

  const handleBulkSignOff = async (): Promise<void> => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);

    try {
      // 1. Read current attributes for each selected journey in parallel
      const ids = Array.from(selected);
      const responses = await Promise.all(
        ids.map((id) =>
          fetch(`/api/v1/nodes/UserJourney/${encodeURIComponent(id)}`).then((r) => r.json()),
        ),
      );

      // 2. Merge _verification into each, preserving existing attributes (B-01)
      const today = new Date().toISOString().slice(0, 10);
      const nodes = responses.map((body: { rows: Array<{ id: string; name: string; attributes: Record<string, unknown> }> }, i: number) => {
        const current = body.rows[0]?.attributes ?? {};
        return {
          id: ids[i],
          label: "UserJourney",
          name: body.rows[0]?.name ?? "",
          attributes: {
            ...current,
            _verification: {
              by: "operator",
              at: today,
            },
          },
        };
      });

      // 3. Single /import call
      await fetch("/api/v1/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes, edges: [] }),
      });

      setSignedOff((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!homeDomainId) {
    return (
      <>
        <ViewHeader
          title="Quarterly sign-off"
          lede="Bulk verification of journeys within your home domain. Set a home domain in Settings to begin."
        />
        <Card>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No home domain set. <a href="#/admin/settings">Go to Settings</a> to configure your home domain.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <ViewHeader
        title="Quarterly sign-off"
        lede="Journeys due for verification this quarter. Select overdue journeys and sign them off in bulk."
      />

      {error && (
        <div style={{ color: "var(--danger)", padding: "8px 0" }}>{error}</div>
      )}

      <div className={styles.dashboardGrid}>
        <PieChartCard
          title="Verification status"
          data={[
            { label: "current", value: journeys.current.length, color: "var(--good)" },
            { label: "overdue", value: journeys.overdue.length, color: "var(--danger)" },
          ]}
          donut
        />
      </div>

      <div style={{ height: 24 }} />

      <Card title={`Overdue (${journeys.overdue.length})`}>
        {data.status === "loading" && <Loading what="journeys" />}
        {data.status === "error" && <ErrorState message={data.error} />}
        {data.status === "ok" && journeys.overdue.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)" }}>All journeys are up to date.</p>
        )}
        {data.status === "ok" && journeys.overdue.length > 0 && (
          <>
            <div className={styles.actions}>
              <Button tone="ghost" onClick={selectAllOverdue} disabled={busy}>
                Select all
              </Button>
              <Button
                tone="primary"
                onClick={() => void handleBulkSignOff()}
                disabled={busy || selected.size === 0}
              >
                {busy ? "Signing off…" : `Sign off (${selected.size})`}
              </Button>
            </div>
            <ul className={styles.list}>
              {journeys.overdue.map((j) => (
                <li key={j.id} className={styles.row}>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={selected.has(j.id)}
                      onChange={() => toggleSelect(j.id)}
                      disabled={busy}
                    />
                    <span className={styles.name}>{j.name}</span>
                    {j.verifiedAt && (
                      <Pill tone="warn">last: {j.verifiedAt}</Pill>
                    )}
                    {!j.verifiedAt && <Pill tone="danger">never verified</Pill>}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title={`Current (${journeys.current.length})`}>
        {data.status === "ok" && journeys.current.length === 0 && (
          <p style={{ margin: 0, color: "var(--muted)" }}>No recently verified journeys.</p>
        )}
        {data.status === "ok" && journeys.current.length > 0 && (
          <ul className={styles.list}>
            {journeys.current.map((j) => (
              <li key={j.id} className={styles.row}>
                <span className={styles.name}>{j.name}</span>
                <Pill tone="good">verified {j.verifiedAt}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
