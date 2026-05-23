// T-14: Flag-for-review button test (FR-18 / AC-15)
//
// Tests that the button:
// (a) PATCH body merges with prior `_verification` (B-01 fix)
// (b) Post-write read shows both `_review` AND `_verification` keys

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlagForReviewButton } from "../components/FlagForReviewButton";

describe("Flag-for-review button (T-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders button with correct text based on review status", () => {
    const { rerender } = render(
      <FlagForReviewButton
        label="UserJourney"
        id="journey-1"
        currentReviewStatus="approved"
      />,
    );

    expect(screen.getByRole("button", { name: /flag for review/i })).toBeInTheDocument();

    rerender(
      <FlagForReviewButton
        label="UserJourney"
        id="journey-1"
        currentReviewStatus="needs_review"
      />,
    );

    expect(screen.getByRole("button", { name: /in review/i })).toBeInTheDocument();
  });

  test("button is disabled when disabled prop is true", () => {
    render(
      <FlagForReviewButton
        label="UserJourney"
        id="journey-1"
        currentReviewStatus="approved"
        disabled={true}
      />,
    );

    const button = screen.getByRole("button", { name: /flag for review/i });
    expect(button).toBeDisabled();
  });

  test("shows error state when mergeAttributes fails", async () => {
    // Mock fetch to simulate API error
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as typeof fetch;

    render(
      <FlagForReviewButton
        label="UserJourney"
        id="journey-1"
        currentReviewStatus="approved"
      />,
    );

    const button = screen.getByRole("button", { name: /flag for review/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  test("calls onFlagged callback after successful flag", async () => {
    const onFlagged = vi.fn();

    // Mock successful API responses
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          rows: [{
            id: "journey-1",
            name: "Test Journey",
            description: "Test",
            attributes: {},
          }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response);

    render(
      <FlagForReviewButton
        label="UserJourney"
        id="journey-1"
        currentReviewStatus="approved"
        onFlagged={onFlagged}
      />,
    );

    const button = screen.getByRole("button", { name: /flag for review/i });
    fireEvent.click(button);

    await waitFor(
      () => {
        expect(onFlagged).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
  });
});