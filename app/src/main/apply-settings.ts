import type { EngineConfig } from "../core/engine/index.js";
import { SETTINGS_FORMAT_VERSION, type PersistedSettings, type SettingsDraft } from "../core/settings/schema.js";
import { validateDraft } from "../core/settings/validate.js";
import type { Catalog } from "./catalog.js";
import type { EngineHost } from "./engine-host.js";
import type { SettingsStore } from "./settings-store.js";
import type { ApplyResult, Notice, Snapshot } from "../shared/ipc.js";

/**
 * The Save transaction (design → Behaviors 3, AC-3/AC-6/EC-3):
 * 1. validate — any failure returns field errors, changes nothing
 * 2. write mapping files (copy-on-activate / port rewrites) — user intent,
 *    survives a later rollback
 * 3. reconfigure the engine (empty active list = stop)
 * 4. total failure → roll back to last-known-good, return the error
 * 5. persist settings.json only for what actually applied
 */

export interface ApplyDeps {
  catalog: Catalog;
  settingsStore: SettingsStore;
  engineHost: EngineHost;
  buildEngineConfig(draft: SettingsDraft): EngineConfig;
  buildSnapshot(): Promise<Snapshot>;
}

export async function applySettings(draft: SettingsDraft, deps: ApplyDeps): Promise<ApplyResult> {
  const notices: Notice[] = [];

  // 1 — validate
  const fieldErrors = validateDraft(draft, deps.catalog.validIds());
  if (fieldErrors.length > 0) {
    return { ok: false, fieldErrors, notices };
  }

  // 2 — mapping files carry the chosen ports from now on
  try {
    await deps.catalog.materializePorts(draft.activeMappings);
  } catch (error) {
    return {
      ok: false,
      fieldErrors: [],
      notices: [
        {
          severity: "error",
          message: `could not write mapping files: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }

  // 3 + 4 — engine reconfigure with rollback
  const config = draft.activeMappings.length > 0 ? deps.buildEngineConfig(draft) : undefined;
  const outcome = await deps.engineHost.apply(config);
  if (!outcome.ok) {
    notices.push({
      severity: "error",
      message: outcome.rolledBack
        ? `the new settings could not be applied (${outcome.error}) — the previous working configuration keeps running`
        : `the engine could not start (${outcome.error})`,
    });
    return { ok: false, fieldErrors: [], notices };
  }

  // 5 — persist only what actually applied
  const persisted: PersistedSettings = {
    formatVersion: SETTINGS_FORMAT_VERSION,
    console: draft.console,
    activeMappingIds: draft.activeMappings.map((mapping) => mapping.id),
    ui: deps.settingsStore.settings.ui,
  };
  try {
    await deps.settingsStore.save(persisted);
  } catch (error) {
    notices.push({
      severity: "warning",
      message: `settings applied but not saved to disk: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return { ok: true, snapshot: await deps.buildSnapshot(), notices };
}
