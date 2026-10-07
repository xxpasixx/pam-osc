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

const consoleAnswers = (connection: ConnectionStatus | undefined) =>
  connection?.state === "plugin-missing" || connection?.state === "connected";

export function ma3Checklist({ info, onThisComputer, engineState, connection }: ChecklistInput): ChecklistStep[] {
  const reachable = engineState === "running" && consoleAnswers(connection);
  const connected = engineState === "running" && connection?.state === "connected";

  // Step 1 — on this computer the app sees the onPC folders; for a remote
  // console it can't, but a console that answers proves the files got there.
  const current = info.installs.find(
    (install) =>
      install.hasPamOsc &&
      install.hasOscConfig &&
      (info.bundledVersion === undefined ||
        install.installedVersion === undefined ||
        comparePluginVersions(install.installedVersion, info.bundledVersion) >= 0)
  );
  let files: ChecklistStep;
  if (onThisComputer && current) {
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
      summary: onThisComputer
        ? "Install the plugin and the OSC config into onPC"
        : "Copy the plugin and the OSC config to a USB stick",
    };
  }

  const osc: ChecklistStep = reachable
    ? { id: "osc", status: "done", summary: "The console answers over OSC" }
    : {
        id: "osc",
        status: files.status === "done" ? "open" : "waiting",
        summary:
          engineState !== "running" ? "Waiting for the bridge to run" : "Import the OSC config on the console",
      };

  const plugin: ChecklistStep = connected
    ? { id: "plugin", status: "done", summary: "Plugin is running — move a fader to try it" }
    : {
        id: "plugin",
        status: reachable ? "open" : "waiting",
        summary: reachable ? "Import and start “pam-osc Start Stop” on the console" : "After the OSC step",
      };

  return [files, osc, plugin];
}

/** The step to show expanded: the first one not done (none when all are done). */
export function nextOpenStep(steps: ChecklistStep[]): StepId | undefined {
  return steps.find((step) => step.status !== "done")?.id;
}
