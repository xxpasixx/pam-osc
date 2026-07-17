import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Runtime imports come from the browser-safe modules directly — the format
// barrel re-exports the Node loader, which must never enter the renderer.
import { validateDeviceDraft, validateMappingDraft } from "../../../../core/format/editor-rules.js";
import type {
  Assignment,
  Control,
  DeviceDefinition,
  EditorIssue,
  Mapping,
} from "../../../../core/format/index.js";
import type {
  ControlUsageEntry,
  EditorSaveResult,
  MidiPortList,
  Notice,
  Snapshot,
  UsageRef,
} from "../../../../shared/ipc.js";
import { BoardCanvas } from "./BoardCanvas.js";
import { BoardInspector } from "./BoardInspector.js";
import { MappingInspector } from "./MappingInspector.js";

/**
 * The editor view (design → Editor view): full-window work surface on top of
 * the tabs. Loads the full file content, keeps a draft until Save (PAM-3
 * pattern), validates live with the same rules the main process enforces.
 */

export type EditorTarget =
  | { kind: "mapping"; id: string }
  | { kind: "device"; id: string }
  | { kind: "new-device"; name: string; width: number; height: number };

interface LoadedMapping {
  mode: "mapping";
  mapping: Mapping;
  device: DeviceDefinition;
  origin: "bundled" | "user";
}

interface LoadedDevice {
  mode: "board";
  device: DeviceDefinition;
  origin: "bundled" | "user";
  usage: ControlUsageEntry[];
  /** New board from scratch (AC-6) — saved with createNew. */
  isNew: boolean;
}

type Loaded = LoadedMapping | LoadedDevice;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const kebab = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "board";

function actionSummary(assignment: Assignment): string {
  const action = assignment.action;
  switch (action.type) {
    case "executor":
      return `Exec ${action.number}`;
    case "command":
      return `Cmd ${action.command.slice(0, 14)}`;
    case "quickKey":
      return `QK ${action.key}`;
    case "attribute":
      return `Attr ${action.attribute}`;
    case "modifier":
      return action.modifier === "attributeSelect" ? `Sel ${action.attribute ?? ""}` : action.modifier;
    case "timecodeSelect":
      return `TC slot ${action.slot ?? "cycle"}`;
    case "timecodePlayPause":
      return "TC play/pause";
    case "display":
      return `Disp ${action.number}`;
  }
}

/** First free 1×1 spot scanning rows from the top-left (design → New control defaults). */
function freeSpot(device: DeviceDefinition): { x: number; y: number } {
  for (let y = 0; y + 1 <= device.layout.height; y += 1) {
    for (let x = 0; x + 1 <= device.layout.width; x += 1) {
      const overlaps = device.controls.some(
        (control) =>
          x < control.position.x + control.position.width &&
          x + 1 > control.position.x &&
          y < control.position.y + control.position.height &&
          y + 1 > control.position.y
      );
      if (!overlaps) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

function newControl(device: DeviceDefinition, type: Control["type"]): Control {
  let counter = 1;
  const ids = new Set(device.controls.map((control) => control.id));
  while (ids.has(`${type}-${counter}`)) counter += 1;
  const position = { ...freeSpot(device), width: 1, height: 1, shape: "rect" as const };
  const base = { id: `${type}-${counter}`, position };
  // Address fields start empty (invalid until Learn or manual entry — AC-7).
  switch (type) {
    case "fader":
      return { ...base, type, midi: { kind: "cc" }, capabilities: { motorized: false } } as unknown as Control;
    case "button":
      return { ...base, type, midi: { kind: "note" }, capabilities: { led: "none" } } as unknown as Control;
    case "encoder":
      return { ...base, type, midi: { kind: "cc" }, capabilities: { encoding: {} } } as unknown as Control;
    case "display": {
      const used = new Set(
        device.controls.flatMap((control) => (control.type === "display" ? [control.index] : []))
      );
      let index = 0;
      while (used.has(index) && index < 7) index += 1;
      return { ...base, type, index, capabilities: { segments: 7 } } as unknown as Control;
    }
  }
}

export function EditorView({
  target,
  midiPorts,
  onClose,
  onSaved,
  pushNotices,
}: {
  target: EditorTarget;
  midiPorts: MidiPortList;
  onClose: () => void;
  /** Post-save snapshot — App refreshes catalog/boards without clobbering its draft. */
  onSaved: (snapshot: Snapshot) => void;
  pushNotices: (notices: Notice[]) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [draft, setDraft] = useState<Mapping | DeviceDefinition | undefined>();
  const baselineRef = useRef<string>("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [closePrompt, setClosePrompt] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<{ control: Control; usage: UsageRef[] } | undefined>();
  const [retargetPrompt, setRetargetPrompt] = useState<{ usage: UsageRef[]; chosen: Set<string> } | undefined>();
  const [learn, setLearn] = useState<{ listening: boolean; port: string }>({ listening: false, port: "" });

  const adopt = useCallback((next: Loaded) => {
    setLoaded(next);
    const content = next.mode === "mapping" ? next.mapping : next.device;
    baselineRef.current = JSON.stringify(content);
    setDraft(clone(content));
  }, []);

  // Load the full file content for the target (design → Opening the editor).
  useEffect(() => {
    let stale = false;
    const load = async () => {
      if (target.kind === "mapping") {
        const data = await window.pamOsc.getMappingForEdit(target.id);
        if (stale) return;
        if ("error" in data) setLoadError(data.error);
        else adopt({ mode: "mapping", ...data });
      } else if (target.kind === "device") {
        const data = await window.pamOsc.getDeviceDefinitionForEdit(target.id);
        if (stale) return;
        if ("error" in data) setLoadError(data.error);
        else adopt({ mode: "board", ...data, isNew: false });
      } else {
        const device: DeviceDefinition = {
          formatVersion: 1,
          id: kebab(target.name),
          name: target.name,
          mode: "standard",
          defaultMidiChannel: 1,
          layout: { width: target.width, height: target.height },
          controls: [],
        };
        adopt({ mode: "board", device, origin: "user", usage: [], isNew: true });
      }
    };
    load().catch((error: unknown) => {
      if (!stale) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      stale = true;
    };
  }, [target, adopt]);

  // Learn results (AC-4): captured addresses land in the selected control.
  useEffect(() => {
    return window.pamOsc.onMidiLearn((event) => {
      if (event.status === "captured") {
        setLearn((current) => ({ ...current, listening: false }));
        setDraft((current) => {
          if (!current || !("controls" in current) || !selectedId) return current;
          const controls = current.controls.map((control) =>
            control.id === selectedId && control.type !== "display"
              ? ({ ...control, midi: event.address } as Control)
              : control
          );
          return { ...current, controls };
        });
      } else {
        setLearn((current) => ({ ...current, listening: false }));
        if (event.reason === "port-lost") {
          pushNotices([{ severity: "warning", message: "MIDI learn ended — the port disappeared" }]);
        }
      }
    });
  }, [selectedId, pushNotices]);

  // Leaving the editor always ends a running learn session.
  useEffect(() => {
    return () => {
      void window.pamOsc.cancelMidiLearn();
    };
  }, []);

  const mode: "mapping" | "board" = loaded?.mode === "mapping" ? "mapping" : "board";
  const device: DeviceDefinition | undefined =
    loaded?.mode === "mapping" ? loaded.device : draft && "controls" in draft ? (draft as DeviceDefinition) : undefined;

  const dirty = draft !== undefined && JSON.stringify(draft) !== baselineRef.current;

  // Live validation — same pure rules the main process enforces on save.
  const validation = useMemo((): { issues: EditorIssue[]; invalidIds: Set<string> } => {
    if (!draft || !loaded) return { issues: [], invalidIds: new Set() };
    if (loaded.mode === "mapping") {
      const result = validateMappingDraft(draft, loaded.device);
      if (result.ok) return { issues: [], invalidIds: new Set() };
      const mapping = draft as Mapping;
      const invalidIds = new Set<string>();
      for (const issue of result.issues) {
        const match = /^assignments\[(\d+)\]/.exec(issue.path);
        const controlId = match ? mapping.assignments[Number(match[1])]?.controlId : undefined;
        if (controlId) invalidIds.add(controlId);
      }
      return { issues: result.issues, invalidIds };
    }
    const result = validateDeviceDraft(draft);
    if (result.ok) return { issues: [], invalidIds: new Set() };
    const board = draft as DeviceDefinition;
    const invalidIds = new Set<string>();
    for (const issue of result.issues) {
      const match = /^controls\[(\d+)\]/.exec(issue.path);
      const controlId = match ? board.controls[Number(match[1])]?.id : undefined;
      if (controlId) invalidIds.add(controlId);
    }
    return { issues: result.issues, invalidIds };
  }, [draft, loaded]);

  const issuesFor = useCallback(
    (controlId: string): EditorIssue[] => {
      if (!draft || !loaded) return [];
      if (loaded.mode === "mapping") {
        const mapping = draft as Mapping;
        return validation.issues.filter((issue) => {
          const match = /^assignments\[(\d+)\]/.exec(issue.path);
          return match !== null && mapping.assignments[Number(match[1])]?.controlId === controlId;
        });
      }
      const board = draft as DeviceDefinition;
      return validation.issues.filter((issue) => {
        const match = /^controls\[(\d+)\]/.exec(issue.path);
        return match !== null && board.controls[Number(match[1])]?.id === controlId;
      });
    },
    [draft, loaded, validation]
  );

  const boardIssues = useMemo(
    () =>
      validation.issues.filter(
        (issue) => !/^(controls|assignments)\[/.test(issue.path) || issuePathBroken(issue.path, draft)
      ),
    [validation, draft]
  );

  const summaries = useMemo(() => {
    if (loaded?.mode !== "mapping" || !draft) return undefined;
    const mapping = draft as Mapping;
    return new Map(mapping.assignments.map((assignment) => [assignment.controlId, actionSummary(assignment)]));
  }, [loaded, draft]);

  const selectedControl = device?.controls.find((control) => control.id === selectedId);
  const selectedAssignment =
    loaded?.mode === "mapping" && draft
      ? (draft as Mapping).assignments.find((assignment) => assignment.controlId === selectedId)
      : undefined;

  const empty = mode === "board" && device !== undefined && device.controls.length === 0;
  const canSave = dirty && !saving && validation.issues.length === 0 && !empty;

  // ---- draft updates ----

  const updateAssignment = useCallback(
    (next: Assignment | undefined) => {
      if (!selectedId) return;
      setDraft((current) => {
        if (!current || !("assignments" in current)) return current;
        const mapping = current as Mapping;
        const rest = mapping.assignments.filter((assignment) => assignment.controlId !== selectedId);
        return { ...mapping, assignments: next ? [...rest, next] : rest };
      });
    },
    [selectedId]
  );

  const updateControl = useCallback((next: Control) => {
    setDraft((current) => {
      if (!current || !("controls" in current)) return current;
      const board = current as DeviceDefinition;
      return { ...board, controls: board.controls.map((control) => (control.id === next.id ? next : control)) };
    });
  }, []);

  const updateBoard = useCallback((patch: Partial<DeviceDefinition>) => {
    setDraft((current) => (current && "controls" in current ? { ...(current as DeviceDefinition), ...patch } : current));
  }, []);

  const addControl = useCallback(
    (type: Control["type"]) => {
      if (!device) return;
      const control = newControl(device, type);
      setDraft((current) =>
        current && "controls" in current
          ? { ...(current as DeviceDefinition), controls: [...(current as DeviceDefinition).controls, control] }
          : current
      );
      setSelectedId(control.id);
    },
    [device]
  );

  const removeControl = useCallback((controlId: string) => {
    setDraft((current) => {
      if (!current || !("controls" in current)) return current;
      const board = current as DeviceDefinition;
      return { ...board, controls: board.controls.filter((control) => control.id !== controlId) };
    });
    setSelectedId(undefined);
  }, []);

  const requestDelete = useCallback(() => {
    if (!selectedControl || loaded?.mode !== "board") return;
    const usage = loaded.usage.find((entry) => entry.controlId === selectedControl.id)?.mappings ?? [];
    if (usage.length === 0) removeControl(selectedControl.id);
    else setDeletePrompt({ control: selectedControl, usage });
  }, [selectedControl, loaded, removeControl]);

  // ---- save & close (design → Save → validate → reload; EC-1) ----

  const finishSave = useCallback(
    async (result: EditorSaveResult) => {
      if (!result.ok) {
        pushNotices(
          result.errors.map((error) => ({
            severity: "error" as const,
            message: error.path ? `${error.path}: ${error.message}` : error.message,
          }))
        );
        return;
      }
      onSaved(result.snapshot);
      // Reload by the final id — copy-on-edit may have renamed the file (AC-5).
      if (mode === "mapping") {
        const data = await window.pamOsc.getMappingForEdit(result.id);
        if (!("error" in data)) adopt({ mode: "mapping", ...data });
      } else {
        const data = await window.pamOsc.getDeviceDefinitionForEdit(result.id);
        if (!("error" in data)) adopt({ mode: "board", ...data, isNew: false });
      }
    },
    [mode, onSaved, adopt, pushNotices]
  );

  const saveDevice = useCallback(
    async (retargetMappingIds: string[]) => {
      if (!draft || loaded?.mode !== "board") return;
      setSaving(true);
      try {
        const result = await window.pamOsc.saveDeviceDefinition({
          draft,
          retargetMappingIds,
          createNew: loaded.isNew,
        });
        await finishSave(result);
      } catch (error) {
        pushNotices([{ severity: "error", message: error instanceof Error ? error.message : String(error) }]);
      } finally {
        setSaving(false);
      }
    },
    [draft, loaded, finishSave, pushNotices]
  );

  const save = useCallback(async () => {
    if (!draft || !loaded) return false;
    if (loaded.mode === "mapping") {
      setSaving(true);
      try {
        const result = await window.pamOsc.saveMapping(draft);
        await finishSave(result);
        return result.ok;
      } catch (error) {
        pushNotices([{ severity: "error", message: error instanceof Error ? error.message : String(error) }]);
        return false;
      } finally {
        setSaving(false);
      }
    }
    // Bundled board → copy-on-edit: offer retargeting before the save (AC-5).
    if (loaded.origin === "bundled" && !loaded.isNew) {
      const usage = await window.pamOsc.getDefinitionUsage((draft as DeviceDefinition).id);
      if (usage.length > 0) {
        setRetargetPrompt({ usage, chosen: new Set() });
        return false; // the dialog continues the save
      }
    }
    await saveDevice([]);
    return true;
  }, [draft, loaded, finishSave, saveDevice, pushNotices]);

  const close = useCallback(() => {
    if (dirty) setClosePrompt(true);
    else onClose();
  }, [dirty, onClose]);

  // ---- render ----

  if (loadError) {
    return (
      <div className="editor">
        <header className="editor-header">
          <h2>Editor</h2>
          <div className="grow" />
          <button onClick={onClose}>Close</button>
        </header>
        <p className="empty-state">Could not open: {loadError}</p>
      </div>
    );
  }
  if (!loaded || !draft || !device) {
    return (
      <div className="editor">
        <p className="empty-state">Loading …</p>
      </div>
    );
  }

  const name = loaded.mode === "mapping" ? (draft as Mapping).name : (draft as DeviceDefinition).name;

  return (
    <div className="editor">
      <header className="editor-header">
        <span className={`badge ${mode}`}>{mode === "mapping" ? "Mapping" : "Board"}</span>
        {loaded.mode === "mapping" ? (
          <input
            className="editor-name"
            aria-label="Mapping name"
            value={name}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, name: event.target.value } : current))
            }
          />
        ) : (
          <span className="editor-name-static">{name}</span>
        )}
        {loaded.origin === "bundled" && !("isNew" in loaded && loaded.isNew) && (
          <span className="badge">bundled — saving creates a copy</span>
        )}
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        <div className="grow" />
        <button onClick={() => adopt(loaded)} disabled={!dirty || saving}>
          Discard
        </button>
        <button className="primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? "Saving …" : "Save"}
        </button>
        <button onClick={close}>Close</button>
      </header>

      {mode === "board" && (
        <div className="editor-toolbar">
          <span className="toolbar-label">Add control:</span>
          <button onClick={() => addControl("fader")}>+ Fader</button>
          <button onClick={() => addControl("button")}>+ Button</button>
          <button onClick={() => addControl("encoder")}>+ Encoder</button>
          <button onClick={() => addControl("display")}>+ Display</button>
          {empty && <span className="toolbar-hint">Add at least one control to save (AC-6).</span>}
        </div>
      )}

      {boardIssues.length > 0 && (
        <div className="editor-errors">
          {boardIssues.slice(0, 3).map((issue, index) => (
            <span key={index}>
              {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </span>
          ))}
        </div>
      )}

      <div className="editor-body">
        <BoardCanvas
          device={device}
          mode={mode}
          selectedId={selectedId}
          summaries={summaries}
          invalidIds={validation.invalidIds}
          onSelect={setSelectedId}
          onGeometry={
            mode === "board"
              ? (controlId, position) => {
                  const control = device.controls.find((candidate) => candidate.id === controlId);
                  if (control) updateControl({ ...control, position: { ...control.position, ...position } });
                }
              : undefined
          }
        />
        <aside className="editor-side">
          {mode === "mapping" && selectedControl && (
            <MappingInspector
              control={selectedControl}
              assignment={selectedAssignment}
              issues={issuesFor(selectedControl.id)}
              onChange={updateAssignment}
            />
          )}
          {mode === "mapping" && !selectedControl && (
            <div className="inspector">
              <h3>{name}</h3>
              <p className="inspector-meta">
                Board: {device.name} · click a control to edit its assignment (dimmed = unassigned).
              </p>
            </div>
          )}
          {mode === "board" && (
            <BoardInspector
              device={device}
              selected={selectedControl}
              usage={
                selectedControl
                  ? (loaded.mode === "board"
                      ? (loaded.usage.find((entry) => entry.controlId === selectedControl.id)?.mappings ?? [])
                      : [])
                  : []
              }
              issues={selectedControl ? issuesFor(selectedControl.id) : []}
              midiPorts={midiPorts}
              learn={{ listening: learn.listening, port: learn.port || (midiPorts.inputs[0] ?? "") }}
              onChangeControl={updateControl}
              onChangeBoard={updateBoard}
              onDelete={requestDelete}
              onLearnStart={(port) => {
                void window.pamOsc.startMidiLearn(port).then((result) => {
                  if (result.ok) setLearn({ listening: true, port });
                  else pushNotices([{ severity: "error", message: result.error ?? "MIDI learn failed" }]);
                });
              }}
              onLearnCancel={() => {
                void window.pamOsc.cancelMidiLearn();
                setLearn((current) => ({ ...current, listening: false }));
              }}
              onLearnPortChange={(port) => setLearn((current) => ({ ...current, port }))}
            />
          )}
        </aside>
      </div>

      {closePrompt && (
        <div className="modal-backdrop" role="dialog" aria-label="Unsaved changes">
          <div className="modal">
            <h3>Unsaved changes</h3>
            <p>Save your changes before closing?</p>
            <div className="dialog-actions">
              <button onClick={() => setClosePrompt(false)}>Cancel</button>
              <button
                onClick={() => {
                  setClosePrompt(false);
                  onClose();
                }}
              >
                Discard &amp; close
              </button>
              <button
                className="primary"
                disabled={!canSave}
                onClick={() => {
                  setClosePrompt(false);
                  void save().then((ok) => {
                    if (ok) onClose();
                  });
                }}
              >
                Save &amp; close
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePrompt && (
        <div className="modal-backdrop" role="dialog" aria-label="Delete control">
          <div className="modal">
            <h3>Delete “{deletePrompt.control.label ?? deletePrompt.control.id}”?</h3>
            <p>
              This control is assigned in {deletePrompt.usage.length} mapping
              {deletePrompt.usage.length > 1 ? "s" : ""}. Saving the board will remove those assignments from user
              mapping files; bundled mappings would show as invalid if retargeted later.
            </p>
            <ul className="import-warnings">
              {deletePrompt.usage.map((ref) => (
                <li key={ref.id}>
                  {ref.name} ({ref.origin}
                  {ref.active ? ", active" : ""})
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button onClick={() => setDeletePrompt(undefined)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  removeControl(deletePrompt.control.id);
                  setDeletePrompt(undefined);
                }}
              >
                Delete control
              </button>
            </div>
          </div>
        </div>
      )}

      {retargetPrompt && (
        <div className="modal-backdrop" role="dialog" aria-label="Retarget mappings">
          <div className="modal">
            <h3>Point mappings at the copy?</h3>
            <p>
              Saving creates a user copy of this bundled board. These mappings currently use the original — tick the
              ones that should switch to your copy:
            </p>
            <div className="picker-list">
              {retargetPrompt.usage.map((ref) => (
                <label key={ref.id} className={`check ${ref.origin === "bundled" ? "disabled" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={ref.origin === "bundled"}
                    checked={retargetPrompt.chosen.has(ref.id)}
                    onChange={(event) =>
                      setRetargetPrompt((current) => {
                        if (!current) return current;
                        const chosen = new Set(current.chosen);
                        if (event.target.checked) chosen.add(ref.id);
                        else chosen.delete(ref.id);
                        return { ...current, chosen };
                      })
                    }
                  />
                  {ref.name}
                  {ref.origin === "bundled" ? " (bundled — activate it first, then retarget)" : ref.active ? " (active)" : ""}
                </label>
              ))}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setRetargetPrompt(undefined)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  const chosen = [...retargetPrompt.chosen];
                  setRetargetPrompt(undefined);
                  void saveDevice(chosen);
                }}
              >
                Save copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Issues whose indexed path no longer resolves (e.g. after a delete) surface at board level. */
function issuePathBroken(path: string, draft: unknown): boolean {
  const match = /^(controls|assignments)\[(\d+)\]/.exec(path);
  if (!match || draft === null || typeof draft !== "object") return false;
  const list = (draft as Record<string, unknown>)[match[1]!];
  return !Array.isArray(list) || list[Number(match[2])] === undefined;
}
