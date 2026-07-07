// funnel-pipeline-modeling T-11 (AC-20, FR-12, UX-06) — deep-link + reload e2e
// for the FunnelBoard route. Canonical route after the nav-IA restructure is
// #/insights/funnels (the former #/business surface was folded into #/insights).
//
// SKIPPED (test.describe.skip) — DEFERRED TO THE ORCHESTRATOR: this spec exercises
// the wired route, but the orchestrator owns route.ts / views/index.tsx and is
// reconciling all navigation centrally (it wires `funnels: <FunnelBoard/>` under
// the insights surface). Until that wiring lands, the #/insights/funnels route
// does not resolve to FunnelBoard, so this e2e cannot pass. The orchestrator runs
// this spec after wiring. Behaviour documented here for that run.
//
// Expected (AC-20, OQ-4 `must`): navigate to #/insights/funnels, select a funnel,
// reload → the same route re-renders FunnelBoard, the active model (SaaS-Operator
// root) is still the subject, and the in-view funnel selection RESETS to the
// picker (route + active-model survive reload; the finer in-view selection does
// not). Needs the full stack (`bun run dev`) + a seeded funnel.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";
const ROUTE = "#/insights/funnels";

test.describe.skip("AC-20: #/insights/funnels deep-link survives reload (orchestrator-run)", () => {
  test("reload re-renders FunnelBoard; selection resets to the picker", async ({ page }) => {
    await page.goto(`${BASE}/${ROUTE}`);
    await expect(page.getByRole("region", { name: "Funnel board" })).toBeVisible();

    // Select the first funnel in the picker.
    const picker = page.getByTestId("funnel-picker");
    await picker.selectOption({ index: 1 });
    await expect(page.getByTestId("funnel-stage-board")).toBeVisible();

    // Reload — the route + active-model survive; the in-view selection resets.
    await page.reload();
    await expect(page.getByRole("region", { name: "Funnel board" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp("insights/funnels"));
    // OQ-4 `must`: the in-view funnel selection resets to the picker default.
    await expect(page.getByTestId("funnel-picker")).toHaveValue("");
  });
});
