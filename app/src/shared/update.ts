/**
 * PAM-34 auto-update contract between main and renderer. Kept apart from
 * shared/ipc.ts on purpose: the updater has its own narrow bridge
 * (window.pamOscUpdates) so it stays independent of the app IPC surface.
 */

export type UpdateFallbackReason = "not-writable" | "not-in-applications" | "unsupported-platform";

export type UpdateState =
  | { kind: "disabled" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date"; checkedAt: string }
  | { kind: "downloading"; version: string; percent: number }
  /** scheduled = the user chose "On next launch" (AC-15). */
  | { kind: "ready"; version: string; scheduled: boolean }
  /** Installing at start-up; the app restarts into the new version (AC-15). */
  | { kind: "installing"; version: string }
  | { kind: "fallback"; version: string; releaseUrl: string; reason: UpdateFallbackReason }
  | { kind: "error"; checkedAt: string; message: string };

export interface UpdatePreferences {
  checkAutomatically: boolean;
  receiveBetas: boolean;
}

export interface UpdateStatus {
  installedVersion: string;
  /** False in dev builds (nothing to replace) — the UI hides update controls. */
  supported: boolean;
  preferences: UpdatePreferences;
  state: UpdateState;
}

/** window.pamOscUpdates — exposed by the preload. */
export interface PamOscUpdatesApi {
  getStatus(): Promise<UpdateStatus>;
  checkNow(): Promise<void>;
  setPreferences(preferences: UpdatePreferences): Promise<UpdateStatus>;
  /** Only acts in state "ready"; the renderer asks for confirmation first. */
  installNow(): Promise<void>;
  /** AC-15: install at the next start instead of now. */
  scheduleForNextLaunch(): Promise<void>;
  /** Fallback (AC-13 / EC-4): opens the GitHub release page in the browser. */
  openReleasePage(url: string): Promise<void>;
  onStatus(listener: (status: UpdateStatus) => void): () => void;
}

export const UPDATE_IPC = {
  getStatus: "pam:update:getStatus",
  checkNow: "pam:update:checkNow",
  setPreferences: "pam:update:setPreferences",
  installNow: "pam:update:installNow",
  scheduleForNextLaunch: "pam:update:scheduleForNextLaunch",
  openReleasePage: "pam:update:openReleasePage",
  evStatus: "pam:update:ev:status",
} as const;

export const RELEASES_URL = "https://github.com/xxpasixx/pam-osc/releases";
