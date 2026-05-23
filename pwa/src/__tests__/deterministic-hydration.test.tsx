// T-20: Deterministic hydration test (AC-30)
//
// Renders a component twice with the same fixture data and asserts
// that the output HTML is byte-identical (no non-determinism from
// Date.now(), Math.random(), Map/Set iteration, or locale).

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VerifyJourneyButton } from "../components/VerifyJourneyButton";
import { FlagForReviewButton } from "../components/FlagForReviewButton";

describe("Deterministic hydration (AC-30)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("VerifyJourneyButton renders identically on two consecutive calls", () => {
    const props = {
      journeyId: "j-test-1",
      isVerified: false,
      roleId: "role-1",
      disabled: false,
    };

    const html1 = renderToStaticMarkup(<VerifyJourneyButton {...props} />);
    const html2 = renderToStaticMarkup(<VerifyJourneyButton {...props} />);

    expect(html1).toBe(html2);
  });

  test("VerifyJourneyButton (verified state) renders identically", () => {
    const props = {
      journeyId: "j-test-2",
      isVerified: true,
      roleId: "role-2",
    };

    const html1 = renderToStaticMarkup(<VerifyJourneyButton {...props} />);
    const html2 = renderToStaticMarkup(<VerifyJourneyButton {...props} />);

    expect(html1).toBe(html2);
  });

  test("FlagForReviewButton renders identically on two consecutive calls", () => {
    const props = {
      label: "UserJourney" as const,
      id: "j-test-3",
      currentReviewStatus: "approved",
      disabled: false,
    };

    const html1 = renderToStaticMarkup(<FlagForReviewButton {...props} />);
    const html2 = renderToStaticMarkup(<FlagForReviewButton {...props} />);

    expect(html1).toBe(html2);
  });

  test("output does not contain Date.now() artifacts", () => {
    const props = {
      journeyId: "j-test-4",
      isVerified: true,
      roleId: "role-3",
    };

    const html = renderToStaticMarkup(<VerifyJourneyButton {...props} />);

    // Should not contain timestamps or random values
    expect(html).not.toMatch(/\d{13}/); // epoch ms
    expect(html).not.toMatch(/0\.\d{10,}/); // Math.random()
  });
});
