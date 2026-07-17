import { readFile, stat } from "node:fs/promises";
import { commandCaution, MAX_SHARE_BYTES, parseShareFile, type ShareKind } from "../core/sharing/share.js";
import type { ImportShareResult } from "../shared/ipc.js";
import type { Catalog } from "./catalog.js";

/**
 * Single-file import (PAM-7 AC-2/AC-9): read with the size cap, detect the
 * kind from the content (AC-13), validate strictly, then hand the entity to
 * the catalog. Nothing is written unless every gate passes. The dialog that
 * produced `filePath` lives in index.ts — this function is testable without
 * Electron.
 */
export async function importShareFile(kind: ShareKind, filePath: string, catalog: Catalog): Promise<ImportShareResult> {
  try {
    const info = await stat(filePath);
    // Cheap pre-check so a huge misdropped file is never buffered.
    if (info.size > MAX_SHARE_BYTES) {
      return { ok: false, error: "the file is larger than 1 MB — not a pam-osc share file" };
    }
  } catch {
    return { ok: false, error: "could not read the picked file" };
  }
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return { ok: false, error: "could not read the picked file" };
  }

  const parsed = parseShareFile(kind, raw);
  if (!parsed.ok) return parsed;

  if (parsed.kind === "mapping") {
    const result = await catalog.importMapping(parsed.entity);
    if ("error" in result) return { ok: false, error: result.error };
    return {
      ok: true,
      kind: "mapping",
      id: result.entry.id,
      name: result.entry.name,
      renamed: result.renamed,
      caution: commandCaution(parsed.entity),
    };
  }
  const result = await catalog.importDevice(parsed.entity);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, kind: "device", id: result.board.id, name: result.board.name, renamed: result.renamed };
}
