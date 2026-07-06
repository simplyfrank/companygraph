import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ConversationSummary, ConversationMessage } from "@companygraph/shared/types";
import { api } from "../api";
import { ChatConversations } from "../views/chat/Conversations";
import { AgentChat } from "../views/chat/AgentChat";

// AC-06 / AC-07 — ChatConversations states + resume deep-link.
//
// We spy on the real `api.chat` methods rather than `vi.mock`ing the
// module. This keeps the named-import bindings (e.g. `cleanup` from
// @testing-library/react) intact — `vi.mock`'s hoisting reorders
// imports and can null out sibling named imports in this toolchain.

describe("ChatConversations — list states (AC-06)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
  });
  afterEach(() => cleanup());

  test("Loading: renders a loading indicator while pending", () => {
    // Never-resolving promise keeps the component in the loading branch.
    vi.spyOn(api.chat, "listConversations").mockReturnValue(
      new Promise(() => {}),
    );
    render(<ChatConversations />);
    expect(screen.getByText(/Loading conversations/i)).toBeInTheDocument();
  });

  test("Empty: renders the empty-state copy when there are no rows", async () => {
    vi.spyOn(api.chat, "listConversations").mockResolvedValue({ rows: [] });
    render(<ChatConversations />);
    await waitFor(() => {
      expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument();
    });
  });

  test("Error: renders the error message when the request rejects", async () => {
    vi.spyOn(api.chat, "listConversations").mockRejectedValue(
      new Error("boom: 500 server down"),
    );
    render(<ChatConversations />);
    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
    // The humanized message should surface the failure to the user.
    expect(screen.getByTestId("error-state").textContent).toMatch(/server|boom/i);
  });

  test("Ready: renders rows with title and deterministic relative time", async () => {
    const fixedNow = new Date("2024-01-01T00:02:30.000Z").getTime();
    const clock = { now: () => fixedNow } as unknown as typeof Date;
    const rows: ConversationSummary[] = [
      { id: "c-1", created_at: "2024-01-01T00:00:00.000Z", last_message_at: "2024-01-01T00:00:00.000Z", title: "Warehouse SLA", role_id_pin: null },
      { id: "c-2", created_at: "2024-01-01T00:00:00.000Z", last_message_at: "2024-01-01T00:01:00.000Z", title: "Fulfillment gaps", role_id_pin: null },
      { id: "c-3", created_at: "2024-01-01T00:00:00.000Z", last_message_at: "2024-01-01T00:02:00.000Z", title: null, role_id_pin: null },
    ];
    vi.spyOn(api.chat, "listConversations").mockResolvedValue({ rows });
    render(<ChatConversations clock={clock} />);

    await waitFor(() => {
      expect(screen.getByText("Warehouse SLA")).toBeInTheDocument();
    });
    expect(screen.getByText("Fulfillment gaps")).toBeInTheDocument();
    // null title falls back to "Untitled".
    expect(screen.getByText("Untitled")).toBeInTheDocument();

    // 150s elapsed → "2m ago"; 90s → "1m ago"; 30s → "just now".
    expect(screen.getByText("2m ago")).toBeInTheDocument();
    expect(screen.getByText("1m ago")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
  });
});

describe("ChatConversations — resume navigation (AC-07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
  });
  afterEach(() => cleanup());

  test("clicking a conversation row targets the thread deep-link", async () => {
    const rows: ConversationSummary[] = [
      { id: "c-resume", created_at: "2024-01-01T00:00:00.000Z", last_message_at: "2024-01-01T00:00:00.000Z", title: "Resume me", role_id_pin: null },
    ];
    vi.spyOn(api.chat, "listConversations").mockResolvedValue({ rows });
    render(<ChatConversations />);

    const link = await screen.findByText("Resume me");
    const anchor = link.closest("a")!;
    // The anchor href encodes the conversation id into the hash route —
    // this is the navigation target a real browser would follow.
    expect(anchor.getAttribute("href")).toBe(
      "#/chat/thread?conversation=c-resume",
    );
    // Simulate the browser's default hash-navigation on click.
    fireEvent.click(link);
    window.location.hash = anchor.getAttribute("href")!;
    expect(window.location.hash).toBe("#/chat/thread?conversation=c-resume");
  });
});

describe("AgentChat — resume hydration (AC-07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("renders with conversationId and calls listMessages with the id", async () => {
    const spy = vi.spyOn(api.chat, "listMessages").mockResolvedValue({ rows: [] });
    render(<AgentChat conversationId="c-deeplink" />);
    await waitFor(() => {
      // AgentChat calls listMessages(propId) with a single argument.
      expect(spy).toHaveBeenCalledWith("c-deeplink");
    });
  });

  test("hydrates prior message history into the transcript", async () => {
    const history: ConversationMessage[] = [
      { id: "m-1", conversation_id: "c-hist", turn_index: 0, role: "user", content_text: "What domains exist?", role_id_used: null, created_at: "2024-01-01T00:00:00.000Z" },
      { id: "m-2", conversation_id: "c-hist", turn_index: 1, role: "assistant", content_text: "Three domains: Logistics, Catalog, Billing.", role_id_used: "graph_analyst", created_at: "2024-01-01T00:00:01.000Z" },
    ];
    vi.spyOn(api.chat, "listMessages").mockResolvedValue({ rows: history });
    render(<AgentChat conversationId="c-hist" />);
    await waitFor(() => {
      expect(screen.getByText("What domains exist?")).toBeInTheDocument();
    });
    expect(screen.getByText(/Three domains/)).toBeInTheDocument();
  });
});
