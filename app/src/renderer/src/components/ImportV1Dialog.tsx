import { useEffect, useRef, useState } from "react";
import type { BoardInfo, ImportV1Result, PickV1FileResult } from "../../../shared/ipc.js";
import type { ImportSummary } from "../../../core/import/index.js";

/**
 * The three-step v1 import flow (PAM-5 AC-1/AC-5): the native file picker ran
 * already (step 1, in main); this dialog is step 2 (board + name) and step 3
 * (summary or error). Board choice is a plain dropdown — no guessing (spec).
 */

export type ImportFlow =
  | { phase: "configure"; file: Extract<PickV1FileResult, { status: "ok" }> }
  | { phase: "result"; entryName: string; summary: ImportSummary }
  | { phase: "error"; error: string };

const SECTION_LABELS: Array<{ key: keyof ImportSummary["convertedBySection"]; label: string }> = [
  { key: "control", label: "faders/knobs (control)" },
  { key: "pitch", label: "pitch faders" },
  { key: "note", label: "buttons (note)" },
  { key: "rltvControl", label: "encoders (rltvControl)" },
  { key: "display", label: "displays" },
];

function describeCounts(counts: Record<string, number>): string {
  const parts = SECTION_LABELS.filter(({ key }) => (counts[key] ?? 0) > 0).map(
    ({ key, label }) => `${counts[key]} ${label}`
  );
  return parts.length > 0 ? parts.join(" · ") : "no entries";
}

export function ImportV1Dialog({
  flow,
  boards,
  busy,
  onImport,
  onClose,
}: {
  flow: ImportFlow | undefined;
  boards: BoardInfo[];
  busy: boolean;
  onImport: (deviceDefinitionId: string, name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [boardId, setBoardId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (flow && !dialog.open) dialog.showModal();
    if (!flow && dialog.open) dialog.close();
  }, [flow]);

  // A fresh file resets the choices; the name is prefilled from the file.
  const fileName = flow?.phase === "configure" ? flow.file.fileName : undefined;
  useEffect(() => {
    if (fileName === undefined) return;
    setBoardId("");
    setName(fileName.replace(/\.json$/i, ""));
  }, [fileName]);

  const canImport = boardId !== "" && name.trim() !== "" && !busy;

  return (
    <dialog
      ref={ref}
      aria-label="Import v1 mapping"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h3>Import v1 mapping</h3>

      {flow?.phase === "configure" && (
        <>
          <p>
            <span className="mono">{flow.file.fileName}</span>
            <span className="board"> — {describeCounts(flow.file.counts)}</span>
          </p>
          <div className="field">
            <label htmlFor="import-board">Board (device definition)</label>
            <select id="import-board" value={boardId} onChange={(event) => setBoardId(event.target.value)}>
              <option value="">pick a board …</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="import-name">Name of the new mapping</label>
            <input
              id="import-name"
              type="text"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <p className="dialog-actions">
            <button className="subtle" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary" onClick={() => onImport(boardId, name.trim())} disabled={!canImport}>
              {busy ? "Importing …" : "Import"}
            </button>
          </p>
        </>
      )}

      {flow?.phase === "result" && (
        <>
          <p>
            Imported as <strong>{flow.entryName}</strong> — {flow.summary.converted} control
            {flow.summary.converted === 1 ? "" : "s"} converted.
          </p>
          {flow.summary.warnings.length > 0 ? (
            <>
              <p>
                {flow.summary.warnings.length} warning{flow.summary.warnings.length === 1 ? "" : "s"} — nothing was
                dropped silently (also recorded in the mapping's notes):
              </p>
              <ul className="import-warnings">
                {flow.summary.warnings.map((warning, index) => (
                  <li key={index} className="mono">
                    {warning.text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No warnings — everything converted cleanly.</p>
          )}
          <p className="board">
            The mapping is now available under “+ Add device”; pick its MIDI ports there and save.
          </p>
          <p className="dialog-actions">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </p>
        </>
      )}

      {flow?.phase === "error" && (
        <>
          <p className="error">{flow.error}</p>
          <p className="board">Nothing was imported.</p>
          <p className="dialog-actions">
            <button className="subtle" onClick={onClose}>
              Close
            </button>
          </p>
        </>
      )}
    </dialog>
  );
}
