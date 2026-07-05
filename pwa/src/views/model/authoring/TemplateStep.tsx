// business-model-authoring T-08 (design §4.1, §4.2, §6) — TemplateStep
// component. Two options: Blank and Clone retail reference (XD-13).

import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import type { TemplateChoice, WizardState, WizardAction } from "./wizardModel";

interface TemplateStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  hasReferenceModel: boolean;
}

export function TemplateStep({ state, dispatch, hasReferenceModel }: TemplateStepProps) {
  const select = (choice: TemplateChoice) => {
    dispatch({ type: "setTemplate", template: choice });
  };

  return (
    <Card title="Choose a template">
      <div role="radiogroup" aria-label="Template options">
        <label>
          <input
            type="radio"
            name="template"
            checked={state.template === "blank"}
            onChange={() => select("blank")}
          />
          {" "}Blank — start from scratch
        </label>
        <br />
        <label>
          <input
            type="radio"
            name="template"
            checked={state.template === "retail-clone"}
            onChange={() => select("retail-clone")}
            disabled={!hasReferenceModel}
          />
          {" "}Clone retail reference
        </label>
        {!hasReferenceModel && (
          <p data-testid="clone-disabled-hint">
            No published retail reference module available.
          </p>
        )}
      </div>
      <Button onClick={() => dispatch({ type: "next" })}>Next</Button>
      {state.template === null && (
        <p role="alert" data-testid="template-gate-message">
          Select a template to continue.
        </p>
      )}
    </Card>
  );
}
