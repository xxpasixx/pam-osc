import { useState } from "react";
import type { BoardInfo } from "../../../../shared/ipc.js";

/**
 * The Boards tab (AC-8): every device definition with its origin badge,
 * Edit (bundled → "Edit a copy") and New board (AC-6) — board management
 * lives here, separated from activating devices in Setup.
 */

export function BoardsView({
  boards,
  onEdit,
  onCreate,
}: {
  boards: BoardInfo[];
  onEdit: (id: string) => void;
  onCreate: (name: string, width: number, height: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("8");
  const [height, setHeight] = useState("8");

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const canCreate = name.trim() !== "" && parsedWidth > 0 && parsedHeight > 0;

  return (
    <section className="card" aria-label="Boards">
      <h2>Boards</h2>
      <p className="inspector-meta">
        Board types describe the hardware (controls, MIDI addresses, layout). Mappings assign them to the console —
        manage those under Setup.
      </p>
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
      {!creating && (
        <div className="section-actions">
          <button onClick={() => setCreating(true)}>+ New board</button>
        </div>
      )}
      {creating && (
        <div className="new-board-form">
          <div className="form-row">
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
          <div className="section-actions">
            <button onClick={() => setCreating(false)}>Cancel</button>
            <button
              className="primary"
              disabled={!canCreate}
              onClick={() => {
                setCreating(false);
                setName("");
                onCreate(name.trim(), parsedWidth, parsedHeight);
              }}
            >
              Create &amp; open editor
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
