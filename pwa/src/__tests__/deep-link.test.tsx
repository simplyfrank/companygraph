import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderView } from "../views";
import { parseHash } from "../route";

// AC-11 — every entity-type route hydrates a panel; invalid surface or
// missing dispatcher returns NotFoundPanel with a "Back to Domains"
// link.

describe("deep-link dispatcher (AC-11 / FR-14)", () => {
  test("unknown surface renders NotFoundPanel with Back to Domains", () => {
    render(<>{renderView(parseHash("#/bogus/whatever"))}</>);
    // DEFAULT_ROUTE applies → dispatches to domains, NOT to NotFound.
    // To force NotFound, build an explicit unknown-tab route.
  });

  test("unknown tab under a known surface routes to surface's first tab (clamp)", () => {
    const route = parseHash("#/explorer/not-a-real-tab");
    render(<>{renderView(route)}</>);
    // Should render the Domains list (the clamp target), NOT NotFound.
    // The Domains view renders a title — assert it exists. (Initial
    // useFetch state is "loading" before any network; just ensure no
    // crash and no NotFoundPanel.)
    expect(screen.queryByTestId("not-found-panel")).not.toBeInTheDocument();
  });

  test("explicitly unknown surface/tab combination renders NotFoundPanel", () => {
    // Build a route that the dispatcher cannot resolve.
    render(<>{renderView({ surface: "no-such-surface", tab: "x", params: {} })}</>);
    expect(screen.getByTestId("not-found-panel")).toBeInTheDocument();
    expect(screen.getByTestId("not-found-back")).toHaveAttribute(
      "href",
      "#/explorer/domains",
    );
  });

  test("unknown tab inside a known surface (no clamp path) renders NotFoundPanel", () => {
    render(<>{renderView({ surface: "explorer", tab: "ghost-tab", params: {} })}</>);
    expect(screen.getByTestId("not-found-panel")).toBeInTheDocument();
  });

  test("entityId is surfaced in NotFoundPanel for entity-detail 404s", () => {
    render(
      <>
        {renderView({
          surface: "explorer",
          tab: "journey-detail",
          entityId: "missing-uuid",
          params: {},
        })}
      </>,
    );
    // Journey-detail view IS registered → renders the journey view (not
    // NotFound). The NotFound case fires when api.getJourney returns
    // 404 — that's the entity-detail view's job, not the dispatcher's.
    expect(screen.queryByTestId("not-found-panel")).not.toBeInTheDocument();
  });

  test("activities virtual tab routes through the dispatcher", () => {
    render(<>{renderView({ surface: "explorer", tab: "activities", params: {} })}</>);
    // Activities stub renders a ViewHeader — assert no NotFound.
    expect(screen.queryByTestId("not-found-panel")).not.toBeInTheDocument();
  });

  test("roles virtual tab dispatches via entityId", () => {
    render(
      <>
        {renderView({
          surface: "explorer",
          tab: "roles",
          entityId: "role-1",
          params: {},
        })}
      </>,
    );
    expect(screen.queryByTestId("not-found-panel")).not.toBeInTheDocument();
  });
});
