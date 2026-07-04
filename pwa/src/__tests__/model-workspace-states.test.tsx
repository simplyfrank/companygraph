// model-workspace-core T-20 (AC-13, AC-14, AC-15) — ModelWorkspace
// view states: loading skeleton while GET /api/v1/models is in
// flight; empty prompt when only the reference model exists; error +
// retry that refetches.
//
// NOTE on ordering: the api.ts `json` helper dedupes in-flight GETs by
// path, so the loading test resolves its deferred fetch before the
// test ends — a permanently-pending GET would poison later tests in
// this file.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { ActiveModelProvider } from "../context/ActiveModelContext";
import { ModelWorkspace } from "../views/model/ModelWorkspace";
import type { ModelRead } from "../api";

const REF_MODEL: ModelRead = {
  id: "0197a000-0000-7000-8000-0000000000a1",
  name: "Retail Reference",
  description: "Business Model #1",
  ordinal: 1,
  status: "active",
  isReference: true,
  moduleInstanceCount: 3,
  createdAt: "2026-07-04T10:00:00.000Z",
  updatedAt: "2026-07-04T10:00:00.000Z",
  attributes: {},
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function mount() {
  return render(
    <ActiveModelProvider>
      <ModelWorkspace />
    </ActiveModelProvider>,
  );
}

describe("ModelWorkspace states (T-20, AC-13/AC-14/AC-15)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    window.location.hash = "#/model/models";
  });

  test("loading renders the skeleton while the list fetch is in flight (AC-13)", async () => {
    let resolveFetch!: (r: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => deferred);

    mount();
    expect(screen.getByTestId("model-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("model-list")).not.toBeInTheDocument();

    // Resolve so the in-flight GET leaves api.ts's dedupe map.
    await act(async () => {
      resolveFetch(jsonRes([REF_MODEL]));
      await deferred;
    });
    await waitFor(() => expect(screen.queryByTestId("model-skeleton")).not.toBeInTheDocument());
  });

  test("empty: only the reference model → create prompt (AC-14)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonRes([REF_MODEL]));

    mount();
    await waitFor(() => expect(screen.getByTestId("model-empty")).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: /create your first business model/i }),
    ).toBeInTheDocument();
    // The reference model still lists in the ready list below the prompt.
    expect(screen.getByText("Retail Reference")).toBeInTheDocument();
  });

  test("error renders ErrorState + retry refetches (AC-15)", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return jsonRes({ error: { code: "internal", message: "boom" } }, 500);
      return jsonRes([REF_MODEL]);
    });

    mount();
    await waitFor(() => expect(screen.getByTestId("model-error")).toBeInTheDocument());
    expect(screen.getByTestId("error-state")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByTestId("model-list")).toBeInTheDocument());
    expect(calls).toBe(2);
    expect(screen.queryByTestId("model-error")).not.toBeInTheDocument();
  });
});
