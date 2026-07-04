// T-16a: Verify-journey button (FR-20 / AC-16)
//
// Uses mergeAttributes() RMW pattern to write `_verification` while
// preserving any existing `_review` (B-01 fix).

import { useState } from "react";
import { Button } from "./Button";
import { mergeAttributes } from "../data/writes";

export interface VerifyJourneyButtonProps {
  journeyId: string;
  isVerified: boolean;
  roleId?: string;
  onVerified?: () => void;
  disabled?: boolean;
  className?: string;
}

export function VerifyJourneyButton({
  journeyId,
  isVerified,
  roleId = "operator",
  onVerified,
  disabled = false,
  className,
}: VerifyJourneyButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await mergeAttributes("UserJourney", journeyId, {
        _verification: {
          by: roleId,
          at: new Date().toISOString().slice(0, 10),
        },
      });

      if (onVerified) {
        onVerified();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button
        tone={isVerified ? "default" : "primary"}
        onClick={() => void handleVerify()}
        disabled={disabled || busy || isVerified}
      >
        {busy ? "Verifying…" : isVerified ? "Verified" : "Verify journey"}
      </Button>
      {error && (
        <div style={{ color: "var(--danger)", fontSize: "12px", marginTop: "4px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
