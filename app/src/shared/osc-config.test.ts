import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOscConfigXml, isIpv4, parseOscConfigValues } from "./osc-config.js";

/** PAM-35 AC-5: the generated OSC config. */

const bundledOscXml = resolve(__dirname, "../../../gma3_library/inout/osc/pam-osc.xml");

describe("buildOscConfigXml", () => {
  it("default values reproduce the bundled console export byte for byte (parity)", () => {
    const generated = buildOscConfigXml({ feedbackIp: "127.0.0.1", sendPort: 9003, receivePort: 9004 });
    expect(generated).toBe(readFileSync(bundledOscXml, "utf8"));
  });

  it("writes this computer's address and the user's ports into both entries", () => {
    const xml = buildOscConfigXml({ feedbackIp: "192.168.1.20", sendPort: 8000, receivePort: 8001 });
    const receive = xml.match(/<OSCData Name="pam-osc-receive"[^>]*\/>/)?.[0] ?? "";
    const send = xml.match(/<OSCData Name="pam-osc" [^>]*\/>/)?.[0] ?? "";
    expect(receive).toContain('DestinationIP="192.168.1.20"');
    expect(receive).toContain('Port="8000"');
    expect(receive).toContain('SendCommand="No"');
    expect(send).toContain('DestinationIP="192.168.1.20"');
    expect(send).toContain('Port="8001"');
    // Send Command stays at its (on) default — exactly like the working export.
    expect(send).not.toContain("SendCommand");
    expect(send).toContain('ReceiveCommand="No"');
  });
});

describe("parseOscConfigValues", () => {
  it("accepts valid values", () => {
    expect(parseOscConfigValues({ feedbackIp: "10.0.0.5", sendPort: 9003, receivePort: 9004 })).toEqual({
      feedbackIp: "10.0.0.5",
      sendPort: 9003,
      receivePort: 9004,
    });
  });

  it("rejects anything that could break out of the XML attribute", () => {
    const result = parseOscConfigValues({ feedbackIp: '1.2.3.4" Evil="x', sendPort: 9003, receivePort: 9004 });
    expect(result).toHaveProperty("error");
  });

  it("rejects hostnames, bad octets, bad ports and missing input", () => {
    expect(parseOscConfigValues({ feedbackIp: "console.local", sendPort: 9003, receivePort: 9004 })).toHaveProperty(
      "error"
    );
    expect(parseOscConfigValues({ feedbackIp: "256.1.1.1", sendPort: 9003, receivePort: 9004 })).toHaveProperty(
      "error"
    );
    expect(parseOscConfigValues({ feedbackIp: "10.0.0.5", sendPort: 0, receivePort: 9004 })).toHaveProperty("error");
    expect(parseOscConfigValues({ feedbackIp: "10.0.0.5", sendPort: 9003, receivePort: 70000 })).toHaveProperty(
      "error"
    );
    expect(parseOscConfigValues({ feedbackIp: "10.0.0.5", sendPort: "9003", receivePort: 9004 })).toHaveProperty(
      "error"
    );
    expect(parseOscConfigValues(undefined)).toHaveProperty("error");
  });

  it("isIpv4 checks the octet range", () => {
    expect(isIpv4("192.168.0.1")).toBe(true);
    expect(isIpv4("192.168.0.256")).toBe(false);
    expect(isIpv4("192.168.0")).toBe(false);
  });
});
