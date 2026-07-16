import { useEffect, useRef } from "react";
import type { CatalogEntry, InvalidCatalogEntry } from "../../../shared/ipc.js";

/**
 * The mapping picker: bundled + user mappings, invalid files greyed out
 * with their validation error (AC-2, EC-4).
 */
export function AddDeviceDialog({
  open,
  catalog,
  invalidFiles,
  alreadyActive,
  onPick,
  onClose,
}: {
  open: boolean;
  catalog: CatalogEntry[];
  invalidFiles: InvalidCatalogEntry[];
  alreadyActive: Set<string>;
  onPick: (entry: CatalogEntry) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Add device">
      <h3>Add device</h3>
      <div className="picker-list">
        {catalog.length === 0 && invalidFiles.length === 0 && <p className="empty-state">No mappings found.</p>}
        {catalog.map((entry) => {
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
                <span className="board"> — {entry.boardName}</span>
                {active && <span className="board"> (already active)</span>}
              </span>
              <span className="badge">{entry.origin}</span>
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
      <p>
        <button className="subtle" onClick={onClose}>
          Cancel
        </button>
      </p>
    </dialog>
  );
}
