import type { MidiInputEvent, MidiOutputMessage } from "../../transports/midi.js";
import type { OscArgument, OscMessage } from "../../transports/osc.js";

/**
 * Human-readable one-liners for the traffic log (PAM-4 AC-5). Formatted here
 * once so the UI and tests see the same text.
 */

export function formatMidiIn(event: MidiInputEvent): string {
  switch (event.kind) {
    case "note":
      return `note ${event.note} ch${event.channel} = ${event.value}`;
    case "cc":
      return `cc ${event.controller} ch${event.channel} = ${event.value}`;
    case "pitchbend":
      return `pitch ch${event.channel} = ${event.value}`;
  }
}

export function formatMidiOut(message: MidiOutputMessage): string {
  switch (message.kind) {
    case "note":
      return `note ${message.note} ch${message.channel} = ${message.velocity}`;
    case "cc":
      return `cc ${message.controller} ch${message.channel} = ${message.value}`;
    case "pitchbend":
      return `pitch ch${message.channel} = ${message.value}`;
    case "sysex":
      return `sysex (${message.bytes.length} bytes)`;
  }
}

function formatOscArgument(argument: OscArgument): string {
  switch (argument.type) {
    case "float":
      return String(Math.round(argument.value * 1000) / 1000);
    case "integer":
      return String(argument.value);
    case "string":
      return JSON.stringify(argument.value);
    case "true":
      return "true";
    case "false":
      return "false";
  }
}

export function formatOsc(message: OscMessage): string {
  if (message.args.length === 0) return message.address;
  return `${message.address} ${message.args.map(formatOscArgument).join(" ")}`;
}
