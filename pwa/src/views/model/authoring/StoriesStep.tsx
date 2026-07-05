// business-model-authoring T-09 (design §4.6, §6) — StoriesStep component.
// Bootstrap acceptance criteria from the model's activity structure via
// the story-spec-core bootstrap endpoint.

import { useState } from "react";
import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import type { WizardState, WizardAction } from "./wizardModel";

interface StoriesStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  storyCount: number;
  onBootstrap: () => Promise<{ created: number }>;
}

export function StoriesStep({ state, dispatch, storyCount, onBootstrap }: StoriesStepProps) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleBootstrap = async () => {
    setLoading(true);
    const result = await onBootstrap();
    setCreatedCount(result.created);
    setBootstrapped(true);
    setLoading(false);
  };

  return (
    <Card title="Stories">
      <div data-testid="story-status">
        {storyCount > 0 ? (
          <p>{storyCount} stories exist.</p>
        ) : (
          <p data-testid="no-stories">No stories yet.</p>
        )}
      </div>
      <div data-testid="story-bootstrap">
        <Button onClick={handleBootstrap} disabled={loading || bootstrapped}>
          {loading ? "Bootstrapping…" : "Bootstrap stories"}
        </Button>
        {bootstrapped && (
          <p data-testid="bootstrap-result">Created {createdCount} stories.</p>
        )}
      </div>
      <Button onClick={() => dispatch({ type: "next" })}>Finish</Button>
    </Card>
  );
}
