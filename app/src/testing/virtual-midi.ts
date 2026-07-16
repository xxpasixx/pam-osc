import { Input, Output } from "easymidi";
import type { Channel } from "easymidi";

/**
 * Simulates a hardware MIDI board via virtual ports (macOS/Linux; Windows
 * needs loopMIDI — CI runs on macOS/Linux, see AGENTS.md).
 *
 * Direction naming is from the board's point of view: the board *sends*
 * input events to the engine and *receives* the engine's feedback. All
 * values here are wire-level (0-based channels), so tests assert the exact
 * bytes real hardware would see.
 */

export type WireMessage =
  | { kind: "noteon"; channel: number; note: number; velocity: number }
  | { kind: "noteoff"; channel: number; note: number; velocity: number }
  | { kind: "cc"; channel: number; controller: number; value: number }
  | { kind: "pitch"; channel: number; value: number }
  | { kind: "sysex"; bytes: number[] };

export class VirtualMidiDevice {
  /** Everything the engine sent to the board, in arrival order. */
  readonly received: WireMessage[] = [];

  private readonly source: Output; // appears in the engine's input list
  private readonly sink: Input; // appears in the engine's output list

  constructor(readonly name: string) {
    this.source = new Output(name, true);
    this.sink = new Input(name, true);

    this.sink.on("noteon", (m) => this.received.push({ kind: "noteon", channel: m.channel, note: m.note, velocity: m.velocity }));
    this.sink.on("noteoff", (m) => this.received.push({ kind: "noteoff", channel: m.channel, note: m.note, velocity: m.velocity }));
    this.sink.on("cc", (m) => this.received.push({ kind: "cc", channel: m.channel, controller: m.controller, value: m.value }));
    this.sink.on("pitch", (m) => this.received.push({ kind: "pitch", channel: m.channel, value: m.value }));
    this.sink.on("sysex", (m) => this.received.push({ kind: "sysex", bytes: [...m.bytes] }));
  }

  /** The board sends … (wire-level, 0-based channel). */
  sendNoteOn(note: number, velocity: number, channel = 0): void {
    this.source.send("noteon", { note, velocity, channel: channel as Channel });
  }
  sendNoteOff(note: number, velocity = 0, channel = 0): void {
    this.source.send("noteoff", { note, velocity, channel: channel as Channel });
  }
  sendCc(controller: number, value: number, channel = 0): void {
    this.source.send("cc", { controller, value, channel: channel as Channel });
  }
  sendPitch(value: number, channel = 0): void {
    this.source.send("pitch", { value, channel: channel as Channel });
  }

  clearReceived(): void {
    this.received.length = 0;
  }

  close(): void {
    this.source.close();
    this.sink.close();
  }
}

/** Polls until the predicate holds — virtual MIDI delivery is asynchronous. */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000, stepMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}
