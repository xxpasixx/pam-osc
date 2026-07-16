import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadFormat, type FormatSource } from "./loader.js";
import { minimalDevice, minimalMapping } from "./schemas.test.js";

let bundled: { devicesDir: string; mappingsDir: string };
let user: { devicesDir: string; mappingsDir: string };

function sources(): FormatSource[] {
  return [
    { origin: "bundled", ...bundled },
    { origin: "user", ...user },
  ];
}

async function write(dir: string, name: string, content: unknown) {
  await writeFile(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "pam-osc-test-"));
  bundled = { devicesDir: join(root, "bundled/devices"), mappingsDir: join(root, "bundled/mappings") };
  user = { devicesDir: join(root, "user/devices"), mappingsDir: join(root, "user/mappings") };
  for (const dir of [bundled.devicesDir, bundled.mappingsDir, user.devicesDir, user.mappingsDir]) {
    await mkdir(dir, { recursive: true });
  }
});

describe("loadFormat", () => {
  it("loads valid devices and mappings without issues", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    await write(bundled.mappingsDir, "test-mapping.json", minimalMapping());
    const result = await loadFormat(sources());
    expect(result.issues).toEqual([]);
    expect(result.devices.map((device) => device.id)).toEqual(["test-board"]);
    expect(result.mappings.map((mapping) => mapping.id)).toEqual(["test-mapping"]);
  });

  it("tolerates missing user directories", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    const result = await loadFormat([
      { origin: "bundled", ...bundled },
      { origin: "user", devicesDir: join(user.devicesDir, "missing"), mappingsDir: join(user.mappingsDir, "missing") },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.devices).toHaveLength(1);
  });

  it("reports broken JSON with the file name and keeps loading", async () => {
    await write(bundled.devicesDir, "broken.json", "{ not json");
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    const result = await loadFormat(sources());
    expect(result.devices).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: "error", file: join(bundled.devicesDir, "broken.json") });
    expect(result.issues[0]?.message).toContain("not valid JSON");
  });

  it("reports schema violations with file, path, and problem (AC-4)", async () => {
    const device = minimalDevice();
    (device.controls as { midi: unknown }[])[1]!.midi = { kind: "note", number: 999 };
    await write(bundled.devicesDir, "test-board.json", device);
    const result = await loadFormat(sources());
    expect(result.devices).toHaveLength(0);
    const issue = result.issues[0];
    expect(issue?.severity).toBe("error");
    expect(issue?.path).toBe("controls[1].midi.number");
  });

  it("rejects files from a newer pam-osc with a clear message (AC-4)", async () => {
    await write(bundled.devicesDir, "future.json", minimalDevice({ formatVersion: 99 }));
    const result = await loadFormat(sources());
    expect(result.devices).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("newer pam-osc");
  });

  it("skips a mapping whose device definition is unknown", async () => {
    await write(bundled.mappingsDir, "orphan.json", minimalMapping({ deviceDefinitionId: "no-such-board" }));
    const result = await loadFormat(sources());
    expect(result.mappings).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('unknown device definition "no-such-board"');
  });

  it("skips a mapping that assigns a control the device does not have", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    const mapping = minimalMapping({
      assignments: [{ controlId: "ghost", action: { type: "executor", number: 201 } }],
    });
    await write(bundled.mappingsDir, "test-mapping.json", mapping);
    const result = await loadFormat(sources());
    expect(result.mappings).toHaveLength(0);
    expect(result.issues[0]?.path).toBe("assignments[0].controlId");
  });

  it("rejects feedback a control's capabilities cannot do", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    const mapping = minimalMapping({
      assignments: [{ controlId: "btn-1", action: { type: "executor", number: 201 }, feedback: { type: "fader-position" } }],
    });
    await write(bundled.mappingsDir, "test-mapping.json", mapping);
    const result = await loadFormat(sources());
    expect(result.mappings).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("motorized fader");
  });

  it("lets two mappings share one device definition with different ports (AC-5)", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice());
    await write(bundled.mappingsDir, "unit-a.json", minimalMapping({ id: "unit-a", midiPort: { input: "Board A" } }));
    await write(bundled.mappingsDir, "unit-b.json", minimalMapping({ id: "unit-b", midiPort: { input: "Board B" } }));
    const result = await loadFormat(sources());
    expect(result.issues).toEqual([]);
    expect(result.mappings.map((mapping) => mapping.midiPort.input).sort()).toEqual(["Board A", "Board B"]);
  });

  it("lets a user file shadow a bundled one with an info notice (AC-6)", async () => {
    await write(bundled.devicesDir, "test-board.json", minimalDevice({ name: "Bundled Name" }));
    await write(user.devicesDir, "my-board.json", minimalDevice({ name: "User Name" }));
    const result = await loadFormat(sources());
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.name).toBe("User Name");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: "info" });
    expect(result.issues[0]?.message).toContain("overrides the bundled version");
  });

  it("reports duplicate ids within the same origin as an error and keeps the first", async () => {
    await write(bundled.devicesDir, "a.json", minimalDevice({ name: "First" }));
    await write(bundled.devicesDir, "b.json", minimalDevice({ name: "Second" }));
    const result = await loadFormat(sources());
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]?.name).toBe("First");
    expect(result.issues[0]?.severity).toBe("error");
    expect(result.issues[0]?.message).toContain("duplicate device definition id");
  });
});
