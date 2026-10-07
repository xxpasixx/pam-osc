import {
  effectivePreferences,
  fallbackReason,
  isPrereleaseVersion,
  isWorthInstalling,
  type InstallLocation,
} from "../core/update/policy.js";
import type { StoredUpdatePreferences } from "../core/settings/schema.js";
import { RELEASES_URL, type UpdatePreferences, type UpdateState, type UpdateStatus } from "../shared/update.js";

/**
 * PAM-34 Update Service. Wraps electron-updater (injected as `UpdaterLike`
 * so the state machine is unit-testable without Electron or GitHub) and
 * executes the decisions from core/update/policy.ts.
 *
 * Live-show rule (AC-7): nothing here ever quits or restarts the app on its
 * own. A downloaded update installs on a normal quit (autoInstallOnAppQuit)
 * or when the user explicitly asks (installNow).
 */

interface UpdateInfoLike {
  version: string;
}

/** The subset of electron-updater's AppUpdater this service drives. */
export interface UpdaterLike {
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-available", listener: (info: UpdateInfoLike) => void): unknown;
  on(event: "update-not-available", listener: (info: UpdateInfoLike) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "update-downloaded", listener: (info: UpdateInfoLike) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  /** Resolves null when the platform/installation can't update (no event fires). */
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdateServiceOptions {
  updater: UpdaterLike | undefined;
  installedVersion: string;
  /** False for unpackaged dev runs — the service then never touches the network. */
  supported: boolean;
  stored: () => StoredUpdatePreferences | undefined;
  persist: (preferences: UpdatePreferences) => Promise<void>;
  location: () => InstallLocation;
  log: (line: string) => void;
  onStatus: (status: UpdateStatus) => void;
  /** Injected for tests. */
  timers?: { setTimeout: typeof setTimeout; setInterval: typeof setInterval; clearInterval: typeof clearInterval };
  now?: () => Date;
}

/** Design: never delay start-up; long show sessions still learn about fixes. */
export const FIRST_CHECK_DELAY_MS = 30_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * "Nothing to update to" answers from electron-updater's GitHub provider —
 * e.g. betas off while GitHub's "Latest" is still the v1 release (no
 * latest*.yml there). Not a failure: the user is simply on the newest build
 * of their channel (review BUG-1).
 */
const NOTHING_NEWER_CODES = new Set([
  "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
  "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
  "ERR_UPDATER_NO_PUBLISHED_VERSIONS",
]);

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;

const shortMessage = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  const first = text.split("\n")[0] ?? "";
  return first.length > 200 ? `${first.slice(0, 197)}…` : first;
};

export class UpdateService {
  private state: UpdateState;
  private preferences: UpdatePreferences;
  private interval: ReturnType<typeof setInterval> | undefined;
  private readonly timers: NonNullable<UpdateServiceOptions["timers"]>;
  private readonly now: () => Date;

  constructor(private readonly options: UpdateServiceOptions) {
    this.timers = options.timers ?? { setTimeout, setInterval, clearInterval };
    this.now = options.now ?? (() => new Date());
    this.preferences = effectivePreferences(options.stored(), options.installedVersion);
    this.state = options.supported && this.preferences.checkAutomatically ? { kind: "idle" } : { kind: "disabled" };
    const updater = options.updater;
    if (!updater || !options.supported) return;

    updater.autoDownload = false; // we download ourselves after the fallback check (AC-13)
    updater.autoInstallOnAppQuit = true; // AC-7: install on a normal quit
    updater.allowDowngrade = false; // AC-10 / EC-3
    updater.allowPrerelease = this.preferences.receiveBetas; // AC-8

    updater.on("checking-for-update", () => this.setState({ kind: "checking" }));
    updater.on("update-not-available", () => this.setState({ kind: "up-to-date", checkedAt: this.now().toISOString() }));
    updater.on("update-available", (info) => this.handleAvailable(info.version));
    updater.on("download-progress", (progress) => {
      if (this.state.kind !== "downloading") return;
      this.setState({ ...this.state, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) }, false);
    });
    updater.on("update-downloaded", (info) => {
      if (!isWorthInstalling(info.version, options.installedVersion)) return;
      // A pre-release that finished downloading after betas were switched off
      // must not install on quit (review BUG-2).
      if (isPrereleaseVersion(info.version) && !this.preferences.receiveBetas) {
        updater.autoInstallOnAppQuit = false;
        this.options.log(`updates: dropping downloaded pre-release ${info.version} (betas off)`);
        this.setState({ kind: "idle" });
        return;
      }
      updater.autoInstallOnAppQuit = true;
      this.setState({ kind: "ready", version: info.version });
    });
    // AC-2 / AC-3: checksum/signature/network failures land here — logged, never a dialog.
    updater.on("error", (error) => this.fail(error));
  }

  status(): UpdateStatus {
    return {
      installedVersion: this.options.installedVersion,
      supported: this.options.supported && this.options.updater !== undefined,
      preferences: { ...this.preferences },
      state: this.state,
    };
  }

  /** Starts the schedule. Call once the window is up (design: no network before the UI). */
  start(): void {
    if (!this.options.supported || !this.options.updater) {
      this.options.log("updates: disabled (unpackaged build)");
      return;
    }
    this.timers.setTimeout(() => this.scheduledCheck(), FIRST_CHECK_DELAY_MS);
    this.interval = this.timers.setInterval(() => this.scheduledCheck(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval !== undefined) this.timers.clearInterval(this.interval);
    this.interval = undefined;
  }

  /** AC-4 / AC-14: a manual check works even with auto-check off. */
  async checkNow(): Promise<void> {
    const updater = this.options.updater;
    if (!updater || !this.options.supported) return;
    // "ready" stays put: a later failing check must not hide the pending install.
    if (this.state.kind === "checking" || this.state.kind === "downloading" || this.state.kind === "ready") return;
    this.options.log(`updates: checking (betas ${this.preferences.receiveBetas ? "on" : "off"})`);
    this.setState({ kind: "checking" });
    try {
      const result = await updater.checkForUpdates();
      // null = this installation can't update (e.g. Linux without AppImage):
      // no event follows, so leave "checking" ourselves (review BUG-5).
      // Re-read via status(): events during the await may have moved the state on.
      if (result === null && this.status().state.kind === "checking") {
        this.fail(new Error("this installation can't update itself — download new versions manually"));
      }
    } catch (error) {
      this.fail(error);
    }
  }

  async setPreferences(next: UpdatePreferences): Promise<UpdateStatus> {
    const betasChanged = next.receiveBetas !== this.preferences.receiveBetas;
    this.preferences = { ...next };
    await this.options.persist(this.preferences);
    this.options.log(
      `updates: preferences auto=${next.checkAutomatically ? "on" : "off"} betas=${next.receiveBetas ? "on" : "off"}`
    );
    if (this.options.updater) this.options.updater.allowPrerelease = next.receiveBetas;
    // Betas off while a pre-release is pending → it must not install on quit
    // (AC-8 / AC-10, review BUG-2); look for a stable one instead.
    if (
      !next.receiveBetas &&
      this.state.kind === "ready" &&
      isPrereleaseVersion(this.state.version) &&
      this.options.updater
    ) {
      this.options.updater.autoInstallOnAppQuit = false;
      this.options.log(`updates: pending pre-release ${this.state.version} discarded (betas off)`);
      this.state = { kind: "idle" };
      if (next.checkAutomatically) {
        this.emit();
        void this.checkNow();
        return this.status();
      }
    }
    if (!next.checkAutomatically && (this.state.kind === "idle" || this.state.kind === "up-to-date")) {
      this.setState({ kind: "disabled" });
    } else if (next.checkAutomatically && this.state.kind === "disabled") {
      this.setState({ kind: "idle" });
    } else {
      this.emit();
    }
    if (betasChanged && next.checkAutomatically) void this.checkNow();
    return this.status();
  }

  /** AC-6: only from "ready"; the confirmation happened in the renderer. */
  installNow(): void {
    if (this.state.kind !== "ready" || !this.options.updater) return;
    this.options.log(`updates: installing ${this.state.version} now (user request)`);
    this.options.updater.quitAndInstall(true, true);
  }

  private scheduledCheck(): void {
    if (!this.preferences.checkAutomatically) return;
    if (this.state.kind === "ready" || this.state.kind === "fallback") return; // already found one
    void this.checkNow();
  }

  private handleAvailable(version: string): void {
    if (!isWorthInstalling(version, this.options.installedVersion)) {
      this.setState({ kind: "up-to-date", checkedAt: this.now().toISOString() });
      return;
    }
    const reason = fallbackReason(this.options.location());
    if (reason) {
      this.options.log(`updates: ${version} available, manual download needed (${reason})`);
      this.setState({ kind: "fallback", version, releaseUrl: `${RELEASES_URL}/tag/v${version}`, reason });
      return;
    }
    this.options.log(`updates: downloading ${version}`);
    this.setState({ kind: "downloading", version, percent: 0 });
    this.options.updater?.downloadUpdate().catch((error: unknown) => this.fail(error));
  }

  private fail(error: unknown): void {
    if (NOTHING_NEWER_CODES.has(errorCode(error) ?? "")) {
      this.options.log(`updates: nothing newer published for this channel (${errorCode(error)})`);
      this.setState({ kind: "up-to-date", checkedAt: this.now().toISOString() });
      return;
    }
    const message = shortMessage(error);
    // electron-updater both emits "error" and rejects — report once (review BUG-4).
    if (this.state.kind === "error" && this.state.message === message) return;
    this.options.log(`updates: failed — ${message}`);
    this.setState({ kind: "error", checkedAt: this.now().toISOString(), message });
  }

  private setState(next: UpdateState, log = true): void {
    this.state = next;
    if (log && next.kind !== "checking") this.options.log(`updates: state ${next.kind}`);
    this.emit();
  }

  private emit(): void {
    this.options.onStatus(this.status());
  }
}
