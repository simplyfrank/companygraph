import { Card } from "../../components/Card";
import { GreyBlock } from "../../components/GreyBlock";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { ViewHeader, SecLabel } from "../_shared";
import styles from "./Ai.module.css";

const SAMPLES = [
  {
    title: "Consolidate Pricing System + Merchandising System integrations",
    rationale: "Both feed POS; INTEGRATES_WITH degree of 2 on Pricing creates a redundant path for assortment-driven pricing.",
    impact: "remove 1 system, 2 edges",
    tone: "accent" as const,
  },
  {
    title: "Hoist 'Verify Identity' out of Enrol Loyalty",
    rationale: "Re-used by Process In-Store Return and Resolve Customer Complaint with identical inputs — extract to a shared sub-journey.",
    impact: "duplicate activity across 3 journeys",
    tone: "warn" as const,
  },
];

export function AnalyticsAi() {
  return (
    <>
      <ViewHeader
        title="AI optimisation recommendations"
        lede="Claude-generated proposals to consolidate systems, dedupe activities, or shorten journeys. Owned by cto-analytics — this is a static preview."
      />
      <SecLabel>Pending review</SecLabel>
      <div className={styles.list}>
        {SAMPLES.map((s, i) => (
          <Card key={i} title={s.title} actions={<Pill tone={s.tone}>{s.impact}</Pill>}>
            <p style={{ margin: "0 0 12px", color: "var(--muted)" }}>{s.rationale}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button tone="primary">Accept</Button>
              <Button tone="ghost">Reject</Button>
              <Button tone="ghost">Defer</Button>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <GreyBlock label="Live recommendations — wired by cto-analytics" height={120} />
      </div>
    </>
  );
}
