import { useEffect, useRef, useState } from "react";
import type { BoardInfo } from "../../../../shared/ipc.js";

/**
 * The boards manager (design → Boards manager): every device definition with
 * its origin badge; Edit (bundled → "Edit a copy") and New board (AC-6).
 */

export function BoardsManagerDialog({
  open,
  boards,
  onClose,
  onEdit,
  onCreate,
}: {
  open: boolean;
  boards: BoardInfo[];
  onClose: () => void;
  onEdit: (id: string) => void;
  onCreate: (name: string, width: number, height: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("8");
  const [height, setHeight] = useState("8");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setCreating(false);
      setName("");
    }
  }, [open]);

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const canCreate = name.trim() !== "" && parsedWidth > 0 && parsedHeight > 0;

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Boards">
      <h3>Boards</h3>
      {!creating && (
        <>
          <div className="picker-list">
            {boards.map((board) => (
              <button key={board.id} className="picker-item" onClick={() => onEdit(board.id)}>
                <span>{board.name}</span>
                <span className="board mono">{board.id}</span>
                <span className="badge">{board.origin}</span>
                <span className="board">{board.origin === "bundled" ? "edit a copy →" : "edit →"}</span>
              </button>
            ))}
            {boards.length === 0 && <p className="empty-state">No boards loaded.</p>}
          </div>
          <div className="dialog-actions">
            <button onClick={() => setCreating(true)}>+ New board</button>
            <button onClick={onClose}>Close</button>
          </div>
        </>
      )}
      {creating && (
        <>
          <div className="field">
            <label htmlFor="new-board-name">Board name</label>
            <input
              id="new-board-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="My Controller"
            />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="new-board-width">Width (grid units)</label>
              <input
                id="new-board-width"
                inputMode="numeric"
                value={width}
                onChange={(event) => setWidth(event.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="field">
              <label htmlFor="new-board-height">Height (grid units)</label>
              <input
                id="new-board-height"
                inputMode="numeric"
                value={height}
                onChange={(event) => setHeight(event.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <div className="dialog-actions">
            <button onClick={() => setCreating(false)}>Back</button>
            <button
              className="primary"
              disabled={!canCreate}
              onClick={() => onCreate(name.trim(), parsedWidth, parsedHeight)}
            >
              Create &amp; open editor
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
