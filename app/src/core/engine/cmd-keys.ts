import type { OscMessage } from "../../transports/osc.js";
import { oscString } from "../../transports/osc.js";
import type { RuntimeState } from "./state.js";
import { EXPECTED_PLUGIN_PROTOCOL, type EngineTiming } from "./types.js";

/**
 * PAM-12 CMD mode, app side. The app is only the switch and the messenger:
 * one intercepted press becomes one `SetVar pamCmdKey` message; the plugin
 * executes the whole action console-side and acks via /status/cmdKeyDone
 * (see design.md). Presses are strictly serialized (AC-11) — one outstanding
 * message, the rest queues; a lost ack costs one timeout, never an
 * interleaved macro rebuild.
 */

const CMD_QUEUE_LIMIT = 8;

/**
 * After this many consecutive ack timeouts with no successful ack in between,
 * the console is presumed dead and CMD mode disables itself (EC-5): executor
 * buttons go back to triggering normally instead of vanishing into a queue
 * aimed at a dead plugin. A live plugin re-sends its flags on reconnect
 * (forceReload), so this self-recovers.
 */
const CMD_LIVENESS_TIMEOUTS = 2;

export interface CmdKeyContext {
  state: RuntimeState;
  sendOsc: (message: OscMessage) => void;
  timing: EngineTiming;
  /** Notify the UI when CMD state changed app-side (e.g. the liveness reset). */
  onConsoleChanged: () => void;
  log: (line: string) => void;
}

/** Nonzero flags from a current-protocol plugin = executor buttons target. */
export function cmdModeActive(state: RuntimeState): boolean {
  return state.cmdFlags !== 0 && state.pluginProtocol === EXPECTED_PLUGIN_PROTOCOL;
}

export function enqueueCmdKey(context: CmdKeyContext, executor: number): void {
  const { cmd } = context.state;
  if (cmd.awaitingAck !== undefined) {
    if (cmd.queue.length >= CMD_QUEUE_LIMIT) {
      context.log(`CMD queue is full — dropping executor ${executor} press`);
      return;
    }
    cmd.queue.push(executor);
    return;
  }
  sendCmdKey(context, executor);
}

export function onCmdKeyAck(context: CmdKeyContext, executor: number): void {
  const { cmd } = context.state;
  if (cmd.awaitingAck === undefined) return; // stale/duplicate ack — nothing outstanding
  // BUG-2 fix: only the ack for the press we're actually waiting on advances
  // the queue. A late, duplicate, or bogus ack for another executor is
  // ignored — a genuinely stuck queue self-heals via the timeout, but a
  // premature advance would silently overwrite the not-yet-consumed SetVar
  // and drop a press (AC-11).
  if (cmd.awaitingAck !== executor) {
    context.log(`ignoring CMD ack for executor ${executor} while waiting on ${cmd.awaitingAck}`);
    return;
  }
  cmd.consecutiveTimeouts = 0;
  advance(context);
}

/** Engine shutdown: never leave the ack timer running (mirrors timecode timers). */
export function cancelCmdTimers(state: RuntimeState): void {
  if (state.cmd.ackTimer) clearTimeout(state.cmd.ackTimer);
  state.cmd.ackTimer = undefined;
  state.cmd.awaitingAck = undefined;
  state.cmd.queue.length = 0;
  state.cmd.consecutiveTimeouts = 0;
}

function sendCmdKey(context: CmdKeyContext, executor: number): void {
  const { cmd } = context.state;
  cmd.awaitingAck = executor;
  context.sendOsc({
    address: "/cmd",
    args: [oscString(`Lua 'SetVar(GlobalVars(), "pamCmdKey", ${executor})'`)],
  });
  cmd.ackTimer = setTimeout(() => onAckTimeout(context, executor), context.timing.cmdAckTimeoutMs);
}

function onAckTimeout(context: CmdKeyContext, executor: number): void {
  const { cmd } = context.state;
  cmd.consecutiveTimeouts += 1;
  context.log(`no CMD ack for executor ${executor} within ${context.timing.cmdAckTimeoutMs}ms`);
  if (cmd.consecutiveTimeouts >= CMD_LIVENESS_TIMEOUTS) {
    // EC-5: the plugin looks dead — stop swallowing presses.
    context.log("CMD mode disabled — the console plugin is not acknowledging (it will re-enable on reconnect)");
    resetCmdMode(context);
    return;
  }
  advance(context);
}

/** Clear the outstanding press and start the next queued one, if any. */
function advance(context: CmdKeyContext): void {
  const { cmd } = context.state;
  if (cmd.ackTimer) clearTimeout(cmd.ackTimer);
  cmd.ackTimer = undefined;
  cmd.awaitingAck = undefined;
  const next = cmd.queue.shift();
  if (next !== undefined) sendCmdKey(context, next);
}

/** EC-5 liveness reset: drop CMD state so buttons behave normally again. */
function resetCmdMode(context: CmdKeyContext): void {
  const { state } = context;
  if (state.cmd.ackTimer) clearTimeout(state.cmd.ackTimer);
  state.cmd.ackTimer = undefined;
  state.cmd.awaitingAck = undefined;
  state.cmd.queue.length = 0;
  state.cmd.consecutiveTimeouts = 0;
  state.cmdFlags = 0;
  state.interceptedPresses.clear();
  context.onConsoleChanged();
}
