import type { Mapping } from "../format/index.js";
import type { OscMessage } from "../../transports/osc.js";
import { oscString } from "../../transports/osc.js";
import { forceReloadMessage } from "./startup.js";

/**
 * PAM-16 config handshake, app side. The app is the source of truth: from the
 * active mapping(s) it derives (a) the exact executor watch-set the plugin
 * should poll and (b) the merged feature flags, plus the global fixed page,
 * and pushes them to the plugin over the existing app→plugin channel
 * (`SetVar(GlobalVars(), "pamConfig", …)` + `forceReload`, the same mechanism
 * as pamCmdKey/pamPing/forceReload). The plugin-side parser (Level 3) is held
 * for onPC co-verification; this side is additive and harmless to an old
 * plugin that never reads `pamConfig` (AC-6).
 *
 * ── pamConfig payload format (the held plugin parser must match this) ──
 *   A single compact, quote-free, delimited string. Fields are separated by
 *   ";", each field is "key=value". Fixed field order (stable so identical
 *   configs serialize identically for change-detection):
 *
 *     v=<int>     payload format version (currently 1)
 *     e=<csv>     watch-set: executor numbers, ascending, deduped, comma-
 *                 separated; empty ("e=") when no executor/display action
 *     c=<0|1>     sendColors   (OR-merged across active mappings)
 *     n=<0|1>     sendNames    (OR-merged)
 *     r=<0|1>     resendButtons (OR-merged)
 *     t=<0|1>     sendTimecode = enableTimecodeSend (OR-merged)
 *     p=<int>     fixedPage; 0 = follow the console's current page
 *
 *   Example: v=1;e=101,102,201,900;c=1;n=1;r=0;t=0;p=0
 *
 *   Values contain only digits, "0"/"1", and (for e=) commas — never quotes,
 *   spaces, ";" or "=", so the string embeds safely inside the Lua string
 *   literal below and is trivially splittable on the console side
 *   (split on ";", then "=", then "," for the executors).
 */

export const PAM_CONFIG_VERSION = 1;

/**
 * PAM-16 F2: hard cap on the watch-set size. The payload rides in a single MA3
 * `GlobalVars` string sent over UDP; an unbounded executor list (pathological
 * multi-mapping setup) could exceed the variable/datagram budget and fail
 * silently. 256 executors keeps `e=` well under ~1.5 KB while dwarfing any
 * realistic mapping. Excess is dropped from the payload; the engine logs it
 * once at start so the drop is never silent.
 */
export const MAX_WATCH_SET = 256;

/** The transient runtime config the app sends the plugin — never persisted. */
export interface PamConfig {
  /** Watch-set: executor numbers, ascending & deduped (union across mappings). */
  executors: number[];
  sendColors: boolean;
  sendNames: boolean;
  resendButtons: boolean;
  /** enableTimecodeSend, reused as the timecode flag. */
  sendTimecode: boolean;
  /** 1..9999, or 0 = follow the console's current page. */
  fixedPage: number;
}

/**
 * ConfigBuilder (AC-1/AC-2/EC-3): compute the watch-set, merged flags and
 * fixed page from the active mapping(s).
 * - executors: the union of `action.number` for `executor` and `display`
 *   actions across all active mappings (covers X-keys / high numbers if a
 *   mapping uses them — EC-1);
 * - flags: OR across active mappings (any mapping asking for a feature turns
 *   it on for the merged config — EC-3);
 * - fixedPage: the single global App Setting (not merged), 0 = follow current.
 */
export function buildPamConfig(mappings: readonly Mapping[], fixedPage?: number): PamConfig {
  const executors = new Set<number>();
  let sendColors = false;
  let sendNames = false;
  let resendButtons = false;
  let sendTimecode = false;

  for (const mapping of mappings) {
    if (mapping.sendColors) sendColors = true;
    if (mapping.sendNames) sendNames = true;
    if (mapping.resendButtons) resendButtons = true;
    if (mapping.enableTimecodeSend) sendTimecode = true;
    for (const assignment of mapping.assignments) {
      const action = assignment.action;
      if (action.type === "executor" || action.type === "display") executors.add(action.number);
    }
  }

  // F2: cap the watch-set so the serialized payload stays within the plugin's
  // GlobalVars/UDP budget (the engine warns once at start when this truncates).
  const sortedExecutors = [...executors].sort((a, b) => a - b).slice(0, MAX_WATCH_SET);

  return {
    executors: sortedExecutors,
    sendColors,
    sendNames,
    resendButtons,
    sendTimecode,
    fixedPage: fixedPage && fixedPage >= 1 ? Math.trunc(fixedPage) : 0,
  };
}

/** Serialize a PamConfig into the wire payload string documented above. */
export function serializePamConfig(config: PamConfig): string {
  const flag = (value: boolean) => (value ? "1" : "0");
  return [
    `v=${PAM_CONFIG_VERSION}`,
    `e=${config.executors.join(",")}`,
    `c=${flag(config.sendColors)}`,
    `n=${flag(config.sendNames)}`,
    `r=${flag(config.resendButtons)}`,
    `t=${flag(config.sendTimecode)}`,
    `p=${config.fixedPage}`,
  ].join(";");
}

/**
 * The OSC message that sets the `pamConfig` GlobalVar on the console. The
 * payload is quote-free by construction, so it embeds safely as a Lua string
 * literal inside the outer single-quoted `Lua '…'` argument — mirroring the
 * pamCmdKey / pamPing / forceReload injections.
 */
export function pamConfigMessage(payload: string): OscMessage {
  return { address: "/cmd", args: [oscString(`Lua 'SetVar(GlobalVars(), "pamConfig", "${payload}")'`)] };
}

export interface ConfigSenderOptions {
  sendOsc: (message: OscMessage) => void;
  /** Recompute the current serialized payload (static per engine run today). */
  buildPayload: () => string;
  /** Heartbeat interval — a light periodic re-sync (~30s in production). */
  heartbeatMs: number;
  log: (line: string) => void;
}

/**
 * ConfigSender (AC-3/AC-4/AC-7): pushes `pamConfig` + `forceReload` to the
 * plugin on connect, on any mapping/settings change, and on a heartbeat.
 *
 * Change-detection & no-flood (AC-7 / guards PAM-12 BUG-4):
 * - `syncNow()` — used on connect and on change — sends **only** when the
 *   payload actually differs from the last one sent. Repeated calls with an
 *   unchanged payload are a no-op (no wire message, no log). This is the
 *   change-detection the review verifies.
 * - `heartbeat()` re-sends periodically so a stuck/reloaded plugin re-aligns
 *   without user action; a ~30s re-send is deliberate self-heal, not a flood.
 *   It never logs an unchanged re-send — the actual BUG-4 failure mode was log
 *   spam, not the wire message. (If onPC verification of the held plugin side
 *   shows the periodic re-send is unwanted, swap the heartbeat body to call
 *   `syncNow("heartbeat")` — a one-line change to make it change-detected too.)
 */
export class ConfigSender {
  private lastPayload: string | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: ConfigSenderOptions) {}

  /**
   * Send on connect / on change — only when the payload changed. Returns
   * whether it actually sent (handy for tests and callers).
   */
  syncNow(reason: string): boolean {
    const payload = this.options.buildPayload();
    if (payload === this.lastPayload) return false;
    this.push(payload, reason, false);
    return true;
  }

  /** Begin the periodic heartbeat re-sync; idempotent. */
  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.options.heartbeatMs);
  }

  /** Stop the heartbeat (engine shutdown / reconfigure). */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private heartbeat(): void {
    const payload = this.options.buildPayload();
    // Re-send for self-heal (AC-3/AC-4) but stay silent in the log when
    // nothing changed (AC-7 — no log-flood).
    this.push(payload, "heartbeat", payload === this.lastPayload);
  }

  private push(payload: string, reason: string, silent: boolean): void {
    this.options.sendOsc(pamConfigMessage(payload));
    // Paired forceReload so the plugin rebuilds its watch-set/flags from the
    // fresh config (design → Behaviors, AC-4).
    this.options.sendOsc(forceReloadMessage());
    this.lastPayload = payload;
    if (!silent) this.options.log(`config → plugin (${reason}): ${payload}`);
  }
}
