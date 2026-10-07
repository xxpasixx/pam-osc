import { isIpv4 } from "./osc-config.js";

/**
 * PAM-35 AC-5: which of this computer's addresses the console must send its
 * feedback to. Node-free so the renderer can show (and let the user override)
 * the same pick the generated OSC config uses.
 */

/** A non-internal IPv4 address of this computer with its netmask. */
export interface LocalAddress {
  address: string;
  netmask: string;
}

export type FeedbackIpReason =
  /** The console runs on this computer → loopback. */
  | "this-computer"
  /** Exactly one local address shares the console's subnet. */
  | "subnet"
  /** Only one local address exists at all. */
  | "single"
  /** Several addresses could apply — preselected, but the user must check (never a silent guess). */
  | "ambiguous"
  /** The console has an IPv4 address, but none of ours is on its subnet — preselected, flagged. */
  | "no-subnet-match"
  /** No network address — the config can't be written for a remote console. */
  | "none";

export interface FeedbackIpPick {
  ip: string | undefined;
  /** Addresses the user may choose from. */
  candidates: string[];
  reason: FeedbackIpReason;
}

/** The console address points at this computer (onPC here). */
export function isThisComputer(consoleAddress: string): boolean {
  const address = consoleAddress.trim().toLowerCase();
  return address === "localhost" || address === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address);
}

function toInt(ipv4: string): number {
  return ipv4.split(".").reduce((value, octet) => (value << 8) + Number.parseInt(octet, 10), 0) >>> 0;
}

function sameSubnet(a: string, b: string, netmask: string): boolean {
  if (!isIpv4(a) || !isIpv4(b) || !isIpv4(netmask)) return false;
  const mask = toInt(netmask);
  return (toInt(a) & mask) >>> 0 === (toInt(b) & mask) >>> 0;
}

export function pickFeedbackIp(consoleAddress: string, local: LocalAddress[]): FeedbackIpPick {
  if (isThisComputer(consoleAddress)) {
    return { ip: "127.0.0.1", candidates: ["127.0.0.1"], reason: "this-computer" };
  }
  const candidates = local.map((entry) => entry.address);
  const target = consoleAddress.trim();
  const matches = local.filter((entry) => sameSubnet(entry.address, target, entry.netmask));
  if (matches.length === 1) return { ip: matches[0]!.address, candidates, reason: "subnet" };
  if (matches.length > 1) return { ip: matches[0]!.address, candidates, reason: "ambiguous" };
  if (candidates.length === 1) return { ip: candidates[0], candidates, reason: "single" };
  if (candidates.length === 0) return { ip: undefined, candidates, reason: "none" };
  return { ip: candidates[0], candidates, reason: isIpv4(target) ? "no-subnet-match" : "ambiguous" };
}

/** The user's explicit choice wins while it is still a valid candidate. */
export function resolveFeedbackIp(pick: FeedbackIpPick, choice: string | undefined): string | undefined {
  return choice !== undefined && pick.candidates.includes(choice) ? choice : pick.ip;
}
