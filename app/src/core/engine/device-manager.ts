import type { MidiConnection, MidiInputEvent, MidiOutputMessage, MidiTransport } from "../../transports/midi.js";
import type { Unit } from "./routing-table.js";
import type { DeviceStatus, EngineTiming } from "./types.js";

/**
 * One active mapping bound to (hopefully) one connected MIDI unit, plus the
 * feedback cache that lets a replugged device pick up where it left off.
 */
export interface UnitRuntime {
  unit: Unit;
  connection: MidiConnection | undefined;
  /** Last value sent per control — replayed on rebind (AC-10). */
  cache: Map<string, MidiOutputMessage>;
  /** Scribble strip colors, one palette byte per strip index (v1: 8 × "0;0;0;0"). */
  colors: number[];
  /** PAM-10: per-executor RGB button state (running flag + last colour velocity). */
  rgb: Map<number, RgbButtonState>;
}

/** PAM-10: the two async inputs an rgb-color pad combines (running + colour). */
export interface RgbButtonState {
  running: boolean;
  colorVelocity: number;
}

function defaultCacheKey(message: MidiOutputMessage): string {
  switch (message.kind) {
    case "note":
      return `note:${message.channel}:${message.note}`;
    case "cc":
      return `cc:${message.channel}:${message.controller}`;
    case "pitchbend":
      return `pitch:${message.channel}`;
    case "sysex":
      return "sysex";
  }
}

/** Caches, then sends when the unit is bound — silently drops when missing. */
export function sendToUnit(unitRuntime: UnitRuntime, message: MidiOutputMessage, cacheKey?: string): void {
  unitRuntime.cache.set(cacheKey ?? defaultCacheKey(message), message);
  try {
    unitRuntime.connection?.send(message);
  } catch {
    // A device yanked mid-send — the hot-plug poll will notice and rebind.
  }
}

export interface DeviceManagerCallbacks {
  onEvent(unitRuntime: UnitRuntime, event: MidiInputEvent): void;
  /** Fired after a unit (re)binds — the engine restores its feedback state. */
  onBind(unitRuntime: UnitRuntime): void;
  onStatusChange(statuses: DeviceStatus[]): void;
  log(line: string): void;
}

export class DeviceManager {
  readonly units: UnitRuntime[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly transport: MidiTransport,
    private readonly timing: EngineTiming,
    private readonly callbacks: DeviceManagerCallbacks
  ) {}

  /** Binds what is connected now; everything else is picked up by the poll. */
  start(units: Unit[]): void {
    for (const unit of units) {
      this.units.push({ unit, connection: undefined, cache: new Map(), colors: new Array(8).fill(0), rgb: new Map() });
    }
    for (const unitRuntime of this.units) {
      this.tryBind(unitRuntime, false);
    }
    this.callbacks.onStatusChange(this.statuses());
    this.pollTimer = setInterval(() => this.poll(), this.timing.hotplugPollMs);
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    for (const unitRuntime of this.units) {
      unitRuntime.connection?.close();
      unitRuntime.connection = undefined;
    }
    this.units.length = 0;
  }

  statuses(): DeviceStatus[] {
    return this.units.map((unitRuntime) => ({
      mappingId: unitRuntime.unit.mapping.id,
      inputPort: unitRuntime.unit.mapping.midiPort.input,
      outputPort: unitRuntime.unit.mapping.midiPort.output,
      state: unitRuntime.connection ? ("bound" as const) : ("missing" as const),
    }));
  }

  bound(): UnitRuntime[] {
    return this.units.filter((unitRuntime) => unitRuntime.connection !== undefined);
  }

  private tryBind(unitRuntime: UnitRuntime, notify: boolean): void {
    const { input, output } = unitRuntime.unit.mapping.midiPort;
    try {
      unitRuntime.connection = this.transport.open(input, output, (event) =>
        this.callbacks.onEvent(unitRuntime, event)
      );
    } catch {
      unitRuntime.connection = undefined;
      return;
    }
    this.callbacks.log(`MIDI device "${input}" bound (mapping "${unitRuntime.unit.mapping.id}")`);
    this.callbacks.onBind(unitRuntime);
    if (notify) this.callbacks.onStatusChange(this.statuses());
  }

  /** Exact-name matching — a renamed port stays missing by design (EC-5). */
  private poll(): void {
    const ports = this.transport.listPorts();
    let changed = false;

    for (const unitRuntime of this.units) {
      const { input, output } = unitRuntime.unit.mapping.midiPort;
      const present = ports.inputs.includes(input) && (output === undefined || ports.outputs.includes(output));

      if (unitRuntime.connection && !present) {
        unitRuntime.connection.close();
        unitRuntime.connection = undefined;
        changed = true;
        this.callbacks.log(`MIDI device "${input}" disconnected — waiting for it to come back`);
      } else if (!unitRuntime.connection && present) {
        this.tryBind(unitRuntime, false);
        changed = unitRuntime.connection !== undefined;
      }
    }

    if (changed) this.callbacks.onStatusChange(this.statuses());
  }
}
