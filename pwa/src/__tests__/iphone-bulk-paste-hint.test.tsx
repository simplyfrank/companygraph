// T-13b: iPhone Safari "open on desktop" hint test
//
// Tests that the bulk paste mobile stub renders correctly on phone viewports
// and that the Copy URL button works.

import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BulkPasteMobileStub } from "../components/BulkPasteMobileStub";

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

Object.assign(navigator, { clipboard: mockClipboard });

describe("iPhone bulk-paste hint (T-13b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock matchMedia to simulate phone viewport
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(max-width: 768px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  test("renders stub with Copy URL button on phone viewport", () => {
    render(
      <BulkPasteMobileStub journeyId="journey-1" journeyName="Order to Cash" />,
    );

    expect(screen.getByText("Desktop required")).toBeInTheDocument();
    expect(screen.getByText(/Bulk paste is optimized for desktop/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy url/i })).toBeInTheDocument();
  });

  test("Copy URL button copies journey URL to clipboard", async () => {
    render(
      <BulkPasteMobileStub journeyId="journey-1" journeyName="Order to Cash" />,
    );

    const copyButton = screen.getByRole("button", { name: /copy url/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("journey-1"),
      );
    });

    expect(screen.getByText("URL copied!")).toBeInTheDocument();
  });

  test("button text shows 'copied' state after click", async () => {
    render(
      <BulkPasteMobileStub journeyId="journey-1" journeyName="Order to Cash" />,
    );

    const copyButton = screen.getByRole("button", { name: /copy url/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText("URL copied!")).toBeInTheDocument();
    });
  });
});