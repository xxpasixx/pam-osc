import type {
  MidiConnection,
  MidiInputEvent,
  MidiOutputMessage,
  MidiPortSet,
  MidiTransport,
} from "../transports/midi.js";
import type { OscMessage, OscSocket, OscTransport, OscTransportOptions } from "../transports/osc.js";

/** In-memory MIDI transport — deterministic engine unit tests, no CoreMIDI. */
export class FakeMidiConnection implements MidiConnection {
  readonly sent: MidiOutputMessage[] = [];
  closed = false;

  constructor(
    readonly inputPort: string,
    readonly onEvent: (event: MidiInputEvent) => void
  ) {}

  send(message: MidiOutputMessage): void {
    if (this.closed) throw new Error("send on closed connection");
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
  }

  /** Simulates the hardware sending an event. */
  emit(event: MidiInputEvent): void {
    this.onEvent(event);
  }
}

export class FakeMidiTransport implements MidiTransport {
  ports: MidiPortSet = { inputs: [], outputs: [] };
  readonly connections: FakeMidiConnection[] = [];

  listPorts(): MidiPortSet {
    return { inputs: [...this.ports.inputs], outputs: [...this.ports.outputs] };
  }

  open(inputPort: string, outputPort: string | undefined, onEvent: (event: MidiInputEvent) => void): MidiConnection {
    if (!this.ports.inputs.includes(inputPort)) {
      throw new Error(`MIDI input port "${inputPort}" is not connected`);
    }
    if (outputPort !== undefined && !this.ports.outputs.includes(outputPort)) {
      throw new Error(`MIDI output port "${outputPort}" is not connected`);
    }
    const connection = new FakeMidiConnection(inputPort, onEvent);
    this.connections.push(connection);
    return connection;
  }

  /** The most recent open connection for a port — what the engine holds. */
  connection(inputPort: string): FakeMidiConnection {
    const found = [...this.connections].reverse().find((c) => c.inputPort === inputPort && !c.closed);
    if (!found) throw new Error(`no open fake connection for "${inputPort}"`);
    return found;
  }

  /** All feedback ever sent to a port, across rebinds. */
  allSent(inputPort: string): MidiOutputMessage[] {
    return this.connections.filter((c) => c.inputPort === inputPort).flatMap((c) => c.sent);
  }
}

/** In-memory OSC transport. */
export class FakeOscSocket implements OscSocket {
  readonly sent: OscMessage[] = [];
  closed = false;

  constructor(
    readonly options: OscTransportOptions,
    readonly onMessage: (message: OscMessage) => void
  ) {}

  send(message: OscMessage): void {
    this.sent.push(message);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Simulates console feedback arriving. */
  inject(message: OscMessage): void {
    this.onMessage(message);
  }

  commands(): string[] {
    return this.sent
      .filter((message) => message.address === "/cmd")
      .map((message) => (message.args[0]?.type === "string" ? message.args[0].value : ""));
  }
}

export class FakeOscTransport implements OscTransport {
  readonly sockets: FakeOscSocket[] = [];
  failNextOpen = false;

  open(
    options: OscTransportOptions,
    onMessage: (message: OscMessage) => void,
    _onError?: (error: Error) => void
  ): Promise<OscSocket> {
    if (this.failNextOpen) {
      this.failNextOpen = false;
      return Promise.reject(new Error(`UDP port ${options.localPort} is already in use`));
    }
    const socket = new FakeOscSocket(options, onMessage);
    this.sockets.push(socket);
    return Promise.resolve(socket);
  }

  socket(): FakeOscSocket {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error("no fake OSC socket open");
    return socket;
  }
}
