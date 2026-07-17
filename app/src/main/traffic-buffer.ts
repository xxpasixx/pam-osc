import type { TrafficEntry } from "../shared/ipc.js";

/**
 * Bounded traffic buffer with batched delivery (PAM-4 AC-5, EC-2): a fader
 * move produces dozens of messages per second — one IPC send per entry would
 * flood the renderer. Entries are kept for the snapshot (ring buffer) and
 * flushed to the listener at most every `flushMs`.
 */
export class TrafficBuffer {
  private readonly entries: TrafficEntry[] = [];
  private pending: TrafficEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly flush: (batch: TrafficEntry[]) => void,
    private readonly capacity = 500,
    private readonly flushMs = 100
  ) {}

  push(entry: TrafficEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);

    this.pending.push(entry);
    if (this.pending.length > this.capacity) this.pending.splice(0, this.pending.length - this.capacity);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        const batch = this.pending;
        this.pending = [];
        this.timer = undefined;
        this.flush(batch);
      }, this.flushMs);
    }
  }

  /** The retained tail, oldest first — seeds the renderer at mount. */
  recent(): TrafficEntry[] {
    return [...this.entries];
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
