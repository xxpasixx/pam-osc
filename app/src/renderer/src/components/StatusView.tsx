import { EXPECTED_PLUGIN_PROTOCOL, type ConnectionStatus, type ConsoleState, type DeviceStatus } from "../../../core/engine/types.js";
import type { CatalogEntry, EngineState, PortDiagnosis } from "../../../shared/ipc.js";

/**
 * The diagnostics view (PAM-4 AC-1/2/3/4/6): connection state with the v1.4
 * hints, port diagnosis, engine start/stop, per-device list with on-demand
 * output tests. Everything actionable — no terminal required.
 */

const UNREACHABLE_HINTS = [
  "Check the console IP and the send/receive ports under Setup.",
  "In the MA3 OSC settings, enable an entry named “pam-osc” (or line 2): destination = this computer's IP, port = the send port, and “Send” switched on.",
  "Check the firewall on both machines — OSC is UDP and must pass in both directions.",
];

const PLUGIN_HINTS = [
  "GrandMA3 answered, but the pam-osc plugin did not — run the “pam-osc Start Stop” plugin on the console (once per session).",
  "If the plugin is not installed yet, import pam-OSC.lua from the release files into the console.",
];

const OUTDATED_HINTS = [
  "Import the current pam-osc.xml into the console (plugin pool), then restart the “pam-osc Start Stop” plugin.",
  "Faders, buttons and feedback keep working meanwhile — only command-line targeting (CMD mode) stays off.",
];

function diagnosisText(diagnosis: PortDiagnosis): string {
  switch (diagnosis.status) {
    case "other":
      return `UDP port ${diagnosis.port} is already used by "${diagnosis.name}" (pid ${diagnosis.pid}) — close that app or change the receive port under Setup.`;
    case "self":
      return `UDP port ${diagnosis.port} is open in pam-osc — the local port is fine; the problem is on the console side or in the network.`;
    case "free":
      return `UDP port ${diagnosis.port} is free — nothing blocks it locally; check the console-side OSC settings.`;
    case "unknown":
      return `Could not check UDP port ${diagnosis.port} on this system.`;
  }
}

function ConnectionCard({
  engineState,
  connection,
  consoleState,
  portDiagnosis,
  busy,
  onStart,
  onStop,
  onCheck,
}: {
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  consoleState: ConsoleState | undefined;
  portDiagnosis: PortDiagnosis | undefined;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onCheck: () => void;
}) {
  const stopped = engineState === "stopped";
  // Live console chips (PAM-12 AC-9/AC-10) — only meaningful while running.
  const deskLocked = !stopped && consoleState?.deskLocked === true;
  const cmdActive = !stopped && (consoleState?.cmdFlags ?? 0) !== 0;

  let led = "";
  let headline = "Engine stopped";
  let hints: string[] = [];
  if (!stopped) {
    if (!connection || connection.state === "checking") {
      led = "checking";
      headline = connection
        ? `Checking the connection … (attempt ${connection.attempt})`
        : "Waiting for the first connection check …";
    } else if (connection.state === "connected") {
      led = "ok";
      headline = "Connected — GrandMA3 is reachable and the pam-osc plugin is running";
    } else if (connection.state === "plugin-missing") {
      led = "warn";
      headline = "GrandMA3 is reachable, but the pam-osc plugin is not running";
      hints = PLUGIN_HINTS;
    } else if (connection.state === "plugin-outdated") {
      led = "err";
      headline = `Plugin update required — the console plugin speaks protocol ${connection.pluginProtocol ?? 1}, this app needs ${EXPECTED_PLUGIN_PROTOCOL}`;
      hints = OUTDATED_HINTS;
    } else {
      led = "err";
      headline = connection.gaveUp
        ? `No response from GrandMA3 (gave up after ${connection.attempt} attempts)`
        : `No response from GrandMA3 (attempt ${connection.attempt})`;
      hints = UNREACHABLE_HINTS;
    }
  }

  return (
    <section className="card" aria-label="Console connection">
      <h2>Console connection</h2>
      <div className="status-headline">
        <span className={`led ${led}`} aria-hidden="true" />
        <span>{headline}</span>
        <div className="spacer" />
        {!stopped && (
          <button onClick={onCheck} disabled={busy || engineState !== "running"}>
            Check connection
          </button>
        )}
        {stopped ? (
          <button className="primary" onClick={onStart} disabled={busy}>
            Start engine
          </button>
        ) : (
          <button onClick={onStop} disabled={busy || engineState !== "running"}>
            Stop engine
          </button>
        )}
      </div>
      {hints.length > 0 && (
        <ul className="hints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      {deskLocked && (
        <p className="console-chip warn" role="status">
          <span className="led warn" aria-hidden="true" /> Desk locked — MIDI input is blocked until the console is
          unlocked.
        </p>
      )}
      {cmdActive && (
        <p className="console-chip cmd" role="status">
          <span className="led checking" aria-hidden="true" /> CMD mode — the console command line is waiting for a
          target; executor buttons now select instead of triggering.
        </p>
      )}
      {!stopped && portDiagnosis && <p className="diagnosis">{diagnosisText(portDiagnosis)}</p>}
      {stopped && <p className="empty-state">The bridge is not running — MIDI and OSC ports are released.</p>}
    </section>
  );
}

function DevicesCard({
  engineState,
  devices,
  catalog,
  testing,
  onTest,
}: {
  engineState: EngineState;
  devices: DeviceStatus[];
  catalog: CatalogEntry[];
  testing: Set<string>;
  onTest: (mappingId: string) => void;
}) {
  const nameById = new Map(catalog.map((entry) => [entry.id, entry.name]));
  return (
    <section className="card" aria-label="Devices">
      <h2>Devices</h2>
      {engineState === "stopped" && <p className="empty-state">Engine stopped — no devices are bound.</p>}
      {engineState !== "stopped" && devices.length === 0 && (
        <p className="empty-state">No active mappings — add a device under Setup.</p>
      )}
      {devices.map((device) => {
        const bound = device.state === "bound";
        return (
          <div className="device-row" key={device.mappingId}>
            <span
              className={`led ${bound ? "ok" : "err"}`}
              title={bound ? "bound" : "missing"}
              aria-label={bound ? "bound" : "missing"}
            />
            <div className="device-name">
              {nameById.get(device.mappingId) ?? device.mappingId}
              <span className="board">
                {device.inputPort} · {bound ? "bound" : "missing — check the port under Setup"}
              </span>
            </div>
            <div className="spacer" />
            <button
              onClick={() => onTest(device.mappingId)}
              disabled={!bound || engineState !== "running" || testing.has(device.mappingId)}
              title="Play the LED/fader test animation on this device"
            >
              {testing.has(device.mappingId) ? "Testing …" : "Test output"}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export function StatusView(props: {
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
  consoleState: ConsoleState | undefined;
  devices: DeviceStatus[];
  catalog: CatalogEntry[];
  portDiagnosis: PortDiagnosis | undefined;
  busy: boolean;
  testing: Set<string>;
  onStart: () => void;
  onStop: () => void;
  onCheck: () => void;
  onTest: (mappingId: string) => void;
  onExportSupportPackage: () => void;
}) {
  return (
    <>
      <ConnectionCard
        engineState={props.engineState}
        connection={props.connection}
        consoleState={props.consoleState}
        portDiagnosis={props.portDiagnosis}
        busy={props.busy}
        onStart={props.onStart}
        onStop={props.onStop}
        onCheck={props.onCheck}
      />
      <DevicesCard
        engineState={props.engineState}
        devices={props.devices}
        catalog={props.catalog}
        testing={props.testing}
        onTest={props.onTest}
      />
      <section className="card" aria-label="Support">
        <h2>Support</h2>
        <p className="inspector-meta">
          One .zip with all boards, mappings, the settings, and the latest session log — attach it when reporting a
          problem, or keep it as a backup of your setup (PAM-7 AC-10).
        </p>
        <div className="section-actions">
          <button onClick={props.onExportSupportPackage}>Export support package …</button>
        </div>
      </section>
    </>
  );
}
