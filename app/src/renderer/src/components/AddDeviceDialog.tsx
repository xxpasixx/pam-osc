import { useEffect, useRef, useState } from "react";
import type { BoardInfo, CatalogEntry, InvalidCatalogEntry } from "../../../shared/ipc.js";

/**
 * "Add device" (PAM-11 AC-4/AC-7): board first, then one of THAT board's
 * mappings — or a new empty one. Invalid files are listed greyed out with
 * their validation error (AC-6); they have no readable board, so they live
 * on the board step.
 */
export function AddDeviceDialog({
  open,
  boards,
  catalog,
  invalidFiles,
  alreadyActive,
  onPick,
  onCreateNew,
  onClose,
}: {
  open: boolean;
  boards: BoardInfo[];
  catalog: CatalogEntry[];
  invalidFiles: InvalidCatalogEntry[];
  alreadyActive: Set<string>;
  onPick: (entry: CatalogEntry) => void;
  /** "+ New mapping (empty)" for the chosen board (AC-7). */
  onCreateNew: (deviceDefinitionId: string, name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [boardId, setBoardId] = useState<string | undefined>();
  const [newName, setNewName] = useState<string | undefined>();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setBoardId(undefined);
      setNewName(undefined);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const board = boards.find((candidate) => candidate.id === boardId);
  const mappings = board ? catalog.filter((entry) => entry.deviceDefinitionId === board.id) : [];

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Add device">
      {!board && (
        <>
          <h3>Add device — pick the board</h3>
          <div className="picker-list">
            {boards.length === 0 && <p className="empty-state">No boards loaded.</p>}
            {boards.map((candidate) => {
              const count = catalog.filter((entry) => entry.deviceDefinitionId === candidate.id).length;
              return (
                <button key={candidate.id} className="picker-item" onClick={() => setBoardId(candidate.id)}>
                  <span>
                    {candidate.name}
                    <span className="board">
                      {" "}
                      — {count} mapping{count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="badge">{candidate.origin}</span>
                </button>
              );
            })}
            {invalidFiles.map((file) => (
              <div key={file.file} className="picker-item invalid" role="note">
                <span>
                  <span className="mono">{file.file}</span>
                  <span className="error"> — {file.error}</span>
                </span>
                <span className="badge">invalid</span>
              </div>
            ))}
          </div>
        </>
      )}
      {board && (
        <>
          <h3>Add device — pick a mapping for {board.name}</h3>
          <div className="picker-list">
            {mappings.map((entry) => {
              const active = alreadyActive.has(entry.id);
              return (
                <button
                  key={entry.id}
                  className="picker-item"
                  disabled={active}
                  onClick={() => onPick(entry)}
                  title={active ? "Already active — use Duplicate for a second unit" : undefined}
                >
                  <span>
                    {entry.name}
                    {active && <span className="board"> (already active)</span>}
                  </span>
                  <span className="badge">{entry.origin}</span>
                </button>
              );
            })}
            {mappings.length === 0 && (
              <p className="empty-state">No mappings for this board yet — create the first one below.</p>
            )}
          </div>
          {newName === undefined ? (
            <div className="section-actions">
              <button onClick={() => setNewName("")}>+ New mapping (empty)</button>
            </div>
          ) : (
            <div className="new-mapping-form">
              <div className="field">
                <label htmlFor="dialog-new-mapping-name">Mapping name</label>
                <input
                  id="dialog-new-mapping-name"
                  value={newName}
                  autoFocus
                  maxLength={120}
                  placeholder={`${board.name} — my setup`}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newName.trim() !== "") onCreateNew(board.id, newName.trim());
                    if (event.key === "Escape") setNewName(undefined);
                  }}
                />
              </div>
              <button onClick={() => setNewName(undefined)}>Cancel</button>
              <button
                className="primary"
                disabled={newName.trim() === ""}
                onClick={() => onCreateNew(board.id, newName.trim())}
              >
                Create &amp; open editor
              </button>
            </div>
          )}
        </>
      )}
      <p>
        {board && (
          <button
            className="subtle"
            onClick={() => {
              setBoardId(undefined);
              setNewName(undefined);
            }}
          >
            ← Back to boards
          </button>
        )}{" "}
        <button className="subtle" onClick={onClose}>
          Cancel
        </button>
      </p>
    </dialog>
  );
}
