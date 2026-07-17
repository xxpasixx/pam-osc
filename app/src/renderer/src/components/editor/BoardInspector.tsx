import type { Control, DeviceDefinition, EditorIssue } from "../../../../core/format/index.js";
import type { UsageRef } from "../../../../shared/ipc.js";

/**
 * Board mode inspector (design → Inspector panel): control properties with
 * MIDI address + Learn (AC-3/AC-4); board settings when nothing is selected.
 * Address fields may be empty in the draft — validation blocks save (AC-7).
 */

interface MidiDraft {
  kind: "cc" | "note" | "pitchbend";
  channel?: number;
  number?: number;
}

function intField(value: string, max: number): number | undefined {
  const digits = value.replace(/\D/g, "");
  return digits === "" ? undefined : Math.min(Number(digits), max);
}

function Num({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  max: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(intField(e.target.value, max))} />
    </div>
  );
}

/** A Learn/Listening button aligned with the inputs of the same form-row. */
function LearnButton({
  learn,
  target,
  title,
  onLearnStart,
  onLearnCancel,
}: {
  learn: { listening: boolean; port: string };
  target: "midi" | "push";
  title: string;
  onLearnStart: (port: string, target: "midi" | "push") => void;
  onLearnCancel: () => void;
}) {
  return (
    <div className="field">
      <label aria-hidden="true">&nbsp;</label>
      {learn.listening ? (
        <button className="learning" onClick={onLearnCancel}>
          Listening … cancel
        </button>
      ) : (
        <button onClick={() => onLearnStart(learn.port, target)} disabled={learn.port === ""} title={title}>
          Learn
        </button>
      )}
    </div>
  );
}

function GridNum({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d.]/g, "");
          const parsed = Number(cleaned);
          if (cleaned !== "" && Number.isFinite(parsed)) onChange(Math.round(parsed * 2) / 2);
        }}
      />
    </div>
  );
}

export function BoardInspector({
  device,
  selected,
  usage,
  issues,
  learn,
  onChangeControl,
  onChangeBoard,
  onDelete,
  onLearnStart,
  onLearnCancel,
}: {
  device: DeviceDefinition;
  selected: Control | undefined;
  /** Mappings assigning the selected control — the AC-7 delete warning data. */
  usage: UsageRef[];
  issues: EditorIssue[];
  /** port = the editor-wide hardware source, picked in the editor header. */
  learn: { listening: boolean; port: string };
  onChangeControl: (next: Control) => void;
  onChangeBoard: (patch: Partial<DeviceDefinition>) => void;
  onDelete: () => void;
  /** target: which address the capture fills — the control's own or its push (AC-9). */
  onLearnStart: (port: string, target: "midi" | "push") => void;
  onLearnCancel: () => void;
}) {
  if (!selected) {
    return (
      <div className="inspector">
        <h3>Board settings</h3>
        <div className="field">
          <label htmlFor="board-name">Name</label>
          <input id="board-name" value={device.name} onChange={(e) => onChangeBoard({ name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="board-manufacturer">Manufacturer</label>
          <input
            id="board-manufacturer"
            value={device.manufacturer ?? ""}
            onChange={(e) => onChangeBoard({ manufacturer: e.target.value === "" ? undefined : e.target.value })}
          />
        </div>
        <div className="form-row">
          <GridNum
            id="board-width"
            label="Width (units)"
            value={device.layout.width}
            onChange={(width) => onChangeBoard({ layout: { ...device.layout, width } })}
          />
          <GridNum
            id="board-height"
            label="Height (units)"
            value={device.layout.height}
            onChange={(height) => onChangeBoard({ layout: { ...device.layout, height } })}
          />
        </div>
        <details className="advanced">
          <summary>Advanced — affects every control</summary>
          <div className="field">
            <label htmlFor="board-mode">Protocol mode</label>
            <select
              id="board-mode"
              value={device.mode}
              onChange={(e) => onChangeBoard({ mode: e.target.value as DeviceDefinition["mode"] })}
            >
              <option value="standard">standard</option>
              <option value="mc">mc (Mackie Control)</option>
            </select>
          </div>
          <Num
            id="board-channel"
            label="Default MIDI channel (1–16)"
            value={device.defaultMidiChannel}
            max={16}
            onChange={(channel) => onChangeBoard({ defaultMidiChannel: channel ?? 1 })}
          />
        </details>
        <div className="field">
          <label htmlFor="board-notes">Notes</label>
          <input
            id="board-notes"
            value={device.notes ?? ""}
            onChange={(e) => onChangeBoard({ notes: e.target.value === "" ? undefined : e.target.value })}
          />
        </div>
        <p className="inspector-meta">Select a control on the board to edit it, or add one from the toolbar.</p>
      </div>
    );
  }

  // The union member's exact midi/capability shape is re-established by
  // validation — the inspector edits a draft where fields may be missing.
  const midi: MidiDraft | undefined = selected.type === "display" ? undefined : (selected.midi as MidiDraft);
  const patch = (next: object) => onChangeControl({ ...selected, ...next } as Control);
  const patchMidi = (next: Partial<MidiDraft>) => patch({ midi: { ...(midi ?? { kind: "note" }), ...next } });
  const capabilities = selected.capabilities as Record<string, unknown> & Control["capabilities"];

  return (
    <div className="inspector">
      <h3>{selected.label ?? selected.id}</h3>
      <p className="inspector-meta mono">
        {selected.type} · {selected.id}
      </p>

      <div className="field">
        <label htmlFor="ctl-label">Label</label>
        <input
          id="ctl-label"
          value={selected.label ?? ""}
          onChange={(e) => patch({ label: e.target.value === "" ? undefined : e.target.value })}
        />
      </div>

      {selected.type !== "display" && (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="ctl-kind">MIDI kind</label>
              <select
                id="ctl-kind"
                value={midi?.kind ?? "note"}
                onChange={(e) => {
                  const kind = e.target.value as MidiDraft["kind"];
                  patchMidi(kind === "pitchbend" ? { kind, number: undefined } : { kind });
                }}
              >
                <option value="cc">cc</option>
                <option value="note">note</option>
                <option value="pitchbend">pitchbend</option>
              </select>
            </div>
            {midi?.kind !== "pitchbend" && (
              <Num id="ctl-number" label="Number (0–127)" value={midi?.number} max={127} onChange={(number) => patchMidi({ number })} />
            )}
            <Num
              id="ctl-channel"
              label="Channel (empty = default)"
              value={midi?.channel}
              max={16}
              onChange={(channel) => patchMidi({ channel })}
            />
            <LearnButton
              learn={learn}
              target="midi"
              title="Move or press the physical control to capture its MIDI address"
              onLearnStart={onLearnStart}
              onLearnCancel={onLearnCancel}
            />
          </div>
        </>
      )}

      {selected.type === "display" && (
        <Num
          id="ctl-index"
          label="Display slot index (0–7)"
          value={selected.index}
          max={7}
          onChange={(index) => patch({ index })}
        />
      )}

      <div className="form-row">
        <GridNum id="pos-x" label="X" value={selected.position.x} onChange={(x) => patch({ position: { ...selected.position, x } })} />
        <GridNum id="pos-y" label="Y" value={selected.position.y} onChange={(y) => patch({ position: { ...selected.position, y } })} />
        <GridNum id="pos-w" label="W" value={selected.position.width} onChange={(width) => patch({ position: { ...selected.position, width } })} />
        <GridNum id="pos-h" label="H" value={selected.position.height} onChange={(height) => patch({ position: { ...selected.position, height } })} />
        <div className="field">
          <label htmlFor="pos-shape">Shape</label>
          <select
            id="pos-shape"
            value={selected.position.shape}
            onChange={(e) => patch({ position: { ...selected.position, shape: e.target.value as "rect" | "circle" } })}
          >
            <option value="rect">rect</option>
            <option value="circle">circle</option>
          </select>
        </div>
      </div>

      {selected.type === "fader" && (
        <label className="check">
          <input
            type="checkbox"
            checked={capabilities["motorized"] === true}
            onChange={(e) => patch({ capabilities: { motorized: e.target.checked } })}
          />
          Motorized (receives position feedback)
        </label>
      )}
      {selected.type === "button" && (
        <div className="field">
          <label htmlFor="cap-led">LED</label>
          <select
            id="cap-led"
            value={String(capabilities["led"] ?? "none")}
            onChange={(e) => patch({ capabilities: { led: e.target.value } })}
          >
            <option value="none">none</option>
            <option value="on-off">on-off</option>
            <option value="velocity-colors">velocity-colors</option>
          </select>
        </div>
      )}
      {selected.type === "encoder" && (
        <EncoderCapabilities
          capabilities={selected.capabilities}
          learn={learn}
          onChange={(next) => patch({ capabilities: next })}
          onLearnStart={onLearnStart}
          onLearnCancel={onLearnCancel}
        />
      )}
      {selected.type === "display" && (
        <Num
          id="cap-segments"
          label="Segments (characters)"
          value={selected.capabilities.segments}
          max={127}
          onChange={(segments) => patch({ capabilities: { segments } })}
        />
      )}

      {issues.length > 0 && (
        <ul className="inspector-errors">
          {issues.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="inspector-actions">
        <button className="subtle danger" onClick={onDelete}>
          Delete control{usage.length > 0 ? ` — used by ${usage.length} mapping${usage.length > 1 ? "s" : ""}` : ""}
        </button>
      </div>
    </div>
  );
}

/** Encoder ranges may be partially filled in a draft — save enforces completeness. */
interface EncoderCapabilitiesDraft {
  encoding?: { increment?: { from?: number; to?: number }; decrement?: { from?: number; to?: number } };
  ledRing?: { controller?: number; from?: number; to?: number };
  /** Composite push-encoder (PAM-1 AC-7); midi may be incomplete in a draft. */
  push?: { midi?: { kind?: "cc" | "note"; channel?: number; number?: number }; led?: string };
}

function EncoderCapabilities({
  capabilities,
  learn,
  onChange,
  onLearnStart,
  onLearnCancel,
}: {
  capabilities: EncoderCapabilitiesDraft;
  learn: { listening: boolean; port: string };
  onChange: (next: EncoderCapabilitiesDraft) => void;
  onLearnStart: (port: string, target: "midi" | "push") => void;
  onLearnCancel: () => void;
}) {
  const range = (side: "increment" | "decrement", edge: "from" | "to", value: number | undefined) =>
    onChange({
      ...capabilities,
      encoding: { ...capabilities.encoding, [side]: { ...capabilities.encoding?.[side], [edge]: value } },
    });
  const ring = (patch: Partial<NonNullable<EncoderCapabilitiesDraft["ledRing"]>>) =>
    onChange({ ...capabilities, ledRing: { ...capabilities.ledRing, ...patch } });

  return (
    <>
      <p className="inspector-meta">Raw CC values per detent (hardware fact):</p>
      <div className="form-row">
        <Num id="enc-inc-from" label="Increment from" value={capabilities.encoding?.increment?.from} max={127} onChange={(v) => range("increment", "from", v)} />
        <Num id="enc-inc-to" label="to" value={capabilities.encoding?.increment?.to} max={127} onChange={(v) => range("increment", "to", v)} />
        <Num id="enc-dec-from" label="Decrement from" value={capabilities.encoding?.decrement?.from} max={127} onChange={(v) => range("decrement", "from", v)} />
        <Num id="enc-dec-to" label="to" value={capabilities.encoding?.decrement?.to} max={127} onChange={(v) => range("decrement", "to", v)} />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={capabilities.ledRing !== undefined}
          onChange={(e) =>
            onChange({ ...capabilities, ledRing: e.target.checked ? { controller: 0, from: 0, to: 127 } : undefined })
          }
        />
        LED ring feedback
      </label>
      {capabilities.ledRing && (
        <div className="form-row">
          <Num id="ring-cc" label="Ring CC number" value={capabilities.ledRing.controller} max={127} onChange={(controller) => ring({ controller })} />
          <Num id="ring-from" label="From" value={capabilities.ledRing.from} max={127} onChange={(from) => ring({ from })} />
          <Num id="ring-to" label="To" value={capabilities.ledRing.to} max={127} onChange={(to) => ring({ to })} />
        </div>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={capabilities.push !== undefined}
          onChange={(e) =>
            onChange({
              ...capabilities,
              push: e.target.checked ? { midi: { kind: "note" }, led: "none" } : undefined,
            })
          }
        />
        Integrated push button (press the knob)
      </label>
      {capabilities.push && (
        <>
          <div className="form-row">
            <div className="field">
              <label htmlFor="push-kind">Push kind</label>
              <select
                id="push-kind"
                value={capabilities.push.midi?.kind ?? "note"}
                onChange={(e) =>
                  push({ midi: { ...capabilities.push?.midi, kind: e.target.value as "cc" | "note" } })
                }
              >
                <option value="note">note</option>
                <option value="cc">cc</option>
              </select>
            </div>
            <Num
              id="push-number"
              label="Number (0–127)"
              value={capabilities.push.midi?.number}
              max={127}
              onChange={(number) => push({ midi: { kind: "note", ...capabilities.push?.midi, number } })}
            />
            <Num
              id="push-channel"
              label="Channel (empty = default)"
              value={capabilities.push.midi?.channel}
              max={16}
              onChange={(channel) => push({ midi: { kind: "note", ...capabilities.push?.midi, channel } })}
            />
            <div className="field">
              <label htmlFor="push-led">Push LED</label>
              <select
                id="push-led"
                value={capabilities.push.led ?? "none"}
                onChange={(e) => push({ led: e.target.value })}
              >
                <option value="none">none</option>
                <option value="on-off">on-off</option>
                <option value="velocity-colors">velocity-colors</option>
              </select>
            </div>
            <LearnButton
              learn={learn}
              target="push"
              title="Press the encoder knob to capture the push address"
              onLearnStart={onLearnStart}
              onLearnCancel={onLearnCancel}
            />
          </div>
        </>
      )}
    </>
  );

  function push(patch: Partial<NonNullable<EncoderCapabilitiesDraft["push"]>>): void {
    onChange({ ...capabilities, push: { ...capabilities.push, ...patch } });
  }
}
