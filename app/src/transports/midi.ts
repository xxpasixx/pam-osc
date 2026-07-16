/**
 * MIDI transport boundary. The engine core only ever sees these types; the
 * v1↔v2 wire translation (channels are 1-16 here as in the file format,
 * 0-15 on the wire) happens exactly once, inside the adapter behind this
 * interface — nowhere else.
 */

/** Normalized input: note-off arrives as a note event with value 0 (v1 semantics). */
export type MidiInputEvent =
  | { kind: "note"; channel: number; note: number; value: number }
  | { kind: "cc"; channel: number; controller: number; value: number }
  /** Raw 14-bit value 0-16383. */
  | { kind: "pitchbend"; channel: number; value: number };

export type MidiOutputMessage =
  /**
   * Sent as note-on, velocity 0 = off. All supported boards treat note-on
   * velocity 0 as note-off (MIDI spec), and X-Touch MC *requires* it (v1
   * sent raw 0x90 via sysex for exactly this reason).
   */
  | { kind: "note"; channel: number; note: number; velocity: number }
  | { kind: "cc"; channel: number; controller: number; value: number }
  | { kind: "pitchbend"; channel: number; value: number }
  /** Complete frame including 0xF0 … 0xF7. */
  | { kind: "sysex"; bytes: number[] };

export interface MidiConnection {
  /** Silently does nothing on input-only boards (no output port bound). */
  send(message: MidiOutputMessage): void;
  close(): void;
}

export interface MidiPortSet {
  inputs: string[];
  outputs: string[];
}

export interface MidiTransport {
  listPorts(): MidiPortSet;
  /**
   * Opens the input port (and the output port when given). Throws when a
   * named port is not present — the device manager treats that as "missing".
   */
  open(
    inputPort: string,
    outputPort: string | undefined,
    onEvent: (event: MidiInputEvent) => void,
  ): MidiConnection;
}
