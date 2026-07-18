import { EventEmitter } from "node:events";
import { loadFormat } from "../format/index.js";
import type { MidiTransport } from "../../transports/midi.js";
import type { OscMessage, OscSocket, OscTransport } from "../../transports/osc.js";
import { formatMidiIn, formatMidiOut, formatOsc } from "./traffic.js";
import { cancelCmdTimers, enqueueCmdKey, onCmdKeyAck, type CmdKeyContext } from "./cmd-keys.js";
import { ConnectionChecker } from "./connection.js";
import { DeviceManager, type UnitRuntime } from "./device-manager.js";
import { handleOscMessage, type FeedbackContext } from "./feedback-router.js";
import { restoreUnit, sendAlwaysOnFeedback, sendAttributeLeds, resetSegments, sendSlotDigit } from "./feedback-out.js";
import { handleMidiEvent, type InputContext } from "./input-router.js";
import { buildUnit, type Unit } from "./routing-table.js";
import { createRuntimeState, type RuntimeState } from "./state.js";
import { forceReloadMessage, playStartupAnimation, type AnimationHandle } from "./startup.js";
import { cancelTimecodeTimers } from "./timecode.js";
import {
  DEFAULT_TIMING,
  type EngineConfig,
  type EngineEvents,
  type EngineIssue,
  type EngineTiming,
  type TrafficEvent,
} from "./types.js";

/**
 * The engine facade (AC-11): headless, config-driven, start/stop/
 * reconfigure plus typed events. PAM-3/PAM-4 consume exactly this surface;
 * the CLI dev harness runs it against onPC and real hardware.
 */
export class Engine {
  private readonly emitter = new EventEmitter();
  private readonly midiTransport: MidiTransport;
  private readonly oscTransport: OscTransport;

  private state: RuntimeState = createRuntimeState();
  private timing: EngineTiming = DEFAULT_TIMING;
  private cmdContext: CmdKeyContext | undefined;
  private socket: OscSocket | undefined;
  private deviceManager: DeviceManager | undefined;
  private connectionChecker: ConnectionChecker | undefined;
  private animation: AnimationHandle | undefined;
  private animationDone = false;
  private running = false;
  /** On-demand output tests (PAM-4 AC-4), one per mapping at most. */
  private readonly testAnimations = new Map<string, AnimationHandle>();

  constructor(midiTransport: MidiTransport, oscTransport: OscTransport) {
    this.midiTransport = midiTransport;
    this.oscTransport = oscTransport;
  }

  on<E extends keyof EngineEvents>(event: E, listener: EngineEvents[E]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<E extends keyof EngineEvents>(event: E, listener: EngineEvents[E]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Loads the format files, binds devices, opens the OSC socket and runs the
   * startup sequence. Rejects only when nothing can run at all (no valid
   * active mapping, or the UDP port cannot be opened) — everything partial
   * is reported as issues and the engine runs with the valid rest (EC-4).
   */
  async start(config: EngineConfig): Promise<void> {
    if (this.running) throw new Error("engine is already running — use reconfigure()");
    this.running = true;
    this.state = createRuntimeState();
    this.timing = { ...DEFAULT_TIMING, ...config.timing };

    try {
      const units = await this.resolveUnits(config);
      if (units.length === 0) {
        throw new Error(
          "no valid active mapping — the engine has nothing to do (check activeMappingIds and the issue events)"
        );
      }

      const socket = await this.oscTransport.open(
        {
          localPort: config.receivePort,
          remoteAddress: config.consoleAddress,
          remotePort: config.sendPort,
        },
        (message) => this.onOsc(message),
        (error) => this.issue({ severity: "warning", message: error.message })
      );
      this.socket = socket;

      // Every outgoing OSC message passes through here — one tap point (AC-5).
      const sendOsc = (message: OscMessage) => {
        this.traffic({ direction: "osc-out", text: formatOsc(message) });
        socket.send(message);
      };

      this.cmdContext = {
        state: this.state,
        sendOsc,
        timing: this.timing,
        onConsoleChanged: () => this.emitConsole(),
        log: (line) => this.log(line),
      };

      const inputContext: InputContext = {
        state: this.state,
        sendOsc,
        allUnits: () => this.deviceManager?.units ?? [],
        timing: this.timing,
        enqueueCmdKey: (executor) => {
          if (this.cmdContext) enqueueCmdKey(this.cmdContext, executor);
        },
        log: (line) => this.log(line),
      };

      this.deviceManager = new DeviceManager(this.tappedMidiTransport(), this.timing, {
        onEvent: (unitRuntime, event) => handleMidiEvent(inputContext, unitRuntime, event),
        onBind: (unitRuntime) => this.onBind(unitRuntime),
        onStatusChange: (statuses) => this.emitter.emit("devices", statuses),
        log: (line) => this.log(line),
      });

      this.connectionChecker = new ConnectionChecker(
        sendOsc,
        this.timing,
        (status) => this.emitter.emit("connection", status),
        (line) => this.log(line)
      );

      this.animationDone = false;
      this.deviceManager.start(units);

      // Startup (AC-9): animation on what is bound now → restore start state
      // → plugin force-reload → connection check. Later binds skip the show.
      const bound = this.deviceManager.bound();
      this.log(`starting — ${bound.length}/${units.length} device(s) connected`);
      this.animation = playStartupAnimation(bound, this.timing, () => {
        this.animationDone = true;
        for (const unitRuntime of bound) {
          this.initialUnitState(unitRuntime);
        }
        sendOsc(forceReloadMessage());
        this.connectionChecker?.start();
      });
    } catch (error) {
      await this.shutdown();
      this.running = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    await this.shutdown();
    this.running = false;
    this.log("engine stopped");
  }

  /** stop + start in one call — afterwards no stale listener fires (AC-11). */
  async reconfigure(config: EngineConfig): Promise<void> {
    await this.stop();
    await this.start(config);
  }

  /**
   * Manual connection re-check (PAM-4 AC-3) — also after the checker gave
   * up. Ignored while the startup animation still runs: the check starts
   * right afterwards anyway.
   */
  checkConnection(): void {
    if (!this.running || !this.animationDone) return;
    this.connectionChecker?.checkNow();
  }

  /**
   * On-demand MIDI output test for one bound device (PAM-4 AC-4). Restores
   * the live feedback state from the cache afterwards (EC-1).
   */
  outputTest(mappingId: string): { ok: true } | { ok: false; error: string } {
    if (!this.running || !this.deviceManager) return { ok: false, error: "engine is not running" };
    if (!this.animationDone) return { ok: false, error: "startup is still in progress" };
    const unitRuntime = this.deviceManager.units.find((unit) => unit.unit.mapping.id === mappingId);
    if (!unitRuntime) return { ok: false, error: `mapping "${mappingId}" is not active` };
    if (!unitRuntime.connection) return { ok: false, error: "device is not connected" };
    if (this.testAnimations.has(mappingId)) return { ok: false, error: "output test already running" };

    this.log(`MIDI output test on "${mappingId}" ...`);
    const handle = playStartupAnimation([unitRuntime], this.timing, () => {
      this.testAnimations.delete(mappingId);
      restoreUnit(unitRuntime, this.state);
    });
    this.testAnimations.set(mappingId, handle);
    return { ok: true };
  }

  // ---- internals ----

  private async resolveUnits(config: EngineConfig): Promise<Unit[]> {
    const loaded = await loadFormat(config.sources);
    for (const formatIssue of loaded.issues) {
      this.issue({
        severity: formatIssue.severity === "error" ? "error" : "info",
        source: formatIssue.file,
        message: formatIssue.path ? `${formatIssue.path}: ${formatIssue.message}` : formatIssue.message,
      });
    }

    const mappingsById = new Map(loaded.mappings.map((mapping) => [mapping.id, mapping]));
    const devicesById = new Map(loaded.devices.map((device) => [device.id, device]));
    const units: Unit[] = [];
    const issues: EngineIssue[] = [];
    const seenInputPorts = new Map<string, string>();

    for (const mappingId of config.activeMappingIds) {
      const mapping = mappingsById.get(mappingId);
      if (!mapping) {
        this.issue({
          severity: "error",
          source: mappingId,
          message: `active mapping "${mappingId}" was not found (or failed validation) — it is skipped`,
        });
        continue;
      }
      const device = devicesById.get(mapping.deviceDefinitionId);
      if (!device) continue; // loader already reported this
      const previous = seenInputPorts.get(mapping.midiPort.input);
      if (previous) {
        this.issue({
          severity: "warning",
          source: mappingId,
          message: `mappings "${previous}" and "${mappingId}" bind the same MIDI input port "${mapping.midiPort.input}" — both will react to its events`,
        });
      }
      seenInputPorts.set(mapping.midiPort.input, mappingId);
      units.push(buildUnit(mapping, device, issues));
    }

    for (const issue of issues) this.issue(issue);
    return units;
  }

  /** MIDI tap (AC-5): every event and every send crosses this wrapper. */
  private tappedMidiTransport(): MidiTransport {
    const inner = this.midiTransport;
    return {
      listPorts: () => inner.listPorts(),
      open: (inputPort, outputPort, onEvent) => {
        const connection = inner.open(inputPort, outputPort, (event) => {
          this.traffic({ direction: "midi-in", source: inputPort, text: formatMidiIn(event) });
          // Learn tap (PAM-6 AC-4): pass-through, the engine keeps the event.
          this.emitter.emit("midiInput", inputPort, event);
          onEvent(event);
        });
        return {
          send: (message) => {
            this.traffic({ direction: "midi-out", source: inputPort, text: formatMidiOut(message) });
            connection.send(message);
          },
          close: () => connection.close(),
        };
      },
    };
  }

  private onOsc(message: OscMessage): void {
    this.traffic({ direction: "osc-in", text: formatOsc(message) });
    const context: FeedbackContext = {
      state: this.state,
      allUnits: () => this.deviceManager?.units ?? [],
      onConnectionPong: () => this.connectionChecker?.onConnectionPong(),
      onPluginPong: (version) => this.connectionChecker?.onPluginPong(version),
      onCmdKeyAck: (executor) => {
        if (this.cmdContext) onCmdKeyAck(this.cmdContext, executor);
      },
      onConsoleChanged: () => this.emitConsole(),
      log: (line) => this.log(line),
    };
    try {
      handleOscMessage(context, message);
    } catch (error) {
      // EC-3: feedback must never take the engine down.
      this.issue({
        severity: "warning",
        message: `error handling OSC feedback ${message.address}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** Rebind restore (AC-10) — the startup path handles the initial binds itself. */
  private onBind(unitRuntime: UnitRuntime): void {
    if (!this.animationDone) return; // engine start: the animation ends with initialUnitState
    restoreUnit(unitRuntime, this.state);
  }

  /** Start state after the animation (v1: attribute LEDs, permanent feedback, timecode init). */
  private initialUnitState(unitRuntime: UnitRuntime): void {
    sendAlwaysOnFeedback(unitRuntime);
    sendAttributeLeds([unitRuntime], this.state);
    if (unitRuntime.unit.timecodeEnabled && unitRuntime.unit.mcMode) {
      resetSegments(unitRuntime);
      sendSlotDigit(unitRuntime, this.state.timecode.selectedSlot);
    }
  }

  private async shutdown(): Promise<void> {
    this.animation?.cancel();
    this.animation = undefined;
    for (const handle of this.testAnimations.values()) handle.cancel();
    this.testAnimations.clear();
    this.connectionChecker?.stop();
    this.connectionChecker = undefined;
    cancelTimecodeTimers(this.state);
    cancelCmdTimers(this.state);
    this.cmdContext = undefined;
    this.deviceManager?.stop();
    this.deviceManager = undefined;
    if (this.socket) {
      await this.socket.close();
      this.socket = undefined;
    }
  }

  /** DeskLock / CMD-mode / plugin-protocol surface for the UI (PAM-12 AC-9/10). */
  private emitConsole(): void {
    this.emitter.emit("console", {
      deskLocked: this.state.deskLocked,
      cmdFlags: this.state.cmdFlags,
      pluginProtocol: this.state.pluginProtocol,
    });
  }

  private issue(issue: EngineIssue): void {
    this.emitter.emit("issue", issue);
  }

  private traffic(event: TrafficEvent): void {
    this.emitter.emit("traffic", event);
  }

  private log(line: string): void {
    this.emitter.emit("log", line);
  }
}
