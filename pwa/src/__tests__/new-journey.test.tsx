import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SmeAdd } from "../views/sme/Add";

describe("New-journey form (T-12)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // SmeAdd mounts two useFetch calls concurrently: listDomains (GET) and
    // api.cypher for journeys (POST). Mock fetch to satisfy both in order.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("listDomains")) {
        return Promise.resolve(new Response(
          JSON.stringify({
            rows: [
              { id: "domain-1", name: "Retail" },
              { id: "domain-2", name: "Logistics" },
            ],
          }),
          { status: 200 },
        ));
      }
      // cypher endpoint — journeys list or import calls
      return Promise.resolve(new Response(
        JSON.stringify({ rows: [] }),
        { status: 200 },
      ));
    }) as typeof fetch;
  });

  test("opens modal when + New Journey button clicked", async () => {
    render(<SmeAdd />);
    const button = screen.getByText("+ New Journey");
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText("New Journey")).toBeInTheDocument();
    });
  });

  test("requires name and domain fields", async () => {
    render(<SmeAdd />);
    fireEvent.click(screen.getByText("+ New Journey"));
    await waitFor(() => {
      expect(screen.getByText("New Journey")).toBeInTheDocument();
    });

    // Submit button is disabled when name + domain fields are empty (T-12 validation)
    const submitButton = screen.getByText("Create Journey");
    expect(submitButton.closest("button")).toBeDisabled();
  });

  test("submits single POST to /import with UUIDv7-generated IDs", async () => {
    const importResponse = {
      nodes: [{ id: "some-uuid", label: "UserJourney", name: "Test Journey" }],
      edges: [{ id: "some-edge-uuid", type: "PART_OF" }],
      errors: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes("listDomains")) {
        return Promise.resolve(new Response(
          JSON.stringify({ rows: [{ id: "domain-1", name: "Retail" }] }),
          { status: 200 },
        ));
      }
      if (String(url).includes("import")) {
        return Promise.resolve(new Response(
          JSON.stringify(importResponse),
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }) as typeof fetch;

    render(<SmeAdd />);
    fireEvent.click(screen.getByText("+ New Journey"));
    await waitFor(() => {
      expect(screen.getByText("New Journey")).toBeInTheDocument();
    });

    // Fill form — wait for Retail option to appear in the domain select inside the modal
    await waitFor(() => {
      expect(screen.getByText("Retail")).toBeInTheDocument();
    });
    // The domain select is inside the modal, identified by its placeholder option
    const domainSelect = screen.getByDisplayValue("Select a domain…");
    fireEvent.change(domainSelect, { target: { value: "domain-1" } });

    const nameInput = screen.getByPlaceholderText("e.g. Order to Cash");
    fireEvent.change(nameInput, { target: { value: "Test Journey" } });

    const descInput = screen.getByPlaceholderText("Short description of this journey");
    fireEvent.change(descInput, { target: { value: "A test journey" } });

    // Submit button should be enabled now
    await waitFor(() => {
      expect(screen.getByText("Create Journey").closest("button")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("Create Journey"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/import",
        expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
      );
    });

    // Verify the payload structure
    const calls = fetchMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    const body = JSON.parse(String(lastCall?.[1]?.body));

    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0]).toMatchObject({
      label: "UserJourney",
      name: "Test Journey",
      description: "A test journey",
    });
    expect(body.nodes[0].id).toMatch(/^[0-9a-f-]{36}$/); // UUID format

    expect(body.edges).toHaveLength(1);
    expect(body.edges[0]).toMatchObject({
      type: "PART_OF",
      from: body.nodes[0].id,
      to: "domain-1",
    });

    fetchMock.mockRestore();
  });

  test("closes modal on successful creation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes("listDomains")) {
        return Promise.resolve(new Response(
          JSON.stringify({ rows: [{ id: "domain-1", name: "Retail" }] }),
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response(
        JSON.stringify({ nodes: [{ id: "journey-1", label: "UserJourney", name: "Test" }], edges: [], errors: [] }),
        { status: 200 },
      ));
    }) as typeof fetch;

    render(<SmeAdd />);
    fireEvent.click(screen.getByText("+ New Journey"));
    await waitFor(() => {
      expect(screen.getByText("New Journey")).toBeInTheDocument();
    });

    // Fill and submit — wait for domain option to render in modal
    await waitFor(() => {
      expect(screen.getByText("Retail")).toBeInTheDocument();
    });
    const domainSelect = screen.getByDisplayValue("Select a domain…");
    fireEvent.change(domainSelect, { target: { value: "domain-1" } });

    const nameInput = screen.getByPlaceholderText("e.g. Order to Cash");
    fireEvent.change(nameInput, { target: { value: "Test Journey" } });

    fireEvent.click(screen.getByText("Create Journey"));

    await waitFor(() => {
      expect(screen.queryByText("New Journey")).not.toBeInTheDocument();
    });
  });
});