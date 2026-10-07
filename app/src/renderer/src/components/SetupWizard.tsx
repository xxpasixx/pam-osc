import { useState } from "react";
import type { ConnectionStatus, DeviceStatus } from "../../../core/engine/types.js";
import type { ActiveMappingDraft, ConsoleSettings } from "../../../core/settings/schema.js";
import type { CatalogEntry, EngineState, FieldError, MidiPortList, Notice } from "../../../shared/ipc.js";
import { consoleRoute, controllersReady, inputPortConnected, targetReached } from "../wizard-logic.js";
import type { CheckContext } from "./ConnectionCheck.js";
import { ConsoleAddressField, ConsolePortFields } from "./ConsoleSection.js";
import { PortPicker } from "./DevicesSection.js";
import { Ma3SetupView } from "./Ma3SetupView.js";

/**
 * PAM-14: the first-run setup wizard. A full-window overlay (same slot as the
 * editor) that sequences the screens that already exist — ConsoleSection
 * fields, Ma3SetupView's cards, and (via App) the AddDeviceDialog /
 * ImportV1Dialog — into one linear flow that ends in a verified connection and
 * a running bridge.
 *
 * PAM-35: the steps run in the order they can be verified. Nothing is tested
 * before the console is set up; the OSC step checks "the console answers", the
 * plugin step checks "connected", each live without a Re-check click.
 *
 * The wizard owns no persistent state: the controller it activates and the
 * console values it edits flow through the SAME "Save & apply" path as the
 * normal Setup tab (props from App). The only persisted bit is the
 * onboarding.completed flag, set on Finish or Skip.
 */

const STEP_TITLES = [
  "Welcome",
  "Controller",
  "Where is your MA3?",
  "Copy the files",
  "OSC on the console",
  "Start the plugin",
];
const TOTAL_STEPS = STEP_TITLES.length;

export function SetupWizard({
  consoleSettings,
  activeMappings,
  catalog,
  midiPorts,
  devices,
  fieldErrors,
  engineState,
  connection,
  saving,
  engineBusy,
  feedbackIpChoice,
  onFeedbackIpChoice,
  pushNotice,
  onConsoleChange,
  onActiveMappingsChange,
  onAddController,
  onImportV1,
  onApply,
  onStartEngine,
  onFinish,
  onSkip,
  onOpenDiagnostics,
}: {
  consoleSettings: ConsoleSettings;
  /** The draft's active mappings — AC-3 needs ≥ 1; PAM-35 AC-2 shows their ports. */
  activeMappings: ActiveMappingDraft[];
  catalog: CatalogEntry[];
  midiPorts: MidiPortList;
  devices: DeviceStatus[];
  fieldErrors: FieldError[];
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  saving: boolean;
  engineBusy: boolean;
  feedbackIpChoice: string | undefined;
  onFeedbackIpChoice: (ip: string) => void;
  pushNotice: (notice: Notice) => void;
  onConsoleChange: (console: ConsoleSettings) => void;
  onActiveMappingsChange: (activeMappings: ActiveMappingDraft[]) => void;
  /** Opens the reused AddDeviceDialog (board → mapping picker). */
  onAddController: () => void;
  /** Starts the reused v1-import flow (ImportV1Dialog). */
  onImportV1: () => void;
  /** Save & apply — persists console + active mappings and (re)starts the engine. */
  onApply: () => Promise<void>;
  /** Start the bridge with the persisted settings (AC-8 auto-start). */
  onStartEngine: () => Promise<void>;
  /** Finish: mark complete, reveal the tabbed UI. */
  onFinish: () => void;
  /** Skip: mark complete, reveal the tabbed UI (does not auto-open again). */
  onSkip: () => void;
  /** Leave the wizard straight to the diagnostics/Status tab (EC-1). */
  onOpenDiagnostics: () => void;
}) {
  const [step, setStep] = useState(1);
  const [applying, setApplying] = useState(false);
  // The network address typed before switching to "onPC on this computer" —
  // switching back restores it instead of an empty field.
  const [networkAddress, setNetworkAddress] = useState(
    consoleRoute(consoleSettings.address) === "network" ? consoleSettings.address : ""
  );

  const busy = applying || saving || engineBusy;
  const route = consoleRoute(consoleSettings.address);
  const consoleErrors = fieldErrors.filter((error) => error.field.startsWith("console."));
  const portErrors = consoleErrors.some((error) => error.field !== "console.address");
  const mappingErrors = fieldErrors.some((error) => error.field.startsWith("mapping:"));
  const entryById = new Map(catalog.map((entry) => [entry.id, entry]));
  const errorFor = (field: string) => fieldErrors.find((error) => error.field === field)?.message;

  const check: CheckContext = {
    engineState,
    connection,
    activeMappingCount: activeMappings.length,
    busy,
    onStartEngine,
  };

  const goApplyThen = async (next: number) => {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
    setStep(next);
  };

  const chooseRoute = (next: "this-computer" | "network") => {
    if (next === route) return;
    if (next === "this-computer") {
      setNetworkAddress(consoleSettings.address);
      onConsoleChange({ ...consoleSettings, address: "127.0.0.1" });
    } else {
      onConsoleChange({ ...consoleSettings, address: networkAddress });
    }
  };

  const updateMapping = (index: number, patch: Partial<ActiveMappingDraft>) =>
    onActiveMappingsChange(activeMappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));

  const connected = targetReached("connected", connection);
  const missingControllers = devices.filter((device) => device.state === "missing");

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
              This short guide takes you from here to a moving fader — no terminal, no manual. You pick your MIDI
              controller, tell pam-osc where GrandMA3 runs, copy two files over, and set up the console. After each
              console step pam-osc checks the result live, so you always know which part works. You can skip it at any
              time and reopen it later from the “Setup guide” button.
            </p>
            <h3 style={{ margin: "14px 0 4px" }}>What you’ll need</h3>
            <ul className="wizard-checklist">
              <li>A supported MIDI controller connected to this computer (or a v1 mapping to import).</li>
              <li>GrandMA3 — onPC on this computer, or a console / onPC on the same network with its IP handy.</li>
              <li>For a real console: a USB stick (FAT32) to carry the files over.</li>
            </ul>
          </section>
        )}

        {step === 2 && (
          <section className="card" aria-label="Pick your controller">
            <h2>Pick your controller</h2>
            <p>
              Choose a bundled board and one of its mappings, or import a mapping from pam-osc v1. Then check that its
              MIDI port is the one connected to this computer — you can add more controllers later under Setup.
            </p>
            {activeMappings.map((mapping, index) => {
              const entry = entryById.get(mapping.id);
              const present = inputPortConnected(mapping, midiPorts.inputs);
              const statusText = present
                ? "connected"
                : mapping.input
                  ? `“${mapping.input}” is not connected — plug it in or pick your controller’s port`
                  : "pick your controller’s port";
              return (
                <div className="device-row" key={index}>
                  <span className={`led ${present ? "ok" : "err"}`} title={statusText} aria-label={statusText} />
                  <div className="device-name">
                    {entry?.boardName ?? mapping.id}
                    <span className="board">
                      {entry ? `${entry.name} · ` : ""}
                      {statusText}
                    </span>
                  </div>
                  <PortPicker
                    id={`wizard-input-${index}`}
                    label="MIDI in"
                    value={mapping.input}
                    ports={midiPorts.inputs}
                    error={errorFor(`mapping:${mapping.id}.input`)}
                    onChange={(input) => updateMapping(index, { input })}
                  />
                  <PortPicker
                    id={`wizard-output-${index}`}
                    label="MIDI out (feedback)"
                    value={mapping.output ?? ""}
                    ports={midiPorts.outputs}
                    optional
                    error={errorFor(`mapping:${mapping.id}.output`)}
                    onChange={(output) => updateMapping(index, { output: output === "" ? undefined : output })}
                  />
                  <div className="spacer" />
                  <button
                    className="subtle"
                    onClick={() => onActiveMappingsChange(activeMappings.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <div className="section-actions">
              <button className={activeMappings.length === 0 ? "primary" : ""} onClick={onAddController}>
                {activeMappings.length === 0 ? "Choose a controller …" : "+ Add another controller"}
              </button>
              <button onClick={onImportV1}>Import a v1 mapping …</button>
            </div>
            {activeMappings.length === 0 && (
              <p className="inspector-meta">
                No board fits your hardware?{" "}
                <button className="subtle" onClick={() => setStep(3)}>
                  Continue without one for now
                </button>{" "}
                — you can build a mapping later in the editor (the connection checks need a controller, though).
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="card" aria-label="Where is your MA3?">
            <h2>Where is your GrandMA3?</h2>
            <div className="choice-list" role="radiogroup" aria-label="Where GrandMA3 runs">
              <label className={`choice ${route === "this-computer" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="console-route"
                  checked={route === "this-computer"}
                  onChange={() => chooseRoute("this-computer")}
                />
                <span>
                  <strong>onPC on this computer</strong>
                  <span className="choice-hint">pam-osc and onPC talk over 127.0.0.1 — nothing to type.</span>
                </span>
              </label>
              <label className={`choice ${route === "network" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="console-route"
                  checked={route === "network"}
                  onChange={() => chooseRoute("network")}
                />
                <span>
                  <strong>A console, or onPC on another computer</strong>
                  <span className="choice-hint">Enter its IP address — both must be on the same network.</span>
                </span>
              </label>
            </div>
            {route === "network" && (
              <div className="form-row">
                <ConsoleAddressField console={consoleSettings} errors={fieldErrors} onChange={onConsoleChange} />
              </div>
            )}
            <details className="advanced" open={portErrors || undefined}>
              <summary>
                Advanced: ports ({consoleSettings.sendPort || "—"} / {consoleSettings.receivePort || "—"}) — only change
                them if another app already uses these
              </summary>
              <div className="form-row">
                <ConsolePortFields console={consoleSettings} errors={fieldErrors} onChange={onConsoleChange} />
              </div>
            </details>
            <p className="inspector-meta">
              No connection test yet — the console doesn’t know pam-osc until the next steps. pam-osc checks right after
              each console step instead.
            </p>
          </section>
        )}

        {step === 4 && (
          <>
            <p className="wizard-intro">
              {route === "this-computer"
                ? "Install the plugin and the OSC config into onPC on this computer — one click each."
                : "Copy the plugin and the OSC config onto a USB stick (or a shared folder) and take it to the console."}{" "}
              The OSC config is written for your setup, so there’s nothing to type on the console later.
            </p>
            <Ma3SetupView
              values={consoleSettings}
              mode="files"
              pushNotice={pushNotice}
              feedbackIpChoice={feedbackIpChoice}
              onFeedbackIpChoice={onFeedbackIpChoice}
            />
          </>
        )}

        {step === 5 && (
          <>
            <p className="wizard-intro">
              Now on the console: import the OSC config. As soon as the console answers, the check below turns green —
              the plugin isn’t needed for that yet.
            </p>
            <Ma3SetupView
              values={consoleSettings}
              mode="osc"
              pushNotice={pushNotice}
              feedbackIpChoice={feedbackIpChoice}
              onFeedbackIpChoice={onFeedbackIpChoice}
              check={check}
            />
            <p className="inspector-meta">
              Stuck? You can continue anyway, or{" "}
              <button className="subtle" onClick={onOpenDiagnostics}>
                open diagnostics
              </button>
              .
            </p>
          </>
        )}

        {step === 6 && (
          <>
            <p className="wizard-intro">Last step on the console: import the plugin and start it.</p>
            <Ma3SetupView
              values={consoleSettings}
              mode="plugin"
              pushNotice={pushNotice}
              feedbackIpChoice={feedbackIpChoice}
              onFeedbackIpChoice={onFeedbackIpChoice}
              check={check}
            />
            {connected && missingControllers.length === 0 && activeMappings.length > 0 && (
              <p className="wizard-success">
                <span className="led ok" aria-hidden="true" /> You’re live — move a fader on your controller and watch
                the console respond. The bridge is running; finishing keeps it that way.
              </p>
            )}
            {connected && missingControllers.length > 0 && (
              <p className="wizard-success warn">
                <span className="led warn" aria-hidden="true" /> The console side is done — but{" "}
                {missingControllers
                  .map((device) => entryById.get(device.mappingId)?.boardName ?? device.mappingId)
                  .join(", ")}{" "}
                {missingControllers.length === 1 ? "isn’t" : "aren’t"} connected. Check the MIDI port in the Controller
                step (or plug it in).
              </p>
            )}
            {!connected && activeMappings.length > 0 && (
              <p className="inspector-meta">
                Not green yet? You can still finish — the bridge keeps trying, and you can diagnose it anytime under{" "}
                <button className="subtle" onClick={onOpenDiagnostics}>
                  Status / diagnostics
                </button>
                .
              </p>
            )}
          </>
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
            disabled={!controllersReady(activeMappings)}
            title={!controllersReady(activeMappings) ? "Pick a controller and its MIDI port first" : undefined}
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button
            className="primary"
            onClick={() => void goApplyThen(4)}
            disabled={busy || consoleErrors.length > 0 || mappingErrors}
            title={consoleErrors.length > 0 ? "Fix the console fields first" : undefined}
          >
            {busy ? "Saving …" : "Next"}
          </button>
        )}
        {(step === 4 || step === 5) && (
          <button className="primary" onClick={() => setStep(step + 1)}>
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
