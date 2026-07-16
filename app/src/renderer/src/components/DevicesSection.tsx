import type { ActiveMappingDraft } from "../../../core/settings/schema.js";
import type { DeviceStatus } from "../../../core/engine/types.js";
import type { CatalogEntry, FieldError, MidiPortList } from "../../../shared/ipc.js";

/**
 * One row per active mapping: name, board, port pickers, bound/missing LED,
 * duplicate, remove (design → Devices section; AC-2, AC-5, AC-7, EC-1).
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
}: {
  active: ActiveMappingDraft[];
  catalog: CatalogEntry[];
  devices: DeviceStatus[];
  midiPorts: MidiPortList;
  errors: FieldError[];
  onAdd: () => void;
  onChange: (active: ActiveMappingDraft[]) => void;
  onDuplicate: (id: string) => void;
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
        <p className="empty-state">
          No device active yet — add one to bridge a MIDI controller to the console.
        </p>
      )}
      {active.map((mapping, index) => {
        const entry = entryById.get(mapping.id);
        const status = statusById.get(mapping.id);
        const led = status?.state === "bound" ? "ok" : status ? "err" : "";
        const statusText = status?.state === "bound" ? "bound" : status ? "missing — check port" : "not applied yet";
        return (
          <div className="device-row" key={`${mapping.id}-${index}`}>
            <span className={`led ${led}`} title={statusText} aria-label={statusText} />
            <div className="device-name">
              {entry?.name ?? mapping.id}
              <span className="board">{entry?.boardName ?? "unknown board"} · {entry?.origin ?? "?"}</span>
            </div>
            <PortPicker
              id={`input-${index}`}
              label="MIDI in"
              value={mapping.input}
              ports={midiPorts.inputs}
              error={errorFor(`mapping:${mapping.id}.input`) ?? errorFor(`mapping:${mapping.id}`)}
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
            <button className="subtle" onClick={() => onDuplicate(mapping.id)} title="Create a copy for a second unit of this board">
              Duplicate
            </button>
            <button className="subtle" onClick={() => onChange(active.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        );
      })}
      <button onClick={onAdd}>+ Add device</button>
    </section>
  );
}
