// model-workspace-core T-21 (design §4.9/§6, FR-17, AC-19) — sibling-tab
// placeholder. The Model surface owns route.ts registration for ALL
// seven #/model tabs (one feature owns a file); the six sibling tabs
// render this placeholder until their owning downstream specs land.
// It names the owning spec and consumes useActiveModel() to prove the
// shell-level context is available on every Model tab — and it never
// errors.

import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewHeader } from "../_shared";

export function ModelTabPlaceholder({ tab, spec }: { tab: string; spec: string }) {
  const { activeModel, status } = useActiveModel();
  return (
    <section aria-label={`${tab} placeholder`} data-testid="model-tab-placeholder">
      <ViewHeader
        title={tab}
        lede={`This tab is owned by the ${spec} spec and has not landed yet.`}
      />
      <p data-testid="model-placeholder-spec">
        Owning spec: <code>{spec}</code>
      </p>
      <p data-testid="model-placeholder-context">
        Active model:{" "}
        {status === "ready" ? (activeModel ? activeModel.name : "none") : status}
      </p>
    </section>
  );
}
