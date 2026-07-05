// requirements-export T-03 (FR-04, FR-05, FR-03) — Pure Markdown renderer.
// Hand-rolled deterministic string builder (OQ-2 pinned: no Markdown
// library, no new runtime dependency). Fixed section order, explicit
// escaping of Markdown-significant characters in every interpolated
// user-content field. No Date, no Math.random — same doc (modulo
// meta.generatedAt) → byte-identical Markdown (AC-04).

import type { SpecDocument } from "@companygraph/shared/schema/spec-export";

// ---------------------------------------------------------------------------
// Escaping (OQ-2 pinned)
// ---------------------------------------------------------------------------

export function escapeMarkdown(s: string): string {
  // Escape Markdown-significant characters. Pipe is escaped everywhere
  // (critical inside table cells). Newlines inside table cells are
  // replaced with <br> to avoid breaking the row.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/#/g, "\\#")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, " ");
}

function fmt(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "—";
  return escapeMarkdown(s);
}

// ---------------------------------------------------------------------------
// renderSpecMarkdown — pure function of the T-01 JSON document.
// ---------------------------------------------------------------------------

export function renderSpecMarkdown(doc: SpecDocument): string {
  const lines: string[] = [];

  // 1. Title + model summary header
  lines.push(`# ${escapeMarkdown(doc.model.name)} — Business Specification`);
  lines.push("");
  if (doc.model.description) {
    lines.push(escapeMarkdown(doc.model.description));
    lines.push("");
  }
  lines.push(`_Reference model: ${doc.model.isReference ? "yes" : "no"}_`);
  lines.push("");
  lines.push(`> Generated: ${doc.meta.generatedAt}`);
  lines.push("");

  // 2. User Stories
  lines.push("## User Stories");
  lines.push("");
  if (doc.meta.degraded?.stories) {
    lines.push(`*(section unavailable: ${escapeMarkdown(doc.meta.degraded.stories)})*`);
    lines.push("");
  } else if (doc.stories.length === 0) {
    lines.push("_No stories authored._");
    lines.push("");
  } else {
    for (const story of doc.stories) {
      lines.push(`### ${escapeMarkdown(story.name)}`);
      lines.push("");
      if (story.narrative) {
        lines.push(escapeMarkdown(story.narrative));
        lines.push("");
      }
      if (story.activityName) {
        lines.push(`**Activity:** ${escapeMarkdown(story.activityName)}`);
        lines.push("");
      }
      if (story.acceptanceCriteria.length > 0) {
        lines.push("**Acceptance Criteria:**");
        lines.push("");
        for (const ac of story.acceptanceCriteria) {
          lines.push(`${ac.ordinal}. **Given** ${escapeMarkdown(ac.given)}`);
          lines.push(`   **When** ${escapeMarkdown(ac.when)}`);
          lines.push(`   **Then** ${escapeMarkdown(ac.then)}`);
          lines.push("");
        }
      } else {
        lines.push("_No acceptance criteria._");
        lines.push("");
      }
    }
  }

  // 3. Key Activities
  lines.push("## Key Activities");
  lines.push("");
  if (doc.meta.degraded?.keyActivities) {
    lines.push(`*(section unavailable: ${escapeMarkdown(doc.meta.degraded.keyActivities)})*`);
    lines.push("");
  } else if (doc.keyActivities.length === 0) {
    lines.push("_No activities ranked._");
    lines.push("");
  } else {
    lines.push("| Rank | Name | Composite Score | Key Activity |");
    lines.push("|------|------|-----------------|--------------|");
    for (const a of doc.keyActivities) {
      const keyFlag = a.key?.marked ? "✓" : "";
      lines.push(
        `| ${a.rank} | ${escapeMarkdown(a.name)} | ${a.composite.toFixed(4)} | ${keyFlag} |`,
      );
    }
    lines.push("");
  }

  // 4. KPI Impact
  lines.push("## KPI Impact");
  lines.push("");
  if (doc.meta.degraded?.kpiImpact) {
    lines.push(`*(section unavailable: ${escapeMarkdown(doc.meta.degraded.kpiImpact)})*`);
    lines.push("");
  } else {
    if (doc.kpiImpact.matrix.length > 0) {
      lines.push("### Coverage Matrix");
      lines.push("");
      lines.push("| Activity | KPI | Direction | Strength |");
      lines.push("|----------|-----|-----------|----------|");
      for (const m of doc.kpiImpact.matrix) {
        lines.push(
          `| ${escapeMarkdown(m.activityName)} | ${escapeMarkdown(m.kpiName)} | ${escapeMarkdown(m.direction)} | ${m.strength.toFixed(4)} |`,
        );
      }
      lines.push("");
    } else {
      lines.push("_No KPI impact links._");
      lines.push("");
    }

    if (doc.kpiImpact.gaps.length > 0) {
      lines.push("### Gaps");
      lines.push("");
      for (const g of doc.kpiImpact.gaps) {
        lines.push(
          `- ${escapeMarkdown(g.activityName)} → ${escapeMarkdown(g.kpiName)}: ${escapeMarkdown(g.reason)}`,
        );
      }
      lines.push("");
    }

    lines.push("### Roll-up");
    lines.push("");
    const r = doc.kpiImpact.rollup;
    lines.push(`- Total links: ${r.totalLinks}`);
    lines.push(`- Covered KPIs: ${r.coveredKpis} / ${r.totalKpis}`);
    lines.push(`- Coverage ratio: ${(r.coverageRatio * 100).toFixed(1)}%`);
    lines.push("");
  }

  // 5. System Model
  lines.push("## System Model");
  lines.push("");
  if (doc.meta.degraded?.systemModel) {
    lines.push(`*(section unavailable: ${escapeMarkdown(doc.meta.degraded.systemModel)})*`);
    lines.push("");
  } else {
    if (doc.systemModel.capabilities.length > 0) {
      lines.push("### Capabilities");
      lines.push("");
      lines.push("| Name | Description | Needed By | Supporting Systems | Assigned Context |");
      lines.push("|------|-------------|-----------|--------------------|-----------------|");
      for (const c of doc.systemModel.capabilities) {
        lines.push(
          `| ${escapeMarkdown(c.name)} | ${fmt(c.description)} | ${c.neededByCount} | ${c.supportingSystemCount} | ${fmt(c.assignedContextName)} |`,
        );
      }
      lines.push("");
    } else {
      lines.push("_No capabilities authored._");
      lines.push("");
    }

    const gaps = doc.systemModel.gaps;
    if (
      gaps.unsupportedSteps.length > 0 ||
      gaps.capabilityGaps.length > 0 ||
      gaps.capabilitiesWithoutSystem.length > 0 ||
      gaps.orphanSystems.length > 0
    ) {
      lines.push("### Support Gaps");
      lines.push("");
      if (gaps.unsupportedSteps.length > 0) {
        lines.push(`- Unsupported steps: ${gaps.unsupportedSteps.length}`);
      }
      if (gaps.capabilityGaps.length > 0) {
        lines.push(`- Capability gaps: ${gaps.capabilityGaps.length}`);
      }
      if (gaps.capabilitiesWithoutSystem.length > 0) {
        lines.push(`- Capabilities without system: ${gaps.capabilitiesWithoutSystem.length}`);
      }
      if (gaps.orphanSystems.length > 0) {
        lines.push(`- Orphan systems: ${gaps.orphanSystems.length}`);
      }
      lines.push("");
    }

    if (doc.systemModel.contextMap.contexts.length > 0) {
      lines.push("### Context Map");
      lines.push("");
      for (const ctx of doc.systemModel.contextMap.contexts) {
        const ctxObj = ctx as Record<string, unknown>;
        const name = String(ctxObj.name ?? "");
        const domain = String(ctxObj.domain ?? "");
        lines.push(`- **${escapeMarkdown(name)}** (${escapeMarkdown(domain)})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
