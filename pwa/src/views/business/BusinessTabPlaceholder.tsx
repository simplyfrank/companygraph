// saas-operator-foundation T-03 (design §6.2, §6.3, FR-13, AC-17) — the
// business-surface twin of model/ModelTabPlaceholder. The #/business surface
// (and the #/exec/operator tab) own route.ts registration for ALL new
// fan-out tabs (XD-05); the sibling tabs render this placeholder until their
// owning downstream specs land. It names the owning spec and consumes
// useActiveModel() to prove the shell-level active-model context is available
// on every sibling route — and it never errors.
//
// Uses the catalog ViewRegion landmark (N-04) + tokens-only styling (UX-02).

import { useActiveModel } from "../../context/ActiveModelContext";
import { ViewRegion, ViewHeader } from "../_shared";
import styles from "./BusinessTabPlaceholder.module.css";

export function BusinessTabPlaceholder({ tab, spec }: { tab: string; spec: string }) {
  const { activeModel, status } = useActiveModel();
  return (
    <ViewRegion label={`${tab} placeholder`}>
      <div className={styles.placeholder} data-testid="business-tab-placeholder">
        <ViewHeader
          title={tab}
          lede={`This tab is owned by the ${spec} spec and has not landed yet.`}
        />
        <p data-testid="business-placeholder-spec">
          Owning spec: <code>{spec}</code>
        </p>
        <p data-testid="business-placeholder-context">
          Active model:{" "}
          {status === "ready" ? (activeModel ? activeModel.name : "none") : status}
        </p>
      </div>
    </ViewRegion>
  );
}
