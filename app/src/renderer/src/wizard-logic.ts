import type { ConnectionStatus } from "../../core/engine/types.js";
import type { ActiveMappingDraft } from "../../core/settings/schema.js";
import { isThisComputer } from "../../shared/feedback-ip.js";
import type { EngineState } from "../../shared/ipc.js";

/**
 * PAM-14: the wizard's pure decision logic, extracted from the components so it
 * is unit-testable without a renderer harness (BUG-2). The App/SetupWizard
 * components call these — they are the single source of truth, so the tests
 * cover the code that actually runs, not a copy.
 */

/** Minimal shape of the onboarding marker carried on the snapshot / settings. */
export type OnboardingMarker = { completed: boolean } | undefined;

/**
 * AC-1: the wizard auto-opens on first launch. This is decided ONLY from the
 * initial snapshot (App calls it once in loadSnapshot) — a post-save snapshot
 * adopt never re-evaluates it, so completing setup and saving cannot reopen the
 * wizard. Absent/false flag → open; explicit `completed: true` → stay closed.
 */
export function shouldAutoOpenWizard(onboarding: OnboardingMarker): boolean {
  return onboarding?.completed !== true;
}

/** A catalog-ish entry carrying the MIDI port binding stored in its file. */
type PortedEntry = { id: string; midiPort: { input: string; output?: string } };

/**
 * AC-3 / BUG-1: activate a catalog entry in the draft's active-mappings list —
 * the SAME path the bundled-board pick and the duplicate flow use, so a v1
 * import ends the controller step with an active mapping (Next enables). Idempotent:
 * an id already active is left untouched (harmless from the normal tabbed import).
 */
export function activateCatalogEntry(activeMappings: ActiveMappingDraft[], entry: PortedEntry): ActiveMappingDraft[] {
  if (activeMappings.some((mapping) => mapping.id === entry.id)) return activeMappings;
  return [...activeMappings, { id: entry.id, input: entry.midiPort.input, output: entry.midiPort.output }];
}

/**
 * AC-8 (PAM-35 AC-8): showing a live-check step auto-starts the bridge so a
 * first-run user never has to discover the Status tab — but only when the
 * engine is idle AND something is bound to bridge.
 */
export function shouldAutoStartEngine(input: {
  onCheckStep: boolean;
  engineState: EngineState;
  activeMappingCount: number;
}): boolean {
  return input.onCheckStep && input.engineState === "stopped" && input.activeMappingCount > 0;
}

// ---- PAM-35: setup in testable order ----

/** Where GrandMA3 runs, derived from the console address (AC-3). */
export type ConsoleRoute = "this-computer" | "network";

export function consoleRoute(address: string): ConsoleRoute {
  return isThisComputer(address) ? "this-computer" : "network";
}

/**
 * The two staged checks (AC-6/AC-7): "reachable" = the console answers (both
 * OSC entries work, plugin not needed); "connected" = the plugin answers too.
 */
export type CheckTarget = "reachable" | "connected";

export function targetReached(target: CheckTarget, connection: ConnectionStatus | undefined): boolean {
  if (!connection) return false;
  if (target === "connected") return connection.state === "connected";
  return (
    connection.state === "plugin-missing" || connection.state === "connected" || connection.state === "plugin-outdated"
  );
}

/** AC-8: keep polling while the step is shown, the bridge runs and the target isn't reached yet. */
export function shouldPollConnection(input: {
  live: boolean;
  engineState: EngineState;
  target: CheckTarget;
  connection: ConnectionStatus | undefined;
}): boolean {
  return input.live && input.engineState === "running" && !targetReached(input.target, input.connection);
}

/** AC-2: a chosen controller's input port is present on this computer right now. */
export function inputPortConnected(mapping: ActiveMappingDraft, inputs: string[]): boolean {
  return mapping.input !== "" && inputs.includes(mapping.input);
}

/** AC-2: Next needs ≥ 1 controller and every one of them with an input port picked. */
export function controllersReady(activeMappings: ActiveMappingDraft[]): boolean {
  return activeMappings.length > 0 && activeMappings.every((mapping) => mapping.input !== "");
}

export interface CheckReadout {
  led: "" | "ok" | "warn" | "err" | "checking";
  text: string;
  reached: boolean;
}

/** The step-specific reading of the shared connection state (AC-6/AC-7, EC-1). */
export function checkReadout(input: {
  target: CheckTarget;
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  activeMappingCount: number;
}): CheckReadout {
  const { target, engineState, connection, activeMappingCount } = input;
  if (engineState === "stopped") {
    return activeMappingCount === 0
      ? {
          led: "",
          text: "No controller selected — the check needs a running bridge. Pick a controller first.",
          reached: false,
        }
      : { led: "", text: "The bridge is not running.", reached: false };
  }
  if (engineState === "starting" || !connection || connection.state === "checking") {
    return { led: "checking", text: "Checking the connection …", reached: false };
  }
  const state = connection.state;
  if (target === "reachable") {
    if (state === "plugin-missing") {
      return { led: "ok", text: "The console answers — OSC works. Next: start the plugin.", reached: true };
    }
    if (state === "connected") {
      return { led: "ok", text: "The console answers and the pam-osc plugin is already running.", reached: true };
    }
    if (state === "plugin-outdated") {
      return {
        led: "ok",
        text: "The console answers — OSC works. The plugin on it is outdated; the next step updates it.",
        reached: true,
      };
    }
    return {
      led: "err",
      text: "No answer from the console yet — this re-checks every few seconds while you set it up.",
      reached: false,
    };
  }
  if (state === "connected") {
    return { led: "ok", text: "Connected — the console answers and the pam-osc plugin is running.", reached: true };
  }
  if (state === "plugin-missing") {
    return {
      led: "warn",
      text: "The console answers, but the plugin isn’t running yet — run the “pam-osc” plugin on the console.",
      reached: false,
    };
  }
  if (state === "plugin-outdated") {
    return {
      led: "err",
      text: "The plugin on the console is outdated — import the current pam-osc plugin and restart it.",
      reached: false,
    };
  }
  return {
    led: "err",
    text: "No answer from the console — check the OSC entries from the step before, the interface and the firewall.",
    reached: false,
  };
}
