import type { PersistedSettings, SettingsDraft } from "../core/settings/schema.js";
import type { Catalog } from "./catalog.js";
import type { CatalogEntry } from "../shared/ipc.js";

/**
 * Builds the renderer's draft view of the applied settings: the persisted
 * id list joined with the port bindings currently stored in the mapping
 * files. An id whose mapping vanished or turned invalid keeps its row with
 * an empty port — the UI shows it as unbound for re-picking (AC-5).
 */
export function draftFromPersisted(settings: PersistedSettings, catalog: Catalog): SettingsDraft {
  const entriesById = new Map<string, CatalogEntry>(catalog.entries().map((entry) => [entry.id, entry]));
  return {
    console: settings.console,
    activeMappings: settings.activeMappingIds.map((id) => {
      const entry = entriesById.get(id);
      return { id, input: entry?.midiPort.input ?? "", output: entry?.midiPort.output };
    }),
    // PAM-16: global fixed executor page (undefined = follow current page).
    fixedPage: settings.fixedPage,
  };
}
