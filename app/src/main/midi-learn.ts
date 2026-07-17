import type { MidiConnection, MidiInputEvent, MidiTransport } from "../transports/midi.js";
import type { LearnedAddress, MidiLearnEvent, MidiPortList } from "../shared/ipc.js";

/**
 * The PAM-6 MIDI learn session (design → MIDI learn, AC-4). One session at a
 * time, owned by the main process. When the running engine already holds the
 * requested input port, the session listens on the engine's raw pass-through
 * tap (Windows MME cannot open a port twice); otherwise it opens the port
 * temporarily and closes it on capture/cancel. The first qualifying message
 * wins and ends the session — the transport only ever delivers cc/note/
 * pitchbend, so everything that arrives qualifies.
 */

interface Session {
  port: string;
  /** Present only when the session opened the port itself. */
  connection: MidiConnection | undefined;
}

export class MidiLearn {
  private session: Session | undefined;

  constructor(
    private readonly transport: Pick<MidiTransport, "open">,
    private readonly engineHeldPorts: () => Set<string>,
    private readonly emit: (event: MidiLearnEvent) => void
  ) {}

  get active(): boolean {
    return this.session !== undefined;
  }

  start(port: string): { ok: true } | { ok: false; error: string } {
    if (this.session) this.end("replaced");

    if (this.engineHeldPorts().has(port)) {
      this.session = { port, connection: undefined };
      return { ok: true };
    }
    try {
      const connection = this.transport.open(port, undefined, (event) => this.capture(port, event));
      this.session = { port, connection };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `could not listen on "${port}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  cancel(): void {
    if (this.session) this.end("canceled");
  }

  /** Wired to the engine's midiInput event — only tap sessions react. */
  onEngineInput(port: string, event: MidiInputEvent): void {
    if (this.session && this.session.connection === undefined && this.session.port === port) {
      this.capture(port, event);
    }
  }

  /** Wired to the port lister — a vanished port ends the session (design). */
  onPortsChanged(ports: MidiPortList): void {
    if (this.session && !ports.inputs.includes(this.session.port)) {
      this.end("port-lost");
    }
  }

  shutdown(): void {
    this.close();
    this.session = undefined;
  }

  private capture(port: string, event: MidiInputEvent): void {
    const address: LearnedAddress =
      event.kind === "note"
        ? { kind: "note", channel: event.channel, number: event.note }
        : event.kind === "cc"
          ? { kind: "cc", channel: event.channel, number: event.controller }
          : { kind: "pitchbend", channel: event.channel };
    this.close();
    this.session = undefined;
    this.emit({ status: "captured", port, address });
  }

  private end(reason: "canceled" | "port-lost" | "replaced"): void {
    this.close();
    this.session = undefined;
    this.emit({ status: "ended", reason });
  }

  private close(): void {
    try {
      this.session?.connection?.close();
    } catch {
      // A yanked device may throw on close — the session is over either way.
    }
  }
}
