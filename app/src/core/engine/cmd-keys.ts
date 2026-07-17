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

export interface CmdKeyContext {
  state: RuntimeState;
  sendOsc: (message: OscMessage) => void;
  timing: EngineTiming;
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
  if (cmd.awaitingAck === undefined) return; // stale/duplicate ack — ignore
  if (cmd.awaitingAck !== executor) {
    context.log(`CMD ack for executor ${executor} while waiting on ${cmd.awaitingAck} — advancing anyway`);
  }
  advance(context);
}

/** Engine shutdown: never leave the ack timer running (mirrors timecode timers). */
export function cancelCmdTimers(state: RuntimeState): void {
  if (state.cmd.ackTimer) clearTimeout(state.cmd.ackTimer);
  state.cmd.ackTimer = undefined;
  state.cmd.awaitingAck = undefined;
  state.cmd.queue.length = 0;
}

function sendCmdKey(context: CmdKeyContext, executor: number): void {
  const { cmd } = context.state;
  cmd.awaitingAck = executor;
  context.sendOsc({
    address: "/cmd",
    args: [oscString(`Lua 'SetVar(GlobalVars(), "pamCmdKey", ${executor})'`)],
  });
  cmd.ackTimer = setTimeout(() => {
    context.log(`no CMD ack for executor ${executor} within ${context.timing.cmdAckTimeoutMs}ms — advancing`);
    advance(context);
  }, context.timing.cmdAckTimeoutMs);
}

function advance(context: CmdKeyContext): void {
  const { cmd } = context.state;
  if (cmd.ackTimer) clearTimeout(cmd.ackTimer);
  cmd.ackTimer = undefined;
  cmd.awaitingAck = undefined;
  const next = cmd.queue.shift();
  if (next !== undefined) sendCmdKey(context, next);
}
