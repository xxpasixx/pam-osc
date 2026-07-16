/**
 * OSC transport boundary. Argument types follow the OSC 1.0 tags the MA3
 * console and the pam-osc Lua plugin actually use: f, i, s, T, F.
 */

export type OscArgument =
  | { type: "float"; value: number }
  | { type: "integer"; value: number }
  | { type: "string"; value: string }
  | { type: "true"; value: true }
  | { type: "false"; value: false };

export interface OscMessage {
  address: string;
  args: OscArgument[];
}

export interface OscSocket {
  /** Sends to the console address the socket was opened with. */
  send(message: OscMessage): void;
  close(): Promise<void>;
}

export interface OscTransportOptions {
  /** Local UDP port console feedback arrives on (the MA3 OSC destination port). */
  localPort: number;
  remoteAddress: string;
  remotePort: number;
}

export interface OscTransport {
  open(
    options: OscTransportOptions,
    onMessage: (message: OscMessage) => void,
    /** Called for malformed packets and socket errors — never throws (EC-3). */
    onError?: (error: Error) => void,
  ): Promise<OscSocket>;
}

/** Convenience constructors — mirror v1's send(..., {type, value}) call sites. */
export const oscFloat = (value: number): OscArgument => ({ type: "float", value });
export const oscInteger = (value: number): OscArgument => ({ type: "integer", value });
export const oscString = (value: string): OscArgument => ({ type: "string", value });
