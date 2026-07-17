import { Input, Output, getInputs, getOutputs } from "easymidi";
import type { Channel } from "easymidi";
import type { MidiConnection, MidiInputEvent, MidiOutputMessage, MidiPortSet, MidiTransport } from "./midi.js";

/** The single place where 1-based format channels meet the 0-based wire. */
const toWire = (channel: number): Channel => (channel - 1) as Channel;
const fromWire = (channel: number): number => channel + 1;

class EasymidiConnection implements MidiConnection {
  constructor(
    private readonly input: Input,
    private readonly output: Output | undefined
  ) {}

  send(message: MidiOutputMessage): void {
    if (!this.output) return;
    switch (message.kind) {
      case "note":
        this.output.send("noteon", {
          note: message.note,
          velocity: message.velocity,
          channel: toWire(message.channel),
        });
        return;
      case "cc":
        this.output.send("cc", {
          controller: message.controller,
          value: message.value,
          channel: toWire(message.channel),
        });
        return;
      case "pitchbend":
        this.output.send("pitch", { value: message.value, channel: toWire(message.channel) });
        return;
      case "sysex":
        this.output.send("sysex", message.bytes);
        return;
    }
  }

  close(): void {
    this.input.close();
    this.output?.close();
  }
}

export const easymidiTransport: MidiTransport = {
  listPorts(): MidiPortSet {
    return { inputs: getInputs(), outputs: getOutputs() };
  },

  open(inputPort, outputPort, onEvent): MidiConnection {
    if (!getInputs().includes(inputPort)) {
      throw new Error(`MIDI input port "${inputPort}" is not connected`);
    }
    if (outputPort !== undefined && !getOutputs().includes(outputPort)) {
      throw new Error(`MIDI output port "${outputPort}" is not connected`);
    }

    const input = new Input(inputPort);
    let output: Output | undefined;
    if (outputPort !== undefined) {
      try {
        output = new Output(outputPort);
      } catch (error) {
        input.close();
        throw error;
      }
    }

    input.on("noteon", (event) => {
      onEvent({ kind: "note", channel: fromWire(event.channel), note: event.note, value: event.velocity });
    });
    input.on("noteoff", (event) => {
      onEvent({ kind: "note", channel: fromWire(event.channel), note: event.note, value: 0 });
    });
    input.on("cc", (event) => {
      onEvent({ kind: "cc", channel: fromWire(event.channel), controller: event.controller, value: event.value });
    });
    input.on("pitch", (event) => {
      onEvent({ kind: "pitchbend", channel: fromWire(event.channel), value: event.value });
    });

    return new EasymidiConnection(input, output);
  },
};
