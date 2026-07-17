import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  CURRENT_FORMAT_VERSION,
  loadFormat,
  mappingSchema,
  orphanedAssignments,
  suffixedCopy,
  validateDeviceDraft,
  validateMappingDraft,
  type DeviceDefinition,
  type EditorIssue,
  type FormatSource,
  type LoadResult,
  type MappingRef,
} from "../core/format/index.js";
import { makeUniqueId } from "../core/import/index.js";
import type { ActiveMappingDraft } from "../core/settings/schema.js";
import type {
  BoardInfo,
  CatalogEntry,
  ControlUsageEntry,
  DeviceEditData,
  InvalidCatalogEntry,
  MappingEditData,
  Notice,
  SaveDeviceRequest,
  UsageRef,
} from "../shared/ipc.js";

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
  private loaded: LoadResult = { devices: [], mappings: [], issues: [], mappingSources: [], deviceSources: [] };
  private sourceById = new Map<string, { origin: "bundled" | "user"; file: string }>();
  private deviceSourceById = new Map<string, { origin: "bundled" | "user"; file: string }>();

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
    this.deviceSourceById.clear();
    for (const source of this.loaded.deviceSources) {
      this.deviceSourceById.set(source.id, { origin: source.origin, file: source.file });
    }
  }

  validIds(): Set<string> {
    return new Set(this.loaded.mappings.map((mapping) => mapping.id));
  }

  /** All loaded device definitions for dropdowns and the boards manager, alphabetical. */
  boards(): BoardInfo[] {
    return this.loaded.devices
      .map((device) => ({
        id: device.id,
        name: device.name,
        origin: this.deviceSourceById.get(device.id)?.origin ?? "bundled",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  device(id: string): DeviceDefinition | undefined {
    return this.loaded.devices.find((device) => device.id === id);
  }

  get userMappingsDirPath(): string {
    return this.paths.userMappingsDir;
  }

  entries(): CatalogEntry[] {
    const devicesById = new Map(this.loaded.devices.map((device) => [device.id, device]));
    return this.loaded.mappings.map((mapping) => ({
      id: mapping.id,
      name: mapping.name,
      deviceDefinitionId: mapping.deviceDefinitionId,
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
      const targetFile =
        source.origin === "bundled" ? join(this.paths.userMappingsDir, `${active.id}.json`) : source.file;
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

    // Duplicating a duplicate counts up from the original: x-touch-2 → x-touch-3,
    // "Name (2)" → "Name (3)" — never "x-touch-2-2" / "Name (2) (2)". Only
    // treat a trailing number as a duplicate suffix when the base id actually
    // exists ("launchpad-mk-2" without a "launchpad-mk" stays untouched).
    const existing = this.validIds();
    const stripped = id.replace(/-\d+$/, "");
    const isDuplicateOf = stripped !== id && existing.has(stripped);
    const baseId = isDuplicateOf ? stripped : id;
    const baseName = isDuplicateOf ? (raw.name ?? id).replace(/ \(\d+\)$/, "") : (raw.name ?? id);
    let suffix = 2;
    while (existing.has(`${baseId}-${suffix}`)) suffix += 1;
    raw.id = `${baseId}-${suffix}`;
    raw.name = `${baseName} (${suffix})`;

    await writeFile(join(this.paths.userMappingsDir, `${raw.id}.json`), JSON.stringify(raw, null, 2) + "\n", "utf8");
    await this.refresh();
    const entry = this.entries().find((candidate) => candidate.id === raw.id);
    return entry ?? { error: `duplicate of "${id}" was written but failed validation — check the file` };
  }

  /**
   * "New mapping" for a board (PAM-11 AC-2/AC-7): an empty user mapping —
   * no assignments, ports prefilled with the board name as a placeholder
   * (Setup rebinds them on activation, same as bundled mappings).
   */
  async createMapping(deviceDefinitionId: string, name: string): Promise<CatalogEntry | { error: string }> {
    const device = this.device(deviceDefinitionId);
    if (!device) return { error: `unknown board "${deviceDefinitionId}" — pick one from the list` };
    const trimmed = name.trim();
    if (trimmed.length === 0) return { error: "the new mapping needs a name" };
    // BUG-2 (review): cap before the name becomes a filename — the UI limits
    // to 120, this backstops direct IPC callers.
    if (trimmed.length > 120) return { error: "the name is too long — 120 characters max" };

    // Unique against loaded ids AND files already in the user folder (an
    // invalid file there has no id but still owns its file name).
    const taken = new Set(this.validIds());
    let id = makeUniqueId(trimmed, taken);
    while (await fileExists(join(this.paths.userMappingsDir, `${id}.json`))) {
      taken.add(id);
      id = makeUniqueId(trimmed, taken);
    }

    const mapping = {
      formatVersion: CURRENT_FORMAT_VERSION,
      id,
      name: trimmed,
      deviceDefinitionId: device.id,
      midiPort: { input: device.name, output: device.name },
      assignments: [],
    };
    // Belt and braces: never write a file the loader would reject.
    const check = mappingSchema.safeParse(mapping);
    if (!check.success) {
      const detail = check.error.issues[0];
      return { error: `could not create the mapping (${detail?.message ?? "unknown"}) — please report this as a bug` };
    }
    // BUG-1 (review): friendly error instead of a raw Node error that leaks
    // the absolute file path into the renderer notice.
    try {
      await atomicWrite(join(this.paths.userMappingsDir, `${id}.json`), mapping);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? ` (${String((error as NodeJS.ErrnoException).code)})` : "";
      return { error: `could not write the mapping file${code} — check that the app data folder is writable` };
    }
    await this.refresh();
    const entry = this.entries().find((candidate) => candidate.id === id);
    return entry ?? { error: `mapping "${id}" was written but did not load — check the file in the mappings folder` };
  }

  // ---- PAM-6 editor surface ----

  /** Everything the editor needs to open a mapping (design → IPC contract). */
  mappingForEdit(id: string): MappingEditData | { error: string } {
    const mapping = this.loaded.mappings.find((candidate) => candidate.id === id);
    const source = this.sourceById.get(id);
    if (!mapping || !source) return { error: `mapping "${id}" not found` };
    const device = this.device(mapping.deviceDefinitionId);
    if (!device) return { error: `device definition "${mapping.deviceDefinitionId}" not found` };
    return { mapping, device, origin: source.origin };
  }

  /** Board content plus per-control usage — the AC-7 delete-warning data. */
  deviceForEdit(id: string, activeIds: ReadonlySet<string>): DeviceEditData | { error: string } {
    const device = this.device(id);
    const source = this.deviceSourceById.get(id);
    if (!device || !source) return { error: `device definition "${id}" not found` };
    const byControl = new Map<string, UsageRef[]>();
    for (const mapping of this.loaded.mappings) {
      if (mapping.deviceDefinitionId !== id) continue;
      const ref = this.usageRef(mapping.id, mapping.name, activeIds);
      for (const assignment of mapping.assignments) {
        const list = byControl.get(assignment.controlId) ?? [];
        if (!list.some((existing) => existing.id === ref.id)) list.push(ref);
        byControl.set(assignment.controlId, list);
      }
    }
    const usage: ControlUsageEntry[] = [...byControl.entries()].map(([controlId, mappings]) => ({
      controlId,
      mappings,
    }));
    return { device, origin: source.origin, usage };
  }

  /** Mappings referencing a definition — the retarget prompt's list (AC-5). */
  definitionUsage(id: string, activeIds: ReadonlySet<string>): UsageRef[] {
    return this.loaded.mappings
      .filter((mapping) => mapping.deviceDefinitionId === id)
      .map((mapping) => this.usageRef(mapping.id, mapping.name, activeIds));
  }

  /**
   * Editor save for a mapping (design → Save → validate → reload steps 1+2):
   * validate main-side, resolve copy-on-edit from the file's origin, write
   * atomically. The engine-reload decision stays with the caller.
   */
  async saveMapping(draft: unknown): Promise<{ ok: true; id: string } | { ok: false; errors: EditorIssue[] }> {
    const deviceId = (draft as { deviceDefinitionId?: unknown })?.deviceDefinitionId;
    const device = typeof deviceId === "string" ? this.device(deviceId) : undefined;
    if (!device) {
      return { ok: false, errors: [{ path: "deviceDefinitionId", message: "unknown device definition" }] };
    }
    const result = validateMappingDraft(draft, device);
    if (!result.ok) return { ok: false, errors: result.issues };
    const mapping = result.value;

    const source = this.sourceById.get(mapping.id);
    if (!source) {
      return { ok: false, errors: [{ path: "id", message: `mapping "${mapping.id}" not found — save what exists` }] };
    }
    let file = source.file;
    if (source.origin === "bundled") {
      // Copy-on-edit (AC-5): bundled files stay untouched; the copy gets a
      // new id — deliberately no same-id shadowing (see design).
      const copy = suffixedCopy(mapping.id, mapping.name, this.validIds());
      mapping.id = copy.id;
      mapping.name = copy.name;
      file = join(this.paths.userMappingsDir, `${copy.id}.json`);
    }
    await atomicWrite(file, mapping);
    await this.refresh();
    return { ok: true, id: mapping.id };
  }

  /**
   * Editor save for a device definition: validate, resolve copy-on-edit /
   * new-board, retarget the chosen user mappings, and clean up assignments
   * orphaned by deleted controls — the PAM-1 loader would otherwise skip
   * those files entirely (design → Deleting an assigned control).
   */
  async saveDeviceDefinition(
    request: SaveDeviceRequest
  ): Promise<{ ok: true; id: string; rewrittenMappings: string[] } | { ok: false; errors: EditorIssue[] }> {
    const result = validateDeviceDraft(request.draft);
    if (!result.ok) return { ok: false, errors: result.issues };
    const device = result.value;
    const existingIds = new Set(this.loaded.devices.map((existing) => existing.id));

    const source = this.deviceSourceById.get(device.id);
    let file: string;
    if (request.createNew) {
      if (existingIds.has(device.id)) {
        const copy = suffixedCopy(device.id, device.name, existingIds);
        device.id = copy.id;
        device.name = copy.name;
      }
      file = join(this.paths.userDevicesDir, `${device.id}.json`);
    } else if (!source) {
      return { ok: false, errors: [{ path: "id", message: `device definition "${device.id}" not found` }] };
    } else if (source.origin === "bundled") {
      const copy = suffixedCopy(device.id, device.name, existingIds);
      device.id = copy.id;
      device.name = copy.name;
      file = join(this.paths.userDevicesDir, `${device.id}.json`);
    } else {
      file = source.file;
    }
    await atomicWrite(file, device);

    // Retarget (AC-5): rewrite the chosen USER mappings to the saved id.
    const rewritten: string[] = [];
    const retargeted = new Set<string>();
    for (const mappingId of request.retargetMappingIds) {
      const mappingSource = this.sourceById.get(mappingId);
      if (!mappingSource || mappingSource.origin !== "user") continue; // bundled stays a template
      const raw = JSON.parse(await readFile(mappingSource.file, "utf8")) as { deviceDefinitionId?: string };
      raw.deviceDefinitionId = device.id;
      await atomicWrite(mappingSource.file, raw);
      rewritten.push(mappingId);
      retargeted.add(mappingId);
    }

    // Orphan cleanup: every user mapping that now references the saved
    // definition loses assignments to controls that no longer exist.
    const referencing: MappingRef[] = this.loaded.mappings
      .filter((mapping) => mapping.deviceDefinitionId === device.id || retargeted.has(mapping.id))
      .map((mapping) => ({
        id: mapping.id,
        name: mapping.name,
        origin: this.sourceById.get(mapping.id)?.origin ?? "bundled",
        deviceDefinitionId: device.id,
        assignments: mapping.assignments,
      }));
    for (const orphan of orphanedAssignments(device, referencing)) {
      const mappingSource = this.sourceById.get(orphan.mapping.id);
      if (!mappingSource || mappingSource.origin !== "user") continue; // reported by the caller
      const gone = new Set(orphan.controlIds);
      const raw = JSON.parse(await readFile(mappingSource.file, "utf8")) as {
        assignments?: Array<{ controlId?: string }>;
      };
      raw.assignments = (raw.assignments ?? []).filter((assignment) => !gone.has(assignment.controlId ?? ""));
      await atomicWrite(mappingSource.file, raw);
      if (!rewritten.includes(orphan.mapping.id)) rewritten.push(orphan.mapping.id);
    }

    await this.refresh();
    return { ok: true, id: device.id, rewrittenMappings: rewritten };
  }

  private usageRef(id: string, name: string, activeIds: ReadonlySet<string>): UsageRef {
    return {
      id,
      name,
      origin: this.sourceById.get(id)?.origin ?? "bundled",
      active: activeIds.has(id),
    };
  }
}

/** Editor writes are atomic (design → Where files land): temp file + rename. */
async function atomicWrite(file: string, content: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(content, null, 2) + "\n", "utf8");
  await rename(temp, file);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
