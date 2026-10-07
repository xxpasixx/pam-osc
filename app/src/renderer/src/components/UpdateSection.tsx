import type { UpdatePreferences, UpdateState } from "../../../shared/update.js";
import { useUpdateStatus } from "./useUpdateStatus.js";
import "./update.css";

function describe(state: UpdateState): string {
  switch (state.kind) {
    case "disabled":
      return "Automatic checks are off.";
    case "idle":
      return "Not checked yet.";
    case "checking":
      return "Checking …";
    case "up-to-date":
      return `Up to date (checked ${new Date(state.checkedAt).toLocaleTimeString()}).`;
    case "downloading":
      return `Downloading ${state.version} … ${state.percent} %`;
    case "ready":
      return `Update ${state.version} ready — installs when you close pam-osc.`;
    case "fallback":
      return `${state.version} is available — manual download needed.`;
    case "error":
      return `Last check failed (${new Date(state.checkedAt).toLocaleTimeString()}): ${state.message}`;
  }
}

/** PAM-34 AC-4 / AC-8 / AC-14: version, last result, Check now, the two switches. */
export function UpdateSection() {
  const status = useUpdateStatus();
  if (!status) return null;
  const { preferences, state } = status;
  const busy = state.kind === "checking" || state.kind === "downloading";
  const set = (next: Partial<UpdatePreferences>) => void window.pamOscUpdates.setPreferences({ ...preferences, ...next });

  return (
    <section className="card" aria-label="Updates">
      <h2>Updates</h2>
      <div className="update-section-row">
        <span>
          Installed: <code>{status.installedVersion}</code>
        </span>
        <span className="update-section-state">
          {status.supported ? describe(state) : "Updates are disabled in development builds."}
        </span>
        <div className="grow" />
        <button onClick={() => void window.pamOscUpdates.checkNow()} disabled={!status.supported || busy}>
          Check now
        </button>
      </div>
      <label className="update-toggle">
        <input
          type="checkbox"
          checked={preferences.checkAutomatically}
          disabled={!status.supported}
          onChange={(event) => set({ checkAutomatically: event.target.checked })}
        />
        Check for updates automatically
      </label>
      <label className="update-toggle">
        <input
          type="checkbox"
          checked={preferences.receiveBetas}
          disabled={!status.supported}
          onChange={(event) => set({ receiveBetas: event.target.checked })}
        />
        Receive beta updates (pre-releases)
      </label>
    </section>
  );
}
