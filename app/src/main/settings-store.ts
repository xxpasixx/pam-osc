import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
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

/** settings.json is a few hundred bytes; refuse to buffer anything huge. */
const MAX_SETTINGS_BYTES = 1024 * 1024;

export interface LoadedSettings {
  settings: PersistedSettings;
  /** True when the file was missing (first run) or unreadable/invalid. */
  firstRun: boolean;
  notice: Notice | undefined;
}

export class SettingsStore {
  private readonly file: string;
  private current: PersistedSettings = defaultSettings();
  private persisted = false;

  constructor(userDataDir: string) {
    this.file = join(userDataDir, "settings.json");
  }

  get settings(): PersistedSettings {
    return this.current;
  }

  /** True once the on-disk file mirrors `settings` (successful load or save). */
  get hasPersisted(): boolean {
    return this.persisted;
  }

  async load(): Promise<LoadedSettings> {
    let text: string;
    try {
      // Size ceiling before buffering — settings.json is a few hundred bytes;
      // anything huge is not ours and must not OOM the main process.
      const info = await stat(this.file);
      if (info.size > MAX_SETTINGS_BYTES) {
        return this.failedLoad(`file is unreasonably large (${info.size} bytes)`);
      }
      text = await readFile(this.file, "utf8");
    } catch {
      // Missing file = normal first run.
      this.current = defaultSettings();
      return { settings: this.current, firstRun: true, notice: undefined };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      return this.failedLoad(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    const version = (raw as { formatVersion?: unknown })?.formatVersion;
    if (typeof version === "number" && version > SETTINGS_FORMAT_VERSION) {
      return this.failedLoad(`made with a newer pam-osc (format ${version}) — please update pam-osc`);
    }

    const parsed = persistedSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return this.failedLoad(`invalid content at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "unknown"}`);
    }

    this.current = parsed.data;
    this.persisted = true;
    return { settings: this.current, firstRun: false, notice: undefined };
  }

  /** Persist a new applied state (the Save transaction's final step). */
  async save(settings: PersistedSettings): Promise<void> {
    await this.write(settings);
    this.current = settings;
    this.persisted = true;
  }

  /**
   * PAM-14 (AC-2): mark the setup wizard done. Unlike window bounds this
   * writes even on a first run — a user who skips the wizard before ever
   * saving settings must not be greeted by it again next launch, so this
   * materializes settings.json (with whatever console/mappings are current)
   * carrying the onboarding flag.
   */
  async setOnboardingCompleted(): Promise<void> {
    const next: PersistedSettings = { ...this.current, onboarding: { completed: true } };
    await this.write(next);
    this.current = next;
    this.persisted = true;
  }

  /**
   * Window bounds are saved outside the Save transaction (design). While the
   * on-disk file is missing or corrupt (nothing successfully persisted yet),
   * this is a no-op — EC-2: a corrupt file stays untouched until a real Save,
   * and a first run leaves no settings.json behind.
   */
  async saveWindowBounds(bounds: WindowBounds): Promise<void> {
    if (!this.persisted) return;
    const next: PersistedSettings = { ...this.current, ui: { ...this.current.ui, windowBounds: bounds } };
    await this.write(next);
    this.current = next;
  }

  private failedLoad(problem: string): LoadedSettings {
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
  }

  private async write(settings: PersistedSettings): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(settings, null, 2) + "\n", "utf8");
    await rename(temp, this.file);
  }
}
