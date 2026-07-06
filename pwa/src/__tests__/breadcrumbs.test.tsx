import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { App } from "../App";
import { useTitleStore } from "../store/titleStore";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../store/schemaStore";
import { useHealthStore } from "../data/health";
import { toHash } from "../route";

// T-17 — breadcrumb rendering (design §4.7 / AC-15).
//
// The App shell computes a `crumbs` array from the active surface + tab
// (+ optional entityId name resolved via useTitleStore) and renders them
// inside `<nav aria-label="Breadcrumb">`. These tests verify the landmark,
// the label text, the crumb hrefs, and the entity-name resolution path.

function seedSchema(): void {
  useSchemaStore.setState({
    schema: STATIC_SCHEMA_FALLBACK,
    etag: null,
    fetchedAt: Date.now(),
    loading: false,
    error: null,
  });
}

function seedHealth(): void {
  useHealthStore.setState({
    connected: true,
    neo4jVersion: null,
    stats: { nodes: 0, edges: 0 },
    lastPolledAt: Date.now(),
  });
}

describe("App breadcrumbs (T-17 / AC-15)", () => {
  beforeEach(() => {
    seedSchema();
    seedHealth();
    useTitleStore.setState({ titles: {} });
    // Prevent health/schema polling from hitting the network.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "";
  });

  test("breadcrumb landmark nav is rendered", () => {
    window.location.hash = "#/explorer/domains";
    render(<App />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });

  test("surface label + tab label appear in breadcrumb text", () => {
    window.location.hash = "#/explorer/journeys";
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent).toContain("Explorer");
    expect(nav.textContent).toContain("Journeys");
  });

  test("surface crumb links to surface default tab; tab crumb links to current tab", () => {
    window.location.hash = "#/explorer/journeys";
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const links = nav.querySelectorAll("a");
    // First crumb → surface default tab (domains for explorer).
    expect(links[0]?.getAttribute("href")).toBe(toHash({ surface: "explorer", tab: "domains" }));
    // Second crumb → current tab.
    expect(links[1]?.getAttribute("href")).toBe(toHash({ surface: "explorer", tab: "journeys" }));
  });

  test("entity-name resolution: shows resolved name when titleStore has it", () => {
    window.location.hash = "#/explorer/domains/test-domain-id";
    useTitleStore.setState({ titles: { "test-domain-id": "Acme Domain" } });
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent).toContain("Acme Domain");
  });

  test("entity-name resolution: falls back to raw id when no title is cached", () => {
    window.location.hash = "#/explorer/domains/test-domain-id";
    useTitleStore.setState({ titles: {} });
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // The raw entityId is URL-decoded into the breadcrumb text.
    expect(nav.textContent).toContain("test-domain-id");
  });
});
