import type { ConnectionStatus } from "../../../core/engine/types.js";
import type { EngineState } from "../../../shared/ipc.js";

/** Always-visible indicators (AC-7) — enough to see that setup worked. */
export function StatusBar({
  engineState,
  connection,
}: {
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
}) {
  const engineLed = engineState === "running" ? "ok" : engineState === "starting" ? "warn checking" : "";
  const engineText =
    engineState === "running" ? "engine running" : engineState === "starting" ? "engine starting …" : "engine stopped";

  let connectionLed = "";
  let connectionText = "console: –";
  if (engineState !== "stopped" && connection) {
    switch (connection.state) {
      case "checking":
        connectionLed = "checking";
        connectionText = `console: checking … (attempt ${connection.attempt})`;
        break;
      case "connected":
        connectionLed = "ok";
        connectionText = "console: connected";
        break;
      case "plugin-missing":
        connectionLed = "warn";
        connectionText = "console: reachable — plugin not running";
        break;
      case "unreachable":
        connectionLed = "err";
        connectionText = connection.gaveUp
          ? "console: unreachable (gave up)"
          : `console: unreachable (attempt ${connection.attempt})`;
        break;
    }
  }

  return (
    <header className="status-bar">
      <span className="brand">pam-osc</span>
      <span className="status-item">
        <span className={`led ${engineLed}`} aria-hidden="true" />
        {engineText}
      </span>
      <span className="status-item">
        <span className={`led ${connectionLed}`} aria-hidden="true" />
        {connectionText}
      </span>
    </header>
  );
}
