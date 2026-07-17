import { exec } from "node:child_process";
import type { PortDiagnosis } from "../shared/ipc.js";

/**
 * v1 portUtils.findUdpPortUser, ported (PAM-4 AC-2): names the process
 * holding a local UDP port so "the OSC port is blocked" can be diagnosed
 * instead of guessed. Never throws — an unreadable answer is "unknown".
 */

const run = (command: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout) => {
      // lsof exits with 1 when nothing matches — that means the port is free.
      if (error && !(process.platform !== "win32" && error.code === 1)) return resolve(undefined);
      resolve(stdout ?? "");
    });
  });

export async function diagnoseUdpPort(port: number): Promise<PortDiagnosis> {
  const ownPids = [process.pid, process.ppid].filter(Boolean);

  if (process.platform === "win32") {
    const stdout = await run("netstat -ano -p UDP");
    if (stdout === undefined) return { port, status: "unknown" };

    let holderPid: number | undefined;
    for (const line of stdout.split("\n")) {
      const cols = line.trim().split(/\s+/);
      // UDP lines: [proto, localAddress, foreignAddress, pid]
      if (cols.length >= 4 && cols[0] === "UDP" && cols[1]?.endsWith(":" + port)) {
        holderPid = parseInt(cols[cols.length - 1] ?? "");
        break;
      }
    }
    if (holderPid === undefined || isNaN(holderPid)) return { port, status: "free" };
    if (ownPids.includes(holderPid)) return { port, status: "self" };

    const tasklist = await run(`tasklist /FI "PID eq ${holderPid}" /FO CSV /NH`);
    const match = tasklist?.match(/^"([^"]+)"/m);
    return { port, status: "other", name: match?.[1] ?? "unknown", pid: holderPid };
  }

  // macOS / Linux: lsof lists the sockets bound to the UDP port.
  const stdout = await run(`lsof -nP -iUDP:${port}`);
  if (stdout === undefined) return { port, status: "unknown" };
  const lines = stdout.trim().split("\n").slice(1); // drop header
  if (!stdout.trim() || lines.length === 0) return { port, status: "free" };

  const cols = lines[0]?.trim().split(/\s+/) ?? [];
  const holderPid = parseInt(cols[1] ?? "");
  if (isNaN(holderPid)) return { port, status: "unknown" };
  if (ownPids.includes(holderPid)) return { port, status: "self" };
  return { port, status: "other", name: cols[0] ?? "unknown", pid: holderPid };
}
