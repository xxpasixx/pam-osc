import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../../../core/engine/types.js";
import type { ConsoleSettings } from "../../../core/settings/schema.js";
import type { EngineState, FieldError } from "../../../shared/ipc.js";
import { ConsoleSection } from "./ConsoleSection.js";
import { Ma3SetupView } from "./Ma3SetupView.js";

/**
 * PAM-14: the first-run setup wizard. A full-window overlay (same slot as the
 * editor) that sequences the screens that already exist — it reuses
 * ConsoleSection, Ma3SetupView's install/OSC cards, and (via App) the
 * AddDeviceDialog / ImportV1Dialog and the PAM-4 connection check — into one
 * linear flow that ends in a verified connection and a running bridge.
 *
 * The wizard owns no persistent state: the controller it activates and the
 * console values it edits flow through the SAME "Save & apply" path as the
 * normal Setup tab (props from App). The only persisted bit is the
 * onboarding.completed flag, set on Finish or Skip.
 */

const TOTAL_STEPS = 6;

const STEP_TITLES = [
  "Welcome",
  "Pick your controller",
  "Connect the console",
  "Install the console files",
  "Set up OSC on the console",
  "Verify & finish",
];

/** Compact connection readout — mirrors StatusView's headline logic (AC-4). */
function connectionReadout(
  engineState: EngineState,
  connection: ConnectionStatus | undefined
): { led: string; text: string; connected: boolean } {
  if (engineState === "stopped") {
    return { led: "", text: "The bridge is not running yet — run the test to start it.", connected: false };
  }
  if (!connection || connection.state === "checking") {
    return { led: "checking", text: "Checking the connection …", connected: false };
  }
  switch (connection.state) {
    case "connected":
      return { led: "ok", text: "Connected — GrandMA3 is reachable and the pam-osc plugin is running.", connected: true };
    case "plugin-missing":
      return {
        led: "warn",
        text: "GrandMA3 is reachable, but the pam-osc plugin is not running — install it in the next steps and run “pam-osc Start Stop”.",
        connected: false,
      };
    case "plugin-outdated":
      return {
        led: "err",
        text: "The console plugin is outdated — import the current pam-osc.xml and restart the plugin.",
        connected: false,
      };
    default:
      return {
        led: "err",
        text: connection.gaveUp
          ? "No response from GrandMA3 — check the IP, ports and firewall (you can still continue)."
          : "No response from GrandMA3 yet …",
        connected: false,
      };
  }
}

export function SetupWizard({
  consoleSettings,
  fieldErrors,
  activeMappingCount,
  engineState,
  connection,
  saving,
  engineBusy,
  hasConsoleErrors,
  onConsoleChange,
  onAddController,
  onImportV1,
  onApply,
  onStartEngine,
  onCheck,
  onFinish,
  onSkip,
  onOpenDiagnostics,
}: {
  consoleSettings: ConsoleSettings;
  fieldErrors: FieldError[];
  /** How many mappings are in the draft's active list — AC-3 needs ≥ 1. */
  activeMappingCount: number;
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  saving: boolean;
  engineBusy: boolean;
  hasConsoleErrors: boolean;
  onConsoleChange: (console: ConsoleSettings) => void;
  /** Opens the reused AddDeviceDialog (board → mapping picker). */
  onAddController: () => void;
  /** Starts the reused v1-import flow (ImportV1Dialog). */
  onImportV1: () => void;
  /** Save & apply — persists console + active mappings and (re)starts the engine. */
  onApply: () => Promise<void>;
  /** Start the bridge with the persisted settings (AC-8 auto-start). */
  onStartEngine: () => Promise<void>;
  /** Re-run the live connection check (engine must be running). */
  onCheck: () => void;
  /** Finish: mark complete, reveal the tabbed UI. */
  onFinish: () => void;
  /** Skip: mark complete, reveal the tabbed UI (does not auto-open again). */
  onSkip: () => void;
  /** Leave the wizard straight to the diagnostics/Status tab (EC-1). */
  onOpenDiagnostics: () => void;
}) {
  const [step, setStep] = useState(1);
  const [applying, setApplying] = useState(false);

  const readout = connectionReadout(engineState, connection);

  // AC-8: reaching the verify step auto-starts the bridge so a first-run user
  // never has to discover the Status tab. Only when something is bound and the
  // engine is idle; the engine then runs its own connection check.
  useEffect(() => {
    if (step === 6 && engineState === "stopped" && activeMappingCount > 0) {
      void onStartEngine();
    }
  }, [step, engineState, activeMappingCount, onStartEngine]);

  const goApplyThen = async (next: number) => {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
    setStep(next);
  };

  const busy = applying || saving || engineBusy;

  return (
    <div className="wizard">
      <header className="wizard-header">
        <span className="brand">pam-osc setup</span>
        <ol className="wizard-steps" aria-label="Setup progress">
          {STEP_TITLES.map((title, index) => {
            const n = index + 1;
            const state = n === step ? "current" : n < step ? "done" : "todo";
            return (
              <li key={title} className={`wizard-step ${state}`} aria-current={n === step ? "step" : undefined}>
                <span className="wizard-step-num">{n < step ? "✓" : n}</span>
                <span className="wizard-step-label">{title}</span>
              </li>
            );
          })}
        </ol>
        <div className="grow" />
        <button className="subtle" onClick={onSkip}>
          Skip setup
        </button>
      </header>

      <main className="wizard-body">
        {step === 1 && (
          <section className="card" aria-label="Welcome">
            <h2>Welcome to pam-osc</h2>
            <p>
              This short guide takes you from here to a moving fader — no terminal, no manual. Along the way you’ll pick
              your MIDI controller, point pam-osc at your GrandMA3 console, install the console-side plugin, and confirm
              that feedback is flowing. You can skip it at any time and reopen it later from the “Setup guide” button.
            </p>
            <h3 style={{ margin: "14px 0 4px" }}>What you’ll need</h3>
            <ul className="wizard-checklist">
              <li>A supported MIDI controller connected to this computer (or a v1 mapping to import).</li>
              <li>
                GrandMA3 (console or onPC) reachable over the network — have its IP handy, or run onPC on this machine.
              </li>
              <li>A couple of minutes on the console to import the plugin and set up OSC.</li>
            </ul>
          </section>
        )}

        {step === 2 && (
          <section className="card" aria-label="Pick your controller">
            <h2>Pick your controller</h2>
            <p>
              Choose a bundled board and one of its mappings, or import a mapping from pam-osc v1. This becomes the
              controller the bridge drives — you can add more later under Setup.
            </p>
            <div className="section-actions">
              <button className="primary" onClick={onAddController}>
                Choose a controller …
              </button>
              <button onClick={onImportV1}>Import a v1 mapping …</button>
            </div>
            <p className={`wizard-status ${activeMappingCount > 0 ? "ok" : ""}`}>
              <span className={`led ${activeMappingCount > 0 ? "ok" : "warn"}`} aria-hidden="true" />
              {activeMappingCount > 0
                ? `${activeMappingCount} controller${activeMappingCount === 1 ? "" : "s"} ready to bridge.`
                : "No controller selected yet."}
            </p>
            {activeMappingCount === 0 && (
              <p className="inspector-meta">
                No board fits your hardware?{" "}
                <button className="subtle" onClick={() => setStep(3)}>
                  Continue without one for now
                </button>{" "}
                — you can build a mapping later in the editor.
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <>
            <ConsoleSection console={consoleSettings} errors={fieldErrors} onChange={onConsoleChange} />
            <section className="card" aria-label="Test the connection">
              <h2>Test the connection</h2>
              <p className="inspector-meta">
                Enter your console’s IP and the send/receive ports above, then test. Testing saves these settings and
                starts the bridge so the check can run.
              </p>
              <div className="status-headline">
                <span className={`led ${readout.led}`} aria-hidden="true" />
                <span>{readout.text}</span>
                <div className="spacer" />
                <button
                  onClick={() => void goApplyThen(3)}
                  disabled={busy || hasConsoleErrors}
                  title={hasConsoleErrors ? "Fix the console fields first" : undefined}
                >
                  {busy ? "Testing …" : "Test connection"}
                </button>
                {engineState === "running" && (
                  <button onClick={onCheck} disabled={busy}>
                    Re-check
                  </button>
                )}
              </div>
              {!readout.connected && engineState !== "stopped" && (
                <p className="inspector-meta">
                  Not connected yet? That’s fine — the next steps install the plugin and set up OSC. You can also{" "}
                  <button className="subtle" onClick={onOpenDiagnostics}>
                    open diagnostics
                  </button>
                  . (EC-1)
                </p>
              )}
            </section>
          </>
        )}

        {step === 4 && (
          <>
            <p className="wizard-intro">
              Install the pam-osc files into your GrandMA3 library. onPC on this machine is detected automatically; for a
              real console use the USB route shown below.
            </p>
            <Ma3SetupView values={consoleSettings} mode="install" />
          </>
        )}

        {step === 5 && (
          <>
            <p className="wizard-intro">
              Now create the OSC entries on the console. These values follow the IP and ports you entered — change them
              under Setup and this guide updates with them.
            </p>
            <Ma3SetupView values={consoleSettings} mode="osc" />
          </>
        )}

        {step === 6 && (
          <section className="card" aria-label="Verify & finish">
            <h2>Verify &amp; finish</h2>
            <div className="status-headline">
              <span className={`led ${readout.led}`} aria-hidden="true" />
              <span>{readout.text}</span>
              <div className="spacer" />
              {engineState === "stopped" && activeMappingCount > 0 && (
                <button onClick={() => void onStartEngine()} disabled={busy}>
                  Start bridge
                </button>
              )}
              {engineState === "running" && (
                <button onClick={onCheck} disabled={busy}>
                  Re-check
                </button>
              )}
            </div>
            {readout.connected ? (
              <p className="wizard-success">
                <span className="led ok" aria-hidden="true" /> You’re live — move a fader on your controller and watch
                the console respond. The bridge is running; finishing keeps it that way.
              </p>
            ) : (
              <p className="inspector-meta">
                Feedback isn’t confirmed yet. You can still finish — the bridge {engineState === "running" ? "is" : "will keep"}{" "}
                trying, and you can diagnose it anytime under{" "}
                <button className="subtle" onClick={onOpenDiagnostics}>
                  Status / diagnostics
                </button>
                . (EC-1)
              </p>
            )}
            {activeMappingCount === 0 && (
              <p className="inspector-meta">
                No controller was selected, so there’s nothing to bridge yet — add one under Setup after finishing.
              </p>
            )}
          </section>
        )}
      </main>

      <footer className="footer wizard-footer">
        <button onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || busy}>
          Back
        </button>
        <span className="wizard-count">
          Step {step} of {TOTAL_STEPS}
        </span>
        <div className="grow" />
        {step === 1 && (
          <button className="primary" onClick={() => setStep(2)}>
            Get started
          </button>
        )}
        {step === 2 && (
          <button
            className="primary"
            onClick={() => setStep(3)}
            disabled={activeMappingCount === 0}
            title={activeMappingCount === 0 ? "Pick or import a controller first" : undefined}
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button className="primary" onClick={() => void goApplyThen(4)} disabled={busy || hasConsoleErrors}>
            {busy ? "Saving …" : "Next"}
          </button>
        )}
        {step === 4 && (
          <button className="primary" onClick={() => setStep(5)}>
            Next
          </button>
        )}
        {step === 5 && (
          <button className="primary" onClick={() => setStep(6)}>
            Next
          </button>
        )}
        {step === 6 && (
          <button className="primary" onClick={onFinish} disabled={busy}>
            Finish setup
          </button>
        )}
      </footer>
    </div>
  );
}
