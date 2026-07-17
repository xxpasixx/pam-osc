import type { ActiveMappingDraft } from "../../../core/settings/schema.js";
import type { DeviceStatus } from "../../../core/engine/types.js";
import type { CatalogEntry, FieldError, MidiPortList } from "../../../shared/ipc.js";

/**
 * One row per active device: board, mapping dropdown (same-board mappings
 * only — PAM-11 AC-5), port pickers, bound/missing LED, duplicate, remove
 * (design → Devices section; AC-2, AC-5, AC-7, EC-1).
 */

function PortPicker({
  id,
  value,
  ports,
  label,
  error,
  optional,
  onChange,
}: {
  id: string;
  value: string;
  ports: string[];
  label: string;
  error: string | undefined;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  // A configured port that is not currently present stays selectable and
  // marked — the row can be rebound or left for hot-plug (AC-5, EC-1).
  const missing = value !== "" && !ports.includes(value);
  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {ports.length === 0 && value === "" ? (
          <option value="">no MIDI devices found — connect one</option>
        ) : (
          <option value="">{optional ? "(none)" : "pick a port …"}</option>
        )}
        {missing && <option value={value}>{value} (not connected)</option>}
        {ports.map((port) => (
          <option key={port} value={port}>
            {port}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function DevicesSection({
  active,
  catalog,
  devices,
  midiPorts,
  errors,
  onAdd,
  onChange,
  onDuplicate,
  onImportV1,
  onEdit,
}: {
  active: ActiveMappingDraft[];
  catalog: CatalogEntry[];
  devices: DeviceStatus[];
  midiPorts: MidiPortList;
  errors: FieldError[];
  onAdd: () => void;
  onChange: (active: ActiveMappingDraft[]) => void;
  onDuplicate: (id: string) => void;
  onImportV1: () => void;
  onEdit: (id: string) => void;
}) {
  const entryById = new Map(catalog.map((entry) => [entry.id, entry]));
  const statusById = new Map(devices.map((status) => [status.mappingId, status]));
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  const update = (index: number, patch: Partial<ActiveMappingDraft>) => {
    onChange(active.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));
  };

  return (
    <section className="card" aria-label="Devices">
      <h2>Devices</h2>
      {active.length === 0 && (
        <p className="empty-state">No device active yet — add one to bridge a MIDI controller to the console.</p>
      )}
      {active.map((mapping, index) => {
        const entry = entryById.get(mapping.id);
        const status = statusById.get(mapping.id);
        const led = status?.state === "bound" ? "ok" : status ? "err" : "";
        const statusText = status?.state === "bound" ? "bound" : status ? "missing — check port" : "not applied yet";
        // AC-5: only mappings of the same board are offered; ids already
        // active in another row are disabled (a mapping runs once).
        const siblingMappings = entry
          ? catalog.filter((candidate) => candidate.deviceDefinitionId === entry.deviceDefinitionId)
          : [];
        const activeElsewhere = new Set(active.filter((_, i) => i !== index).map((other) => other.id));
        return (
          // BUG-4 (review): rows are positional — keying by the mutable
          // mapping id remounted the row (and dropped focus) on every switch.
          <div className="device-row" key={index}>
            <span className={`led ${led}`} title={statusText} aria-label={statusText} />
            <div className="device-name">
              {entry?.boardName ?? "unknown board"}
              <span className="board">{statusText}</span>
            </div>
            <div className={`field ${errorFor(`mapping:${mapping.id}`) ? "invalid" : ""}`}>
              <label htmlFor={`mapping-${index}`}>Mapping</label>
              <select
                id={`mapping-${index}`}
                value={mapping.id}
                onChange={(event) => update(index, { id: event.target.value })}
              >
                {!entry && <option value={mapping.id}>{mapping.id} (invalid)</option>}
                {siblingMappings.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} disabled={activeElsewhere.has(candidate.id)}>
                    {candidate.name}
                    {activeElsewhere.has(candidate.id) ? " (already active)" : ""}
                  </option>
                ))}
              </select>
              {errorFor(`mapping:${mapping.id}`) && (
                <span className="field-error">{errorFor(`mapping:${mapping.id}`)}</span>
              )}
            </div>
            <PortPicker
              id={`input-${index}`}
              label="MIDI in"
              value={mapping.input}
              ports={midiPorts.inputs}
              error={errorFor(`mapping:${mapping.id}.input`)}
              onChange={(input) => update(index, { input })}
            />
            <PortPicker
              id={`output-${index}`}
              label="MIDI out (feedback)"
              value={mapping.output ?? ""}
              ports={midiPorts.outputs}
              optional
              error={errorFor(`mapping:${mapping.id}.output`)}
              onChange={(output) => update(index, { output: output === "" ? undefined : output })}
            />
            <div className="spacer" />
            <button
              className="subtle"
              onClick={() => onEdit(mapping.id)}
              disabled={!entry}
              title="Open the visual editor for this mapping"
            >
              Edit
            </button>
            <button
              className="subtle"
              onClick={() => onDuplicate(mapping.id)}
              title="Create a copy for a second unit of this board"
            >
              Duplicate
            </button>
            <button className="subtle" onClick={() => onChange(active.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        );
      })}
      <div className="section-actions">
        <button onClick={onAdd}>+ Add device</button>
        <button className="subtle" onClick={onImportV1} title="Convert a pam-osc v1 mapping (.json) into a v2 mapping">
          Import v1 mapping
        </button>
      </div>
    </section>
  );
}
