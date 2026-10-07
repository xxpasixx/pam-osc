/**
 * PAM-35 AC-5: the GrandMA3 OSC config, generated from the user's live values
 * instead of shipping one static file. Node-free (shared/), so the renderer can
 * use the validators too; the main process writes the file and re-validates
 * everything the renderer sends.
 *
 * The XML mirrors the maintainer's working console export attribute for
 * attribute (gma3_library/inout/osc/pam-osc.xml): toggles that are on stay
 * omitted — MA3 exports leave defaults out — and only DestinationIP / Port
 * change. A parity test pins the default generation to the bundled file.
 */

export interface OscConfigValues {
  /** This computer's address as seen from the console — where feedback goes. */
  feedbackIp: string;
  /** Port the console listens on (the receive entry). */
  sendPort: number;
  /** Port pam-osc listens on (the send entry named "pam-osc"). */
  receivePort: number;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4(value: string): boolean {
  const match = IPV4.exec(value);
  return match !== null && match.slice(1).every((octet) => Number.parseInt(octet, 10) <= 255);
}

export function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * Validates untrusted input (IPC) into OscConfigValues — the IP is the only
 * string that reaches the XML, so a strict IPv4 check also rules out markup
 * injection. Returns an error message instead of throwing.
 */
export function parseOscConfigValues(raw: unknown): OscConfigValues | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "missing OSC values" };
  const { feedbackIp, sendPort, receivePort } = raw as Record<string, unknown>;
  if (typeof feedbackIp !== "string" || !isIpv4(feedbackIp)) {
    return { error: "this computer's address must be an IPv4 address" };
  }
  if (!isPort(sendPort) || !isPort(receivePort)) return { error: "ports must be 1–65535" };
  return { feedbackIp, sendPort, receivePort };
}

export function buildOscConfigXml(values: OscConfigValues): string {
  const { feedbackIp, sendPort, receivePort } = values;
  return (
    "﻿" +
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<GMA3 DataVersion="2.4.2.2">\n' +
    `    <OSCData Name="pam-osc-receive" Guid="39 E2 33 AB 06 90 10 02 51 E0 89 DF C3 77 60 47" DestinationIP="${feedbackIp}" Mode="UDP" Port="${sendPort}" Send="No" SendCommand="No" EchoInput="No" EchoOutput="No"/>\n` +
    `    <OSCData Name="pam-osc" Guid="39 E2 33 AB 04 A1 10 02 EE 69 B1 C0 70 6B 97 47" DestinationIP="${feedbackIp}" Mode="UDP" Port="${receivePort}" Receive="No" Send="No" ReceiveCommand="No" EchoInput="No" EchoOutput="No"/>\n` +
    "</GMA3>\n"
  );
}
