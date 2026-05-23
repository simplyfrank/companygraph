# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canvas-perf.spec.ts >> Canvas performance (AC-24) >> canvas handles 50+ nodes without timeout
- Location: playwright/canvas-perf.spec.ts:49:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.react-flow')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('.react-flow')

```

```yaml
- banner:
  - text: companygraph
  - navigation:
    - link "Explorer 1":
      - /url: "#/explorer/domains"
    - link "Chat 2":
      - /url: "#/chat/thread"
    - link "Ontology 3":
      - /url: "#/ontology/catalog"
    - link "SME 4":
      - /url: "#/sme/review"
    - link "Analytics 5":
      - /url: "#/analytics/overview"
    - link "API 6":
      - /url: "#/api/endpoints"
    - link "Exec 7":
      - /url: "#/exec/ops"
    - link "Data 8":
      - /url: "#/data/map"
  - strong: "60"
  - text: nodes
  - strong: "125"
  - text: edges ontology
  - strong: v?
  - text: dev ok OP
- main:
  - navigation:
    - strong: Explorer
    - button "Domains"
    - button "Journey detail"
    - button "Journey graph"
    - button "Systems"
    - button "Path finder"
    - textbox /:
      - /placeholder: Search Explorer
    - text: /
    - button "Reload"
  - text: Process Explorer ·
  - link "journeys":
    - /url: "#/explorer/journey-graph"
  - text: ·
  - strong: Enrol Loyalty Member
  - text: DOMAIN
  - combobox "DOMAIN":
    - option "All domains" [selected]
    - option "Merchandising"
    - option "Store Operations"
    - option "Supply Chain"
    - option "Customer/CRM"
  - text: SUBDOMAIN
  - combobox "SUBDOMAIN" [disabled]:
    - option "— pick a domain first" [selected]
  - button "journey Enrol Loyalty Member ▾"
  - tablist "Layout":
    - tab "Chain" [selected]
    - tab "Radial"
  - group "Show bind types":
    - button "Roles" [pressed]
    - button "Systems" [pressed]
    - button "Locations" [pressed]
  - group "Zoom":
    - button "−"
    - button "100%"
    - button "+"
    - button "⤢"
  - img: ROLES ACTIVITIES SYSTEMS LOCATIONS 1 Capture Sign-… 2 Verify Identi… 3 Create Loyalt… 4 Send Welcome … Customer Se… CRM
  - strong: Activity
  - strong: Role
  - strong: System
  - strong: Location
  - strong: PRECEDES
  - strong: EXECUTES
  - strong: USES_SYSTEM
  - strong: AT_LOCATION
  - strong: SLA · ok
  - strong: SLA · warn
  - strong: SLA · breach
  - text: scroll · zoom · drag · pan · click · select
  - link "Open in list view →":
    - /url: "#/explorer/journey-detail?id=018f0000-0001-7000-8000-000000000401"
  - complementary:
    - heading "Journey" [level=3]
    - text: JOURNEY · CUSTOMER/CRM Enrol Loyalty Member
    - code: 018f0000-0001-7000-8000-000000000401
    - heading "Composition" [level=3]
    - term: activities
    - definition: "4"
    - term: roles
    - definition: "1"
    - term: systems
    - definition: "1"
    - term: locations
    - definition: "0"
    - term: edges
    - definition: "9"
    - term: hand-offs
    - definition: "0"
    - term: critical path
    - definition: 0s
    - heading "Cost / Run" [level=3]
    - term: USD / run
    - definition: $8.50
    - term: runs / month
    - definition: 12,400
    - term: USD / month
    - definition: $105,400
    - heading "SLA rollup" [level=3]
    - text: 0 ok 0 warn 0 breach
    - heading "Accountable" [level=3]
    - term: role
    - definition: VP Operations
    - term: id
    - definition:
      - code: r_vp_ops
    - text: Click a
    - strong: node
    - text: to focus it · drag the
    - strong: handle
    - text: beside an activity to reorder · scroll to zoom, drag empty space to pan.
  - strong: "6"
  - text: nodes ·
  - strong: "9"
  - text: edges ·
  - strong: "0"
  - text: SLA-bearing (0 ok · 0 warn · 0 breach) · read-only ✓ · no selection 018f0000-0001-7000-8000-000000000401 · /api/v1/journeys/018f0000-0001-7000-8000-000000000401/graph · cypher 0ms · render 0ms · zoom
  - strong: 100%
- button "Ask the graph (k)": Ask the graph k
```

# Test source

```ts
  1  | // T-19c: Playwright canvas performance (AC-24)
  2  | //
  3  | // Verifies that the JourneyGraph canvas maintains acceptable frame times:
  4  | // - Median frame time <= 16ms (60fps target)
  5  | 
  6  | import { test, expect } from "@playwright/test";
  7  | 
  8  | const BASE = "http://127.0.0.1:5173";
  9  | 
  10 | test.describe("Canvas performance (AC-24)", () => {
  11 |   test("canvas renders without excessive frame drops", async ({ page }) => {
  12 |     await page.goto(`${BASE}/#/explorer/journey-graph`);
  13 | 
  14 |     // Wait for canvas to render
  15 |     const canvas = page.locator(".react-flow");
  16 |     await expect(canvas).toBeVisible({ timeout: 10_000 });
  17 | 
  18 |     // Measure frame times over a 2-second window
  19 |     const frameTimes = await page.evaluate(async () => {
  20 |       const times: number[] = [];
  21 |       let last = performance.now();
  22 | 
  23 |       return new Promise<number[]>((resolve) => {
  24 |         let count = 0;
  25 |         const measure = (): void => {
  26 |           const now = performance.now();
  27 |           times.push(now - last);
  28 |           last = now;
  29 |           count++;
  30 |           if (count < 120) {
  31 |             requestAnimationFrame(measure);
  32 |           } else {
  33 |             resolve(times);
  34 |           }
  35 |         };
  36 |         requestAnimationFrame(measure);
  37 |       });
  38 |     });
  39 | 
  40 |     // Calculate median frame time
  41 |     const sorted = frameTimes.slice().sort((a, b) => a - b);
  42 |     const median = sorted[Math.floor(sorted.length / 2)];
  43 | 
  44 |     // Median frame time should be <= 33ms (30fps minimum acceptable)
  45 |     // In CI environments, 16ms (60fps) may not be achievable
  46 |     expect(median).toBeLessThan(33);
  47 |   });
  48 | 
  49 |   test("canvas handles 50+ nodes without timeout", async ({ page }) => {
  50 |     await page.goto(`${BASE}/#/explorer/journey-graph`);
  51 | 
  52 |     // Wait for canvas to render (generous timeout for large graphs)
  53 |     const canvas = page.locator(".react-flow");
> 54 |     await expect(canvas).toBeVisible({ timeout: 15_000 });
     |                          ^ Error: expect(locator).toBeVisible() failed
  55 | 
  56 |     // Verify the canvas rendered (no crash, no blank page)
  57 |     const viewportEl = page.locator(".react-flow__viewport");
  58 |     await expect(viewportEl).toBeVisible();
  59 |   });
  60 | });
  61 | 
```