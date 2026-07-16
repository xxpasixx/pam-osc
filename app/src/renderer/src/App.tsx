import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus, DeviceStatus } from "../../core/engine/types.js";
import type { SettingsDraft } from "../../core/settings/schema.js";
import { validateDraft } from "../../core/settings/validate.js";
import type { EngineState, FieldError, MidiPortList, Notice, Snapshot } from "../../shared/ipc.js";
import { AddDeviceDialog } from "./components/AddDeviceDialog.js";
import { ConsoleSection } from "./components/ConsoleSection.js";
import { DevicesSection } from "./components/DevicesSection.js";
import { NoticesArea } from "./components/NoticesArea.js";
import { StatusBar } from "./components/StatusBar.js";

/**
 * The single settings page (design → Component Structure). Draft edits live
 * here until Save; validation runs live with the same pure rules the main
 * process enforces on apply (AC-6).
 */

const cloneDraft = (draft: SettingsDraft): SettingsDraft => JSON.parse(JSON.stringify(draft)) as SettingsDraft;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>();
  const [draft, setDraft] = useState<SettingsDraft | undefined>();
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [engineState, setEngineState] = useState<EngineState>("stopped");
  const [connection, setConnection] = useState<ConnectionStatus | undefined>();
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [midiPorts, setMidiPorts] = useState<MidiPortList>({ inputs: [], outputs: [] });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const appliedRef = useRef<SettingsDraft | undefined>(undefined);

  const adoptSnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
    appliedRef.current = next.settings;
    setDraft(cloneDraft(next.settings));
    setEngineState(next.engineState);
    setConnection(next.connection);
    setDevices(next.devices);
    setMidiPorts(next.midiPorts);
    setNotices(next.notices);
  }, []);

  useEffect(() => {
    window.pamOsc
      .getSnapshot()
      .then(adoptSnapshot)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
    const unsubscribe = [
      window.pamOsc.onConnection(setConnection),
      window.pamOsc.onDevices(setDevices),
      window.pamOsc.onEngineState(setEngineState),
      window.pamOsc.onMidiPorts(setMidiPorts),
      window.pamOsc.onNotice((notice) => setNotices((current) => [...current, notice])),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, [adoptSnapshot]);

  const validCatalogIds = useMemo(
    () => new Set((snapshot?.catalog ?? []).map((entry) => entry.id)),
    [snapshot],
  );

  const liveErrors: FieldError[] = useMemo(
    () => (draft ? validateDraft(draft, validCatalogIds) : []),
    [draft, validCatalogIds],
  );

  const fieldErrors = useMemo(() => {
    // Live validation wins; server errors from the last apply fill the rest.
    const seen = new Set(liveErrors.map((error) => error.field));
    return [...liveErrors, ...serverErrors.filter((error) => !seen.has(error.field))];
  }, [liveErrors, serverErrors]);

  const dirty = useMemo(
    () => draft !== undefined && JSON.stringify(draft) !== JSON.stringify(appliedRef.current),
    [draft],
  );

  const updateDraft = useCallback((mutate: (current: SettingsDraft) => SettingsDraft) => {
    setServerErrors([]);
    setDraft((current) => (current ? mutate(current) : current));
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const result = await window.pamOsc.applySettings(draft);
      if (result.ok) {
        adoptSnapshot(result.snapshot);
        setServerErrors([]);
        setNotices((current) => [...current, ...result.notices]);
      } else {
        setServerErrors(result.fieldErrors);
        setNotices((current) => [...current, ...result.notices]);
      }
    } finally {
      setSaving(false);
    }
  }, [draft, adoptSnapshot]);

  const discard = useCallback(() => {
    if (appliedRef.current) setDraft(cloneDraft(appliedRef.current));
    setServerErrors([]);
  }, []);

  if (loadError) {
    return <div className="app-body">Failed to load: {loadError}</div>;
  }
  if (!snapshot || !draft) {
    return <div className="app-body">Loading …</div>;
  }

  return (
    <div className="app">
      <StatusBar engineState={engineState} connection={connection} />
      <main className="app-body">
        <NoticesArea notices={notices} onDismiss={(index) => setNotices((current) => current.filter((_, i) => i !== index))} />
        <ConsoleSection console={draft.console} errors={fieldErrors} onChange={(console) => updateDraft((current) => ({ ...current, console }))} />
        <DevicesSection
          active={draft.activeMappings}
          catalog={snapshot.catalog}
          devices={devices}
          midiPorts={midiPorts}
          errors={fieldErrors}
          onAdd={() => setDialogOpen(true)}
          onChange={(activeMappings) => updateDraft((current) => ({ ...current, activeMappings }))}
          onDuplicate={async (id) => {
            const result = await window.pamOsc.duplicateMapping(id);
            if ("error" in result) {
              setNotices((current) => [...current, { severity: "error", message: result.error }]);
              return;
            }
            const fresh = await window.pamOsc.getSnapshot();
            setSnapshot((current) => (current ? { ...current, catalog: fresh.catalog, invalidFiles: fresh.invalidFiles } : current));
            updateDraft((current) => ({
              ...current,
              activeMappings: [
                ...current.activeMappings,
                { id: result.id, input: result.midiPort.input, output: result.midiPort.output },
              ],
            }));
          }}
        />
      </main>
      <footer className="footer">
        <button className="subtle" onClick={() => void window.pamOsc.revealMappingsFolder()}>
          Open mappings folder
        </button>
        <div className="grow" />
        <button onClick={discard} disabled={!dirty || saving}>
          Discard
        </button>
        <button className="primary" onClick={() => void save()} disabled={!dirty || saving || fieldErrors.length > 0}>
          {saving ? "Applying …" : "Save & apply"}
        </button>
      </footer>
      <AddDeviceDialog
        open={dialogOpen}
        catalog={snapshot.catalog}
        invalidFiles={snapshot.invalidFiles}
        alreadyActive={new Set(draft.activeMappings.map((mapping) => mapping.id))}
        onClose={() => setDialogOpen(false)}
        onPick={(entry) => {
          setDialogOpen(false);
          updateDraft((current) => ({
            ...current,
            activeMappings: [
              ...current.activeMappings,
              { id: entry.id, input: entry.midiPort.input, output: entry.midiPort.output },
            ],
          }));
        }}
      />
    </div>
  );
}
