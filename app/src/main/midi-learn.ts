import type { MidiConnection, MidiInputEvent, MidiTransport } from "../transports/midi.js";
import type { LearnedAddress, MidiActivityEvent, MidiLearnEvent, MidiPortList } from "../shared/ipc.js";

/**
 * The PAM-6 MIDI monitor session (design → MIDI learn / Indicate mode).
 * One session at a time, owned by the main process, in one of two modes:
 * - "learn" (AC-4): the first qualifying message wins and ends the session.
 * - "indicate" (AC-11): continuous; addresses are batched (≤ every 50 ms)
 *   to the renderer, which flashes the matching controls. View-only —
 *   the tap never feeds anything back into the engine.
 * When the running engine already holds the requested input port, the
 * session listens on the engine's raw pass-through tap (Windows MME cannot
 * open a port twice); otherwise it opens the port temporarily.
 */

const FLUSH_MS = 50;

interface Session {
  mode: "learn" | "indicate";
  port: string;
  /** Present only when the session opened the port itself. */
  connection: MidiConnection | undefined;
}

export class MidiLearn {
  private session: Session | undefined;
  private pending: LearnedAddress[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly transport: Pick<MidiTransport, "open">,
    private readonly engineHeldPorts: () => Set<string>,
    private readonly emit: (event: MidiLearnEvent) => void,
    private readonly emitActivity: (event: MidiActivityEvent) => void
  ) {}

  get active(): boolean {
    return this.session !== undefined;
  }

  start(port: string): { ok: true } | { ok: false; error: string } {
    return this.startSession("learn", port);
  }

  startIndicate(port: string): { ok: true } | { ok: false; error: string } {
    return this.startSession("indicate", port);
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
    this.clearFlush();
  }

  private startSession(mode: Session["mode"], port: string): { ok: true } | { ok: false; error: string } {
    if (this.session) this.end("replaced");

    if (this.engineHeldPorts().has(port)) {
      this.session = { mode, port, connection: undefined };
      return { ok: true };
    }
    try {
      const connection = this.transport.open(port, undefined, (event) => this.capture(port, event));
      this.session = { mode, port, connection };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `could not listen on "${port}": ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private capture(port: string, event: MidiInputEvent): void {
    const address: LearnedAddress =
      event.kind === "note"
        ? { kind: "note", channel: event.channel, number: event.note }
        : event.kind === "cc"
          ? { kind: "cc", channel: event.channel, number: event.controller }
          : { kind: "pitchbend", channel: event.channel };

    if (this.session?.mode === "indicate") {
      this.pending.push(address);
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = undefined;
          if (!this.session || this.pending.length === 0) return;
          this.emitActivity({ port: this.session.port, addresses: this.pending });
          this.pending = [];
        }, FLUSH_MS);
      }
      return;
    }

    this.close();
    this.session = undefined;
    this.emit({ status: "captured", port, address });
  }

  private end(reason: "canceled" | "port-lost" | "replaced"): void {
    this.close();
    this.session = undefined;
    this.clearFlush();
    this.emit({ status: "ended", reason });
  }

  private close(): void {
    try {
      this.session?.connection?.close();
    } catch {
      // A yanked device may throw on close — the session is over either way.
    }
  }

  private clearFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.pending = [];
  }
}
