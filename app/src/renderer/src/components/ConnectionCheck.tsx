import { useEffect, useRef } from "react";
import type { ConnectionStatus } from "../../../core/engine/types.js";
import type { EngineState } from "../../../shared/ipc.js";
import { checkReadout, shouldAutoStartEngine, shouldPollConnection, type CheckTarget } from "../wizard-logic.js";

/**
 * PAM-35 AC-6/AC-7/AC-8: the staged connection check, shown right below the
 * console step it verifies — "reachable" after the OSC step, "connected" after
 * the plugin step. Used by the setup wizard and the MA3 tab alike.
 *
 * While `live`, it starts the bridge when needed, re-checks immediately and
 * then every few seconds (quiet: no "checking" flicker, no log spam) until the
 * target state is reached — the user never has to press "Re-check".
 */

const POLL_MS = 5000;

export interface CheckContext {
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  activeMappingCount: number;
  busy: boolean;
  onStartEngine: () => Promise<void>;
}

export function ConnectionCheck({
  target,
  live,
  context,
}: {
  target: CheckTarget;
  live: boolean;
  context: CheckContext;
}) {
  const { engineState, connection, activeMappingCount, busy, onStartEngine } = context;
  const readout = checkReadout({ target, engineState, connection, activeMappingCount });

  // Kick-off once per activation: start the bridge, or re-check right away.
  // Only once — a user who stops the bridge while the step is open is not
  // overridden.
  const kicked = useRef(false);
  useEffect(() => {
    if (!live) {
      kicked.current = false;
      return;
    }
    if (kicked.current) return;
    if (shouldAutoStartEngine({ onCheckStep: true, engineState, activeMappingCount })) {
      kicked.current = true;
      void onStartEngine();
    } else if (engineState === "running") {
      kicked.current = true;
      void window.pamOsc.checkConnection({ quiet: true });
    }
  }, [live, engineState, activeMappingCount, onStartEngine]);

  const poll = shouldPollConnection({ live, engineState, target, connection });
  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(() => void window.pamOsc.checkConnection({ quiet: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  return (
    <div className="status-headline live-check" role="status">
      <span className={`led ${readout.led}`} aria-hidden="true" />
      <span>{readout.text}</span>
      <div className="spacer" />
      {engineState === "stopped" && activeMappingCount > 0 && (
        <button onClick={() => void onStartEngine()} disabled={busy}>
          Start bridge
        </button>
      )}
      {engineState === "running" && !readout.reached && (
        <button onClick={() => void window.pamOsc.checkConnection()} disabled={busy}>
          Check now
        </button>
      )}
    </div>
  );
}
