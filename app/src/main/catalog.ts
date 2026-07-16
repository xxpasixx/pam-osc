import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadFormat, type FormatSource, type LoadResult } from "../core/format/index.js";
import type { ActiveMappingDraft } from "../core/settings/schema.js";
import type { CatalogEntry, InvalidCatalogEntry, Notice } from "../shared/ipc.js";

/**
 * The mapping catalog (design → Mapping catalog): every mapping the user
 * can activate, bundled + user, with per-file validity (EC-4). Handles
 * copy-on-activate, port rewrites, and duplicate-for-second-unit.
 * Electron-free — paths are injected.
 */

export interface CatalogPaths {
  bundledDevicesDir: string;
  bundledMappingsDir: string;
  userDevicesDir: string;
  userMappingsDir: string;
}

export class Catalog {
  private loaded: LoadResult = { devices: [], mappings: [], issues: [], mappingSources: [] };
  private sourceById = new Map<string, { origin: "bundled" | "user"; file: string }>();

  constructor(private readonly paths: CatalogPaths) {}

  sources(): FormatSource[] {
    return [
      { origin: "bundled", devicesDir: this.paths.bundledDevicesDir, mappingsDir: this.paths.bundledMappingsDir },
      { origin: "user", devicesDir: this.paths.userDevicesDir, mappingsDir: this.paths.userMappingsDir },
    ];
  }

  async refresh(): Promise<void> {
    await mkdir(this.paths.userDevicesDir, { recursive: true });
    await mkdir(this.paths.userMappingsDir, { recursive: true });
    this.loaded = await loadFormat(this.sources());

    // The loader resolves shadowing (user file with the same id wins) and
    // reports each surviving mapping's origin + actual file path.
    this.sourceById.clear();
    for (const source of this.loaded.mappingSources) {
      this.sourceById.set(source.id, { origin: source.origin, file: source.file });
    }
  }

  validIds(): Set<string> {
    return new Set(this.loaded.mappings.map((mapping) => mapping.id));
  }

  entries(): CatalogEntry[] {
    const devicesById = new Map(this.loaded.devices.map((device) => [device.id, device]));
    return this.loaded.mappings.map((mapping) => ({
      id: mapping.id,
      name: mapping.name,
      boardName: devicesById.get(mapping.deviceDefinitionId)?.name ?? mapping.deviceDefinitionId,
      origin: this.sourceById.get(mapping.id)?.origin ?? "bundled",
      midiPort: { input: mapping.midiPort.input, output: mapping.midiPort.output },
      valid: true as const,
    }));
  }

  /** Files that failed validation — greyed out in the picker (EC-4). */
  invalidFiles(): InvalidCatalogEntry[] {
    const byFile = new Map<string, string>();
    for (const issue of this.loaded.issues) {
      if (issue.severity !== "error") continue;
      if (!byFile.has(issue.file)) {
        byFile.set(issue.file, issue.path ? `${issue.path}: ${issue.message}` : issue.message);
      }
    }
    return [...byFile.entries()].map(([file, error]) => ({ file: basename(file), error, valid: false as const }));
  }

  /** Loader notices (shadowing info etc.) for the notices area. */
  notices(): Notice[] {
    return this.loaded.issues
      .filter((issue) => issue.severity === "info")
      .map((issue) => ({ severity: "info" as const, source: basename(issue.file), message: issue.message }));
  }

  /**
   * The Save transaction's step 2 (design): make every active mapping's file
   * carry the chosen ports. Bundled → materialize a user copy (same id,
   * shadowing wins); user → rewrite when ports changed. These writes are
   * user intent and survive an engine rollback.
   */
  async materializePorts(mappings: ActiveMappingDraft[]): Promise<void> {
    let changed = false;
    for (const active of mappings) {
      const source = this.sourceById.get(active.id);
      if (!source) continue; // validated earlier — defensive
      const raw = JSON.parse(await readFile(source.file, "utf8")) as {
        midiPort?: { input?: string; output?: string };
      };
      const samePorts = raw.midiPort?.input === active.input && raw.midiPort?.output === active.output;
      if (source.origin === "user" && samePorts) continue;

      raw.midiPort = active.output ? { input: active.input, output: active.output } : { input: active.input };
      // Bundled activations materialize as <id>.json in the user folder
      // (shadowing makes the copy win); user files are rewritten in place.
      const targetFile = source.origin === "bundled" ? join(this.paths.userMappingsDir, `${active.id}.json`) : source.file;
      await writeFile(targetFile, JSON.stringify(raw, null, 2) + "\n", "utf8");
      changed = true;
    }
    if (changed) await this.refresh();
  }

  /** "Duplicate" for a second unit: user copy with the first free id suffix. */
  async duplicate(id: string): Promise<CatalogEntry | { error: string }> {
    const source = this.sourceById.get(id);
    if (!source) return { error: `mapping "${id}" not found` };

    let raw: { id?: string; name?: string };
    try {
      raw = JSON.parse(await readFile(source.file, "utf8")) as { id?: string; name?: string };
    } catch (error) {
      return { error: `could not read mapping "${id}": ${error instanceof Error ? error.message : String(error)}` };
    }

    const existing = this.validIds();
    let suffix = 2;
    while (existing.has(`${id}-${suffix}`)) suffix += 1;
    raw.id = `${id}-${suffix}`;
    raw.name = `${raw.name ?? id} (${suffix})`;

    await writeFile(join(this.paths.userMappingsDir, `${raw.id}.json`), JSON.stringify(raw, null, 2) + "\n", "utf8");
    await this.refresh();
    const entry = this.entries().find((candidate) => candidate.id === raw.id);
    return entry ?? { error: `duplicate of "${id}" was written but failed validation — check the file` };
  }
}
