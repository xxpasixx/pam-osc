import { appendFile, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * The session log (PAM-7 AC-11): lifecycle events and errors — engine state,
 * console connection, issues, save/import/export operations. Deliberately
 * NOT per-message MIDI/OSC traffic (that stays in the in-memory traffic log).
 * One file per session with a hard size cap; the previous session survives
 * as session-prev.log so the support package always carries recent history.
 * Electron-free — the directory is injected. Logging must never crash or
 * slow the app: writes are queued fire-and-forget and errors are swallowed.
 */
export class SessionLog {
  private queue: Promise<void> = Promise.resolve();
  private written = 0;
  private truncated = false;
  private started = false;

  constructor(
    private readonly dir: string,
    private readonly maxBytes = 512 * 1024
  ) {}

  get filePath(): string {
    return join(this.dir, "session.log");
  }

  get previousPath(): string {
    return join(this.dir, "session-prev.log");
  }

  /** Rotate the previous session's log aside and start fresh. */
  async start(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await rm(this.previousPath, { force: true });
      await rename(this.filePath, this.previousPath);
    } catch {
      // First session or an unwritable folder — both fine; log() stays a no-op
      // on failure by design.
    }
    this.written = 0;
    this.truncated = false;
    this.started = true;
  }

  log(message: string): void {
    if (!this.started || this.truncated) return;
    const line = `[${new Date().toISOString()}] ${message}\n`;
    const size = Buffer.byteLength(line, "utf8");
    if (this.written + size > this.maxBytes) {
      this.truncated = true;
      this.enqueue(`[${new Date().toISOString()}] log truncated — session size cap reached\n`);
      return;
    }
    this.written += size;
    this.enqueue(line);
  }

  /** Wait for queued writes — tests and the support package use this. */
  flush(): Promise<void> {
    return this.queue;
  }

  private enqueue(line: string): void {
    this.queue = this.queue
      .then(() => appendFile(this.filePath, line, "utf8"))
      .catch(() => {
        // never let logging take the app down
      });
  }
}
