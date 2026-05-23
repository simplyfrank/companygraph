// T-14: Flag-for-review button + RMW write-flow (FR-18 / AC-15)
//
// This component provides a button that flags a node for review by adding
// the `_review` attribute. It uses mergeAttributes() from T-05 to preserve
// any existing `_verification` attribute (B-01 fix).

import { useState } from "react";
import { Button } from "./Button";
import { mergeAttributes } from "../data/writes";
import type { NodeLabel } from "@companygraph/shared/schema/nodes";

export interface FlagForReviewButtonProps {
  label: NodeLabel;
  id: string;
  currentReviewStatus?: string;
  onFlagged?: () => void;
  disabled?: boolean;
  className?: string;
}

export function FlagForReviewButton({
  label,
  id,
  currentReviewStatus,
  onFlagged,
  disabled = false,
  className,
}: FlagForReviewButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFlag = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      await mergeAttributes(label, id, {
        _review: {
          status: "needs_review",
          reason: "Flagged for review",
          set_by: "operator",
          set_at: new Date().toISOString(),
        },
      });

      if (onFlagged) {
        onFlagged();
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
        tone={currentReviewStatus === "needs_review" ? "neutral" : "warn"}
        onClick={() => void handleFlag()}
        disabled={disabled || busy}
      >
        {busy ? "Flagging…" : currentReviewStatus === "needs_review" ? "In review" : "Flag for review"}
      </Button>
      {error && (
        <div style={{ color: "var(--danger)", fontSize: "12px", marginTop: "4px" }}>
          {error}
        </div>
      )}
    </div>
  );
}