import { useEffect, useMemo, useRef, useState } from "react";
import type { TrafficCategory, TrafficEntry } from "../../../shared/ipc.js";

/**
 * The filterable traffic log (PAM-4 AC-5): MIDI/OSC in both directions plus
 * engine lines, copy-to-clipboard for support cases. The list is bounded by
 * the App (EC-2) — this component only renders what it gets.
 */

const FILTERS: { category: TrafficCategory; label: string }[] = [
  { category: "midi-in", label: "MIDI IN" },
  { category: "midi-out", label: "MIDI OUT" },
  { category: "osc-in", label: "OSC IN" },
  { category: "osc-out", label: "OSC OUT" },
  { category: "system", label: "System" },
];

const LABEL_BY_CATEGORY = new Map(FILTERS.map((filter) => [filter.category, filter.label]));

function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatLine(entry: TrafficEntry): string {
  const source = entry.source ? ` ${entry.source}:` : "";
  return `${formatTime(entry.at)} [${LABEL_BY_CATEGORY.get(entry.category) ?? entry.category}]${source} ${entry.text}`;
}

export function TrafficLog({ entries }: { entries: TrafficEntry[] }) {
  const [enabled, setEnabled] = useState<Set<TrafficCategory>>(new Set(FILTERS.map((filter) => filter.category)));
  const [copied, setCopied] = useState(false);
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => entries.filter((entry) => enabled.has(entry.category)), [entries, enabled]);

  // Stick to the newest entries unless the user scrolled up to read.
  useEffect(() => {
    const list = listRef.current;
    if (list && follow) list.scrollTop = list.scrollHeight;
  }, [visible, follow]);

  const toggle = (category: TrafficCategory) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(visible.map(formatLine).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied — nothing sensible to do beyond not crashing.
    }
  };

  return (
    <section className="card traffic-card" aria-label="Traffic log">
      <h2>Traffic log</h2>
      <div className="traffic-toolbar">
        {FILTERS.map((filter) => (
          <button
            key={filter.category}
            className={`filter ${enabled.has(filter.category) ? "on" : ""}`}
            onClick={() => toggle(filter.category)}
            aria-pressed={enabled.has(filter.category)}
          >
            {filter.label}
          </button>
        ))}
        <div className="spacer" />
        <button className="subtle" onClick={() => void copy()} disabled={visible.length === 0}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        className="traffic-list"
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          setFollow(list.scrollHeight - list.scrollTop - list.clientHeight < 40);
        }}
      >
        {visible.length === 0 && <p className="empty-state">No messages yet.</p>}
        {visible.map((entry, index) => (
          <div className={`traffic-line ${entry.category}`} key={`${entry.at}-${index}`}>
            <span className="time">{formatTime(entry.at)}</span>
            <span className={`tag ${entry.category}`}>{LABEL_BY_CATEGORY.get(entry.category)}</span>
            <span className="text">
              {entry.source ? `${entry.source}: ` : ""}
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
