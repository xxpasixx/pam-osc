import type { ConnectionStatus } from "../../core/engine/types.js";
import type { EngineState, Ma3SetupInfo } from "../../shared/ipc.js";
import { comparePluginVersions } from "../../shared/plugin-version.js";

/**
 * PAM-36: the MA3 tab as a checklist. Pure — derives each step's status from
 * what the app can actually observe, so the tab shows progress instead of a
 * wall of instructions. Order and meaning follow PAM-35 AC-9.
 */

export type StepId = "files" | "osc" | "plugin";
export type StepStatus = "done" | "open" | "waiting";

export interface ChecklistStep {
  id: StepId;
  status: StepStatus;
  /** One line under the title — what the app sees right now. */
  summary: string;
}

export interface ChecklistInput {
  info: Ma3SetupInfo;
  onThisComputer: boolean;
  engineState: EngineState;
  connection: ConnectionStatus | undefined;
}

// "plugin-outdated" also means the console answered — only the plugin is old
// (review BUG-1: the upgrade path every existing user takes).
const consoleAnswers = (connection: ConnectionStatus | undefined) =>
  connection?.state === "plugin-missing" ||
  connection?.state === "plugin-outdated" ||
  connection?.state === "connected";

export function ma3Checklist({ info, onThisComputer, engineState, connection }: ChecklistInput): ChecklistStep[] {
  const reachable = engineState === "running" && consoleAnswers(connection);
  const connected = engineState === "running" && connection?.state === "connected";

  // Step 1 — on this computer the app sees the onPC folders; for a remote
  // console it can't, but a console that answers proves the files got there.
  const isCurrent = (installedVersion: string | undefined) =>
    info.bundledVersion === undefined ||
    installedVersion === undefined ||
    comparePluginVersions(installedVersion, info.bundledVersion) >= 0;
  const current = info.installs.find((install) => install.hasPamOsc && install.hasOscConfig && isCurrent(install.installedVersion));
  // An outdated plugin in onPC must stay visible even if the console answers
  // with the old one (review BUG-3) — the update lives in step 1.
  const outdated = info.installs.find((install) => install.hasPamOsc && !isCurrent(install.installedVersion));
  let files: ChecklistStep;
  // …unless the console already runs a current plugin: the setup works (review BUG-6).
  if (onThisComputer && !current && outdated && !connected) {
    files = {
      id: "files",
      status: "open",
      summary: `The plugin in onPC (${outdated.installedVersion}) is outdated — update it to ${info.bundledVersion}`,
    };
  } else if (onThisComputer && current) {
    files = {
      id: "files",
      status: "done",
      summary: `Plugin${current.installedVersion ? ` ${current.installedVersion}` : ""} and OSC config are in onPC`,
    };
  } else if (reachable) {
    files = { id: "files", status: "done", summary: "Files are on the console (it answers over OSC)" };
  } else {
    files = {
      id: "files",
      status: "open",
      summary: !onThisComputer
        ? "Copy the plugin and the OSC config to a USB stick"
        : info.installs.length > 0
          ? "Install the plugin and the OSC config into onPC"
          : "No onPC installation found — use a USB stick or folder",
    };
  }

  const osc: ChecklistStep = reachable
    ? { id: "osc", status: "done", summary: "The console answers over OSC" }
    : {
        id: "osc",
        status: files.status === "done" ? "open" : "waiting",
        summary:
          files.status !== "done"
            ? "After step 1"
            : engineState !== "running"
              ? "Waiting for the bridge to run"
              : "Import the OSC config on the console",
      };

  const plugin: ChecklistStep = connected
    ? { id: "plugin", status: "done", summary: "Plugin is running — move a fader to try it" }
    : {
        id: "plugin",
        status: reachable ? "open" : "waiting",
        summary: !reachable
          ? "After the OSC step"
          : connection?.state === "plugin-outdated"
            ? "The plugin on the console is outdated — import the new one and restart it"
            : "Import and start “pam-osc Start Stop” on the console",
      };

  return [files, osc, plugin];
}

/**
 * Review BUG-2: a normal re-check reports "checking" for a few seconds — the
 * checklist keeps the last real result instead, so ticks don't vanish and
 * the open step doesn't jump while the check runs.
 */
export function settledConnection(
  current: ConnectionStatus | undefined,
  lastSettled: ConnectionStatus | undefined
): ConnectionStatus | undefined {
  return current?.state === "checking" ? (lastSettled ?? current) : current;
}

/** The step to show expanded: the first one not done (none when all are done). */
export function nextOpenStep(steps: ChecklistStep[]): StepId | undefined {
  return steps.find((step) => step.status !== "done")?.id;
}
