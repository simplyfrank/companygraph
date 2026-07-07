// cross-function-exec-rollup T-14 (AC-18, FR-11/FR-13/FR-14, UX-06) — deep-link
// + reload e2e for #/exec/operator?function=sales. With the operator content
// seeded, navigate to the sliced route, reload → the same route renders
// OperatorCockpit sliced to Sales (persisted hash + shell active-model
// context); clearing the slice returns to all six functions.
//
// BLOCKED (recorded, not worked around): this spec depends on the
// #/exec/operator route resolving to OperatorCockpit, which requires the
// saas-operator-foundation-owned VIEWS/route registration (T-11). On this
// branch the navigation-IA restructure REMOVED the `exec`/`business` surfaces
// from SURFACES (committed tests business-routes.test.ts /
// business-placeholder.test.tsx assert their absence), so #/exec/operator
// aliases away and never reaches OperatorCockpit. route.ts / SURFACES /
// views/index.tsx are sole-owned by saas-operator-foundation (XD-05), so this
// spec cannot pass until that registration lands. It is skipped rather than
// deleted so AC-18's intent + repro are preserved for when T-11 unblocks.
//
// When unblocked: change `test.describe.skip` → `test.describe`, run the full
// stack (`bun run dev`) + `bun run seed:saas-operator`, and this asserts AC-18.

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test.describe.skip("exec/operator URL-first slice survives reload (AC-18) — BLOCKED on T-11 registration", () => {
  test("reload preserves ?function=sales; clearing returns to all six", async ({ page }) => {
    await page.goto(`${BASE}/#/exec/operator?function=sales`);
    // the cockpit renders sliced to Sales
    await expect(page.getByTestId("panel-kpis")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();
    // same route, same slice after reload
    await expect(page).toHaveURL(/#\/exec\/operator\?function=sales/);
    await expect(page.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // clearing the slice returns to all six functions
    await page.getByRole("button", { name: "All functions" }).click();
    await expect(page.getByRole("button", { name: "All functions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
