import { useState } from "react";
import { needsInstallConfirmation } from "../../../core/update/policy.js";
import type { EngineState } from "../../../shared/ipc.js";
import { useUpdateStatus } from "./useUpdateStatus.js";
import "./update.css";

/**
 * PAM-34 AC-5: a slim, dismissable bar under the status bar when an update is
 * ready (or needs a manual download). Never covers the editor or status views.
 */
export function UpdateBar({ engineState }: { engineState: EngineState }) {
  const status = useUpdateStatus();
  const [dismissed, setDismissed] = useState<string | undefined>();
  const state = status?.state;
  if (!state || (state.kind !== "ready" && state.kind !== "fallback")) return null;
  if (dismissed === `${state.kind}:${state.version}`) return null;

  const install = () => {
    // AC-6: a restart interrupts MIDI ↔ MA3 — ask while the bridge is active.
    if (
      needsInstallConfirmation(engineState) &&
      !window.confirm(
        `Install pam-osc ${state.version} now?\n\nThis restarts pam-osc and interrupts MIDI ↔ MA3 for a few seconds.`
      )
    ) {
      return;
    }
    void window.pamOscUpdates.installNow();
  };

  return (
    <div className="update-bar" role="status">
      {state.kind === "ready" ? (
        <>
          <span>
            <strong>Update {state.version} ready</strong> — installs automatically when you close pam-osc.
          </span>
          <div className="grow" />
          <button className="primary" onClick={install}>
            Install now
          </button>
        </>
      ) : (
        <>
          <span>
            <strong>pam-osc {state.version} is available.</strong>{" "}
            {state.reason === "not-in-applications"
              ? "Move pam-osc into your Applications folder to get updates automatically — or download it manually."
              : "This installation can't update itself — please download it manually."}
          </span>
          <div className="grow" />
          <button className="primary" onClick={() => void window.pamOscUpdates.openReleasePage(state.releaseUrl)}>
            Download
          </button>
        </>
      )}
      <button
        className="subtle update-dismiss"
        aria-label="Hide update notice"
        onClick={() => setDismissed(`${state.kind}:${state.version}`)}
      >
        ×
      </button>
    </div>
  );
}
