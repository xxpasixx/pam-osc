import { useEffect, useMemo, useRef, useState } from "react";

import {
  QUICKKEYS,
  QUICKKEY_GROUP_ORDER,
  resolveQuickKey,
  type QuickKeyDef,
} from "../../../../core/format/quickkeys.js";

/**
 * PAM-18 — searchable QuickKey picker. A native <select> cannot filter, and the
 * catalogue is ~110 entries, so this is a combobox: a text input that filters
 * the grouped list as you type, with full keyboard nav (↑/↓/Enter/Esc).
 *
 * The stored value is always a canonical code. A value that resolves via
 * mixed-case / legacy alias shows its real label; a genuinely unknown value
 * (AC-3) stays visible and flagged instead of being silently dropped.
 */
export function QuickKeySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const resolved = resolveQuickKey(value);
  const isUnknown = value !== "" && !resolved;
  const buttonLabel = value === "" ? "— select a key —" : resolved ? resolved.label : `unknown: ${value}`;

  // Flat, filtered, group-ordered list — matches on label AND code (case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inOrder = QUICKKEY_GROUP_ORDER.flatMap((group) =>
      QUICKKEYS.filter((qk) => qk.group === group),
    );
    if (!q) return inOrder;
    return inOrder.filter(
      (qk) => qk.label.toLowerCase().includes(q) || qk.code.toLowerCase().includes(q),
    );
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the active row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const openMenu = () => {
    setQuery("");
    const idx = filtered.findIndex((qk) => qk.code === resolved?.code);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const pick = (qk: QuickKeyDef) => {
    onChange(qk.code);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const qk = filtered[activeIndex];
        if (qk) pick(qk);
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  // Track group boundaries so we can render <optgroup>-style headers in the flat list.
  let lastGroup: string | null = null;

  return (
    <div className={`qk-select${isUnknown ? " invalid" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="qk-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={value === "" ? "qk-placeholder" : undefined}>{buttonLabel}</span>
        <span className="qk-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="qk-popover">
          <input
            className="qk-search"
            type="text"
            autoFocus
            placeholder="Search keys…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="qk-options" role="listbox" ref={listRef}>
            {filtered.length === 0 && <li className="qk-empty">No matching keys</li>}
            {filtered.map((qk, index) => {
              const header = qk.group !== lastGroup ? qk.group : null;
              lastGroup = qk.group;
              return (
                <li key={qk.code}>
                  {header && <div className="qk-group">{header}</div>}
                  <div
                    role="option"
                    aria-selected={qk.code === resolved?.code}
                    data-active={index === activeIndex}
                    className={`qk-option${index === activeIndex ? " active" : ""}${
                      qk.code === resolved?.code ? " selected" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault(); // keep focus, avoid closing before click
                      pick(qk);
                    }}
                  >
                    <span className="qk-option-label">{qk.label}</span>
                    <span className="qk-option-code mono">{qk.code}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
