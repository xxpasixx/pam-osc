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

  current(): MidiPortList {
    const ports = this.transport.listPorts();
    return { inputs: ports.inputs, outputs: ports.outputs };
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
