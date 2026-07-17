import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionLog } from "./session-log.js";

describe("SessionLog (PAM-7 AC-11)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pam-log-"));
  });

  it("writes timestamped lines in order", async () => {
    const log = new SessionLog(dir);
    await log.start();
    log.log("first");
    log.log("second");
    await log.flush();
    const content = await readFile(log.filePath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*\] first$/);
    expect(lines[1]).toContain("second");
  });

  it("rotates the previous session's log aside on start", async () => {
    const first = new SessionLog(dir);
    await first.start();
    first.log("old session");
    await first.flush();

    const second = new SessionLog(dir);
    await second.start();
    second.log("new session");
    await second.flush();

    expect(await readFile(second.previousPath, "utf8")).toContain("old session");
    const current = await readFile(second.filePath, "utf8");
    expect(current).toContain("new session");
    expect(current).not.toContain("old session");
  });

  it("stops at the size cap with a truncation marker instead of growing forever", async () => {
    const log = new SessionLog(dir, 200);
    await log.start();
    for (let i = 0; i < 50; i += 1) log.log(`line ${i} padding padding padding`);
    await log.flush();
    const content = await readFile(log.filePath, "utf8");
    expect(content).toContain("log truncated");
    // cap + one marker line — nowhere near 50 lines
    expect(content.trim().split("\n").length).toBeLessThan(10);
  });

  it("writes a final line synchronously so a quit can't drop it (BUG-6)", async () => {
    const log = new SessionLog(dir);
    await log.start();
    log.logSyncFinal("session ending");
    // no flush() — logSyncFinal must have already hit disk
    const content = await readFile(log.filePath, "utf8");
    expect(content).toContain("session ending");
  });

  it("never throws when the folder is unwritable — logging is best-effort", async () => {
    const log = new SessionLog(join(dir, "nope", "deeper", "\0bad"));
    await log.start(); // swallows the mkdir failure
    log.log("into the void");
    await expect(log.flush()).resolves.toBeUndefined();
  });
});
