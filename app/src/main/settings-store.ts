import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  defaultSettings,
  persistedSettingsSchema,
  SETTINGS_FORMAT_VERSION,
  type PersistedSettings,
  type WindowBounds,
} from "../core/settings/schema.js";
import type { Notice } from "../shared/ipc.js";

/**
 * settings.json in the OS userData folder. Electron-free (the path is
 * injected) so the store is unit-testable. Atomic writes: temp file +
 * rename. A corrupt file is reported and left on disk untouched until the
 * next successful save overwrites it (EC-2).
 */

export interface LoadedSettings {
  settings: PersistedSettings;
  /** True when the file was missing (first run) or unreadable/invalid. */
  firstRun: boolean;
  notice: Notice | undefined;
}

export class SettingsStore {
  private readonly file: string;
  private current: PersistedSettings = defaultSettings();

  constructor(userDataDir: string) {
    this.file = join(userDataDir, "settings.json");
  }

  get settings(): PersistedSettings {
    return this.current;
  }

  async load(): Promise<LoadedSettings> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch {
      // Missing file = normal first run.
      this.current = defaultSettings();
      return { settings: this.current, firstRun: true, notice: undefined };
    }

    const failed = (problem: string): LoadedSettings => {
      this.current = defaultSettings();
      return {
        settings: this.current,
        firstRun: true,
        notice: {
          severity: "warning",
          source: this.file,
          message: `settings.json could not be used (${problem}) — starting with defaults; the file stays untouched until you save`,
        },
      };
    };

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      return failed(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    const version = (raw as { formatVersion?: unknown })?.formatVersion;
    if (typeof version === "number" && version > SETTINGS_FORMAT_VERSION) {
      return failed(`made with a newer pam-osc (format ${version}) — please update pam-osc`);
    }

    const parsed = persistedSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return failed(`invalid content at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "unknown"}`);
    }

    this.current = parsed.data;
    return { settings: this.current, firstRun: false, notice: undefined };
  }

  /** Persist a new applied state (the Save transaction's final step). */
  async save(settings: PersistedSettings): Promise<void> {
    await this.write(settings);
    this.current = settings;
  }

  /** Window bounds are saved outside the Save transaction (design). */
  async saveWindowBounds(bounds: WindowBounds): Promise<void> {
    const next: PersistedSettings = { ...this.current, ui: { ...this.current.ui, windowBounds: bounds } };
    await this.write(next);
    this.current = next;
  }

  private async write(settings: PersistedSettings): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(settings, null, 2) + "\n", "utf8");
    await rename(temp, this.file);
  }
}
