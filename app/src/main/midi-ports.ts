import type { MidiTransport } from "../transports/midi.js";
import type { MidiPortList } from "../shared/ipc.js";

/**
 * Lists the connected MIDI ports for the port pickers and pushes changes
 * while the window is open (design: poll every 2 s). The engine has its own
 * hot-plug poll — this one only feeds the UI.
 */
export class MidiPortLister {
  private timer: ReturnType<typeof setInterval> | undefined;
  private last = "";

  constructor(
    private readonly transport: Pick<MidiTransport, "listPorts">,
    private readonly onChange: (ports: MidiPortList) => void,
    private readonly intervalMs = 2000,
  ) {}

  private lastKnown: MidiPortList = { inputs: [], outputs: [] };

  /** Native port enumeration can throw; the poll must never crash the main process. */
  current(): MidiPortList {
    try {
      const ports = this.transport.listPorts();
      this.lastKnown = { inputs: ports.inputs, outputs: ports.outputs };
    } catch {
      // Keep serving the last successful list; the next tick retries.
    }
    return this.lastKnown;
  }

  start(): void {
    if (this.timer) return;
    this.last = JSON.stringify(this.current());
    this.timer = setInterval(() => {
      const ports = this.current();
      const serialized = JSON.stringify(ports);
      if (serialized !== this.last) {
        this.last = serialized;
        this.onChange(ports);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
