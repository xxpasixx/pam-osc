import type { SettingsDraft } from "./schema.js";

/**
 * The exact validation rules from the PAM-3 design (AC-6). Pure — the
 * renderer uses it for instant inline errors, the main process enforces it
 * in the Save transaction. Field names match the IPC FieldError contract.
 */

export interface DraftFieldError {
  field: string;
  message: string;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

function isValidAddress(address: string): boolean {
  const ipv4 = IPV4.exec(address);
  if (ipv4) {
    return ipv4.slice(1).every((octet) => Number.parseInt(octet, 10) <= 255);
  }
  return HOSTNAME.test(address);
}

function isLocalAddress(address: string): boolean {
  return address === "127.0.0.1" || address.toLowerCase() === "localhost";
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** `validMappingIds` = ids the catalog currently lists as valid. */
export function validateDraft(draft: SettingsDraft, validMappingIds: ReadonlySet<string>): DraftFieldError[] {
  const errors: DraftFieldError[] = [];
  const { address, sendPort, receivePort } = draft.console;

  if (address.trim() === "") {
    errors.push({ field: "console.address", message: "Console address is required" });
  } else if (!isValidAddress(address.trim())) {
    errors.push({
      field: "console.address",
      message: "Enter an IPv4 address (e.g. 192.168.0.10) or a hostname — no spaces, no port suffix",
    });
  }

  if (!isValidPort(sendPort)) {
    errors.push({ field: "console.sendPort", message: "Send port must be 1–65535" });
  }
  if (!isValidPort(receivePort)) {
    errors.push({ field: "console.receivePort", message: "Receive port must be 1–65535" });
  }
  if (isValidPort(sendPort) && sendPort === receivePort && isLocalAddress(address.trim())) {
    errors.push({
      field: "console.receivePort",
      message: "Send and receive port must differ when the console runs on this machine",
    });
  }

  const seenInputs = new Map<string, string>();
  const seenOutputs = new Map<string, string>();
  const seenIds = new Set<string>();
  for (const mapping of draft.activeMappings) {
    const fieldBase = `mapping:${mapping.id}`;
    if (!validMappingIds.has(mapping.id)) {
      errors.push({ field: fieldBase, message: `Mapping "${mapping.id}" does not exist or is invalid` });
      continue;
    }
    // PAM-11 AC-5: switching a row's mapping must not activate one twice.
    if (seenIds.has(mapping.id)) {
      errors.push({ field: fieldBase, message: `Mapping "${mapping.id}" is active more than once — pick another one` });
      continue;
    }
    seenIds.add(mapping.id);
    if (!mapping.input || mapping.input.trim() === "") {
      errors.push({ field: `${fieldBase}.input`, message: "Pick a MIDI input port" });
    } else {
      const previous = seenInputs.get(mapping.input);
      if (previous) {
        errors.push({
          field: `${fieldBase}.input`,
          message: `MIDI input "${mapping.input}" is already used by "${previous}" — a physical unit belongs to exactly one mapping`,
        });
      }
      seenInputs.set(mapping.input, mapping.id);
    }
    if (mapping.output && mapping.output.trim() !== "") {
      const previous = seenOutputs.get(mapping.output);
      if (previous) {
        errors.push({
          field: `${fieldBase}.output`,
          message: `MIDI output "${mapping.output}" is already used by "${previous}"`,
        });
      }
      seenOutputs.set(mapping.output, mapping.id);
    }
  }

  return errors;
}
