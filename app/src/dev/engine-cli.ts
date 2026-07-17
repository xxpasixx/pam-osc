#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Engine } from "../core/engine/index.js";
import { easymidiTransport } from "../transports/easymidi-transport.js";
import { udpOscTransport } from "../transports/osc-udp.js";

/**
 * Dev harness (spec Technical Requirements): run the engine headless from a
 * JSON config file — against GrandMA3 onPC and real hardware, long before
 * any UI exists.
 *
 *   npm run engine -- --config my-setup.json
 *   npm run engine -- --list-ports
 *
 * Minimal config file (paths are relative to the config file; `sources`
 * defaults to the repo's bundled resources):
 *
 *   {
 *     "consoleAddress": "192.168.0.10",
 *     "sendPort": 8000,
 *     "receivePort": 8001,
 *     "activeMappingIds": ["x-touch-default-1"]
 *   }
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const configSchema = z.object({
  consoleAddress: z.string().min(1),
  sendPort: z.number().int().min(1).max(65535),
  receivePort: z.number().int().min(1).max(65535),
  activeMappingIds: z.array(z.string().min(1)).min(1),
  sources: z
    .array(
      z.object({
        origin: z.enum(["bundled", "user"]),
        devicesDir: z.string(),
        mappingsDir: z.string(),
      })
    )
    .optional(),
});

function fail(message: string): never {
  console.error(`pam-osc engine: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    "list-ports": { type: "boolean", default: false },
  },
});

if (values["list-ports"]) {
  const ports = easymidiTransport.listPorts();
  console.log("MIDI inputs:");
  for (const name of ports.inputs) console.log(`  - ${name}`);
  console.log("MIDI outputs:");
  for (const name of ports.outputs) console.log(`  - ${name}`);
  process.exit(0);
}

if (!values.config) {
  fail("usage: npm run engine -- --config <file.json>   (or --list-ports)");
}

const configPath = resolve(process.cwd(), values.config);
let rawText: string;
try {
  rawText = await readFile(configPath, "utf8");
} catch (error) {
  fail(`could not read config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
}

let rawJson: unknown;
try {
  rawJson = JSON.parse(rawText);
} catch (error) {
  fail(`config file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const parsed = configSchema.safeParse(rawJson);
if (!parsed.success) {
  fail(
    "invalid config file:\n" +
      parsed.error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n")
  );
}

const configDir = dirname(configPath);
const sources = (
  parsed.data.sources ?? [
    {
      origin: "bundled" as const,
      devicesDir: resolve(repoRoot, "resources/devices"),
      mappingsDir: resolve(repoRoot, "resources/mappings"),
    },
  ]
).map((source) => ({
  origin: source.origin,
  devicesDir: resolve(configDir, source.devicesDir),
  mappingsDir: resolve(configDir, source.mappingsDir),
}));

const engine = new Engine(easymidiTransport, udpOscTransport);

engine.on("log", (line) => console.log(`[log] ${line}`));
engine.on("issue", (issue) => {
  const location = issue.source ? ` (${issue.source})` : "";
  console.log(`[${issue.severity}]${location} ${issue.message}`);
});
engine.on("connection", (status) => {
  console.log(`[connection] ${status.state} (attempt ${status.attempt}${status.gaveUp ? ", gave up" : ""})`);
});
engine.on("devices", (statuses) => {
  for (const status of statuses) {
    console.log(`[device] ${status.mappingId} @ "${status.inputPort}": ${status.state}`);
  }
});

console.log(
  `pam-osc engine — console ${parsed.data.consoleAddress}:${parsed.data.sendPort}, feedback on :${parsed.data.receivePort}`
);

// Installed before start() so Ctrl-C during the startup animation still
// closes the MIDI ports and the UDP socket cleanly.
const shutdown = async () => {
  console.log("\nstopping ...");
  await engine.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await engine.start({
    consoleAddress: parsed.data.consoleAddress,
    sendPort: parsed.data.sendPort,
    receivePort: parsed.data.receivePort,
    sources,
    activeMappingIds: parsed.data.activeMappingIds,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
