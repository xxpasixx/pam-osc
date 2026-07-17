import { useState } from "react";
import type { BoardInfo, CatalogEntry, InvalidCatalogEntry } from "../../../../shared/ipc.js";

/**
 * The Boards tab (PAM-6 AC-8, PAM-11 AC-1/2/3): the board is the anchor —
 * every board lists the mappings that belong to it (bundled + user), can
 * spawn a new empty mapping, and links into both editors. Files that failed
 * validation are listed at the bottom (AC-6) — they have no readable board.
 */

/** Inline one-field form for "New mapping" — shared by every board group. */
function NewMappingForm({
  boardName,
  onCreate,
  onCancel,
}: {
  boardName: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const canCreate = name.trim() !== "";
  return (
    <div className="new-mapping-form">
      <div className="field">
        <label htmlFor="new-mapping-name">Mapping name</label>
        <input
          id="new-mapping-name"
          value={name}
          autoFocus
          placeholder={`${boardName} — my setup`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) onCreate(name.trim());
            if (event.key === "Escape") onCancel();
          }}
        />
      </div>
      <button onClick={onCancel}>Cancel</button>
      <button className="primary" disabled={!canCreate} onClick={() => onCreate(name.trim())}>
        Create &amp; open editor
      </button>
    </div>
  );
}

export function BoardsView({
  boards,
  catalog,
  invalidFiles,
  onEdit,
  onCreate,
  onEditMapping,
  onCreateMapping,
}: {
  boards: BoardInfo[];
  catalog: CatalogEntry[];
  invalidFiles: InvalidCatalogEntry[];
  onEdit: (id: string) => void;
  onCreate: (name: string, width: number, height: number) => void;
  onEditMapping: (id: string) => void;
  onCreateMapping: (deviceDefinitionId: string, name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [width, setWidth] = useState("8");
  const [height, setHeight] = useState("8");
  /** Board id whose "New mapping" form is open — at most one at a time. */
  const [newMappingFor, setNewMappingFor] = useState<string | undefined>();
  /** AC-8: filters boards by name/id — deliberately never mapping names. */
  const [query, setQuery] = useState("");

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const canCreate = name.trim() !== "" && parsedWidth > 0 && parsedHeight > 0;

  const needle = query.trim().toLowerCase();
  const visibleBoards =
    needle === ""
      ? boards
      : boards.filter(
          (board) => board.name.toLowerCase().includes(needle) || board.id.toLowerCase().includes(needle)
        );

  return (
    <section className="card" aria-label="Boards">
      <h2>Boards</h2>
      <p className="inspector-meta">
        A board describes the hardware (controls, MIDI addresses, layout). Each board carries its mappings — what the
        controls do on the console. Activate a mapping under Setup.
      </p>
      {boards.length > 0 && (
        <div className="field board-search">
          <label htmlFor="board-search">Search boards</label>
          <input
            id="board-search"
            type="search"
            value={query}
            placeholder="Board name or id …"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      {visibleBoards.map((board) => {
        const mappings = catalog.filter((entry) => entry.deviceDefinitionId === board.id);
        return (
          <div className="board-group" key={board.id} aria-label={board.name}>
            <div className="board-group-header">
              <span className="board-group-name">{board.name}</span>
              <span className="board mono">{board.id}</span>
              <span className="badge">{board.origin}</span>
              <div className="spacer" />
              <button className="subtle" onClick={() => onEdit(board.id)}>
                {board.origin === "bundled" ? "Edit board (a copy)" : "Edit board"}
              </button>
            </div>
            <div className="board-group-mappings">
              {mappings.map((entry) => (
                <div className="mapping-row" key={entry.id}>
                  <span>{entry.name}</span>
                  <span className="badge">{entry.origin}</span>
                  <div className="spacer" />
                  <button className="subtle" onClick={() => onEditMapping(entry.id)}>
                    Edit mapping
                  </button>
                </div>
              ))}
              {mappings.length === 0 && (
                <p className="empty-state">No mappings for this board yet — create one to use it.</p>
              )}
              {newMappingFor === board.id ? (
                <NewMappingForm
                  boardName={board.name}
                  onCreate={(mappingName) => {
                    setNewMappingFor(undefined);
                    onCreateMapping(board.id, mappingName);
                  }}
                  onCancel={() => setNewMappingFor(undefined)}
                />
              ) : (
                <div className="section-actions">
                  <button onClick={() => setNewMappingFor(board.id)}>+ New mapping</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {boards.length === 0 && <p className="empty-state">No boards loaded.</p>}
      {boards.length > 0 && visibleBoards.length === 0 && (
        <p className="empty-state">No board matches “{query.trim()}”.</p>
      )}
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
      {invalidFiles.length > 0 && (
        <div className="board-group" aria-label="Invalid mapping files">
          <div className="board-group-header">
            <span className="board-group-name">Invalid mapping files</span>
          </div>
          <div className="board-group-mappings">
            {invalidFiles.map((file) => (
              <div className="mapping-row invalid" key={file.file} role="note">
                <span>
                  <span className="mono">{file.file}</span>
                  <span className="error"> — {file.error}</span>
                </span>
                <span className="badge">invalid</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
