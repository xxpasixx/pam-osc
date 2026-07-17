import { access, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { convertV1, makeUniqueId, readV1Mapping } from "../core/import/index.js";
import type { V1File, V1SectionCounts } from "../core/import/index.js";
import { mappingSchema } from "../core/format/index.js";
import type { ImportV1Request, ImportV1Result, PickV1FileResult } from "../shared/ipc.js";
import type { Catalog } from "./catalog.js";

/**
 * The two import steps behind the IPC handlers (PAM-5, design → Behaviors):
 * analyze a picked file, then re-read + convert + write on confirm. Pure
 * Node — the Electron dialog stays in index.ts, so this is fully testable.
 */

/** Same ceiling as the loader — a v1 mapping is a few KB, never megabytes. */
const MAX_FILE_BYTES = 1024 * 1024;

type DiskRead = { ok: true; fileName: string; v1: V1File; counts: V1SectionCounts } | { ok: false; error: string };

async function readV1FromDisk(filePath: string): Promise<DiskRead> {
  const fileName = basename(filePath);
  let text: string;
  try {
    const info = await stat(filePath);
    if (info.size > MAX_FILE_BYTES) {
      return { ok: false, error: `${fileName}: file is too large (${info.size} bytes) — not a v1 mapping` };
    }
    text = await readFile(filePath, "utf8");
  } catch (error) {
    return { ok: false, error: `${fileName}: file could not be read: ${describe(error)}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    return { ok: false, error: `${fileName}: not valid JSON: ${describe(error)}` };
  }

  const read = readV1Mapping(raw);
  if (!read.ok) return { ok: false, error: `${fileName}: ${read.error}` };
  return { ok: true, fileName, v1: read.v1, counts: read.counts };
}

export async function analyzeV1File(filePath: string): Promise<PickV1FileResult> {
  const read = await readV1FromDisk(filePath);
  if (!read.ok) return { status: "error", error: read.error };
  return { status: "ok", filePath, fileName: read.fileName, counts: read.counts };
}

export async function importV1File(request: ImportV1Request, catalog: Catalog): Promise<ImportV1Result> {
  // The file on disk is the single source — re-read and re-check (design).
  const read = await readV1FromDisk(request.filePath);
  if (!read.ok) return { ok: false, error: read.error };

  const device = catalog.device(request.deviceDefinitionId);
  if (!device) {
    return { ok: false, error: `unknown board "${request.deviceDefinitionId}" — pick one from the list` };
  }
  const name = request.name.trim();
  if (name.length === 0) {
    return { ok: false, error: "the new mapping needs a name" };
  }

  // Unique against loaded mapping ids AND files already sitting in the user
  // folder (an invalid file there has no id but still owns its file name).
  const taken = new Set(catalog.validIds());
  let id = makeUniqueId(name, taken);
  while (await fileExists(join(catalog.userMappingsDirPath, `${id}.json`))) {
    taken.add(id);
    id = makeUniqueId(name, taken);
  }

  const { mapping, summary } = convertV1({
    v1: read.v1,
    device,
    id,
    name,
    sourceFileName: read.fileName,
    date: new Date().toISOString().slice(0, 10),
  });

  // Belt and braces (design): a converter bug must never produce a file the
  // loader rejects.
  const check = mappingSchema.safeParse(mapping);
  if (!check.success) {
    const detail = check.error.issues[0];
    return {
      ok: false,
      error: `the converter produced an invalid mapping (${detail?.message ?? "unknown"}) — nothing was written; please report this as a pam-osc bug`,
    };
  }

  await writeFile(join(catalog.userMappingsDirPath, `${id}.json`), JSON.stringify(mapping, null, 2) + "\n", "utf8");
  await catalog.refresh();

  const entry = catalog.entries().find((candidate) => candidate.id === id);
  if (!entry) {
    return {
      ok: false,
      error: `the imported mapping "${id}" was written but did not load — check the file in the mappings folder`,
    };
  }
  return { ok: true, entry, summary };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
