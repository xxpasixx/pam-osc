import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionStatus, DeviceStatus } from "../../core/engine/types.js";
import type { SettingsDraft } from "../../core/settings/schema.js";
import { validateDraft } from "../../core/settings/validate.js";
import type {
  EngineState,
  FieldError,
  MidiPortList,
  Notice,
  PortDiagnosis,
  Snapshot,
  TrafficEntry,
} from "../../shared/ipc.js";
import { AddDeviceDialog } from "./components/AddDeviceDialog.js";
import { ConsoleSection } from "./components/ConsoleSection.js";
import { DevicesSection } from "./components/DevicesSection.js";
import { BoardsView } from "./components/editor/BoardsView.js";
import { EditorView, type EditorTarget } from "./components/editor/EditorView.js";
import { ImportV1Dialog, type ImportFlow } from "./components/ImportV1Dialog.js";
import { NoticesArea } from "./components/NoticesArea.js";
import { StatusBar } from "./components/StatusBar.js";
import { StatusView } from "./components/StatusView.js";
import { TrafficLog } from "./components/TrafficLog.js";

/** Renderer-side cap for the traffic log (EC-2) — main sends batches. */
const TRAFFIC_LIMIT = 1000;

/** Notices fade on their own (PAM-4 delta) — everything stays in the session log. */
const NOTICE_DISMISS_MS = 15_000;

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
  const [tab, setTab] = useState<"setup" | "status" | "boards">("setup");
  const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
  const [portDiagnosis, setPortDiagnosis] = useState<PortDiagnosis | undefined>();
  const [engineBusy, setEngineBusy] = useState(false);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [importFlow, setImportFlow] = useState<ImportFlow | undefined>();
  const [importBusy, setImportBusy] = useState(false);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | undefined>();
  const appliedRef = useRef<SettingsDraft | undefined>(undefined);

  // Notices deliberately stay out: adopting a post-save snapshot would
  // resurrect notices the user already dismissed. They arrive once at mount
  // and live as events afterwards.
  const adoptSnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
    appliedRef.current = next.settings;
    setDraft(cloneDraft(next.settings));
    setEngineState(next.engineState);
    setConnection(next.connection);
    setDevices(next.devices);
    setMidiPorts(next.midiPorts);
    setTraffic(next.traffic);
    setPortDiagnosis(next.portDiagnosis);
  }, []);

  useEffect(() => {
    window.pamOsc
      .getSnapshot()
      .then((initial) => {
        adoptSnapshot(initial);
        setNotices(initial.notices);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
    const unsubscribe = [
      window.pamOsc.onConnection(setConnection),
      window.pamOsc.onDevices(setDevices),
      window.pamOsc.onEngineState(setEngineState),
      window.pamOsc.onMidiPorts(setMidiPorts),
      window.pamOsc.onNotice((notice) => setNotices((current) => [...current, notice])),
      window.pamOsc.onTraffic((batch) => setTraffic((current) => [...current, ...batch].slice(-TRAFFIC_LIMIT))),
      window.pamOsc.onPortDiagnosis(setPortDiagnosis),
    ];
    return () => unsubscribe.forEach((off) => off());
  }, [adoptSnapshot]);

  const validCatalogIds = useMemo(() => new Set((snapshot?.catalog ?? []).map((entry) => entry.id)), [snapshot]);

  const liveErrors: FieldError[] = useMemo(
    () => (draft ? validateDraft(draft, validCatalogIds) : []),
    [draft, validCatalogIds]
  );

  const fieldErrors = useMemo(() => {
    // Live validation wins; server errors from the last apply fill the rest.
    const seen = new Set(liveErrors.map((error) => error.field));
    return [...liveErrors, ...serverErrors.filter((error) => !seen.has(error.field))];
  }, [liveErrors, serverErrors]);

  const dirty = useMemo(
    () => draft !== undefined && JSON.stringify(draft) !== JSON.stringify(appliedRef.current),
    [draft]
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
    } catch (error) {
      setNotices((current) => [
        ...current,
        { severity: "error", message: `saving failed: ${error instanceof Error ? error.message : String(error)}` },
      ]);
    } finally {
      setSaving(false);
    }
  }, [draft, adoptSnapshot]);

  const discard = useCallback(() => {
    if (appliedRef.current) setDraft(cloneDraft(appliedRef.current));
    setServerErrors([]);
  }, []);

  const pushError = useCallback((message: string) => {
    setNotices((current) => [...current, { severity: "error", message }]);
  }, []);

  // Every notice dismisses itself after 15 s (per-notice timer, keyed by
  // object identity — each notice object enters the list exactly once).
  const autoDismissScheduled = useRef(new WeakSet<Notice>());
  useEffect(() => {
    for (const notice of notices) {
      if (autoDismissScheduled.current.has(notice)) continue;
      autoDismissScheduled.current.add(notice);
      setTimeout(() => {
        setNotices((current) => current.filter((candidate) => candidate !== notice));
      }, NOTICE_DISMISS_MS);
    }
  }, [notices]);

  const startEngine = useCallback(async () => {
    setEngineBusy(true);
    try {
      const result = await window.pamOsc.startEngine();
      if (!result.ok) pushError(`engine did not start: ${result.error ?? "unknown error"}`);
    } catch (error) {
      pushError(`engine did not start: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setEngineBusy(false);
    }
  }, [pushError]);

  const stopEngine = useCallback(async () => {
    setEngineBusy(true);
    try {
      await window.pamOsc.stopEngine();
    } catch (error) {
      pushError(`engine did not stop: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setEngineBusy(false);
    }
  }, [pushError]);

  // ---- v1 mapping import (PAM-5): pick → configure → import → summary ----
  const startImportV1 = useCallback(async () => {
    try {
      const picked = await window.pamOsc.pickV1MappingFile();
      if (picked.status === "canceled") return;
      if (picked.status === "error") {
        setImportFlow({ phase: "error", error: picked.error });
        return;
      }
      setImportFlow({ phase: "configure", file: picked });
    } catch (error) {
      setImportFlow({ phase: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const runImportV1 = useCallback(
    async (deviceDefinitionId: string, name: string) => {
      if (importFlow?.phase !== "configure") return;
      setImportBusy(true);
      try {
        const result = await window.pamOsc.importV1Mapping({
          filePath: importFlow.file.filePath,
          deviceDefinitionId,
          name,
        });
        if (!result.ok) {
          setImportFlow({ phase: "error", error: result.error });
          return;
        }
        // The catalog gained a mapping — refresh the lists (same pattern as
        // Duplicate); settings stay untouched, activation is the user's step.
        const fresh = await window.pamOsc.getSnapshot();
        setSnapshot((current) =>
          current
            ? { ...current, catalog: fresh.catalog, invalidFiles: fresh.invalidFiles, boards: fresh.boards }
            : current
        );
        setImportFlow({ phase: "result", entryName: result.entry.name, summary: result.summary });
      } catch (error) {
        setImportFlow({ phase: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        setImportBusy(false);
      }
    },
    [importFlow]
  );

  const runOutputTest = useCallback(
    async (mappingId: string) => {
      setTesting((current) => new Set(current).add(mappingId));
      // The engine reports rejections; the animation itself takes ~3.5 s.
      setTimeout(() => {
        setTesting((current) => {
          const next = new Set(current);
          next.delete(mappingId);
          return next;
        });
      }, 4000);
      const result = await window.pamOsc.runOutputTest(mappingId);
      if (!result.ok) pushError(`output test failed: ${result.error ?? "unknown error"}`);
    },
    [pushError]
  );

  // Post-save refresh from the editor: catalog/boards only — never the
  // settings draft (same reasoning as the import flow).
  const adoptEditorSnapshot = useCallback((fresh: Snapshot) => {
    setSnapshot((current) =>
      current ? { ...current, catalog: fresh.catalog, invalidFiles: fresh.invalidFiles, boards: fresh.boards } : current
    );
  }, []);

  // Menu-driven imports (PAM-7 AC-14) change the catalog in the main process
  // — it pushes a fresh snapshot; notices arrive via the normal event.
  useEffect(() => window.pamOsc.onCatalogChanged(adoptEditorSnapshot), [adoptEditorSnapshot]);

  // "New mapping" for a board (PAM-11 AC-2/AC-7): create empty → refresh the
  // catalog → open the mapping editor. Activation stays a Setup decision.
  const createMappingAndEdit = useCallback(
    async (deviceDefinitionId: string, name: string) => {
      try {
        const result = await window.pamOsc.createMapping({ deviceDefinitionId, name });
        if ("error" in result) {
          // BUG-3 (review): the dialog only closes on success — a failure
          // keeps it open with the typed name.
          pushError(result.error);
          return;
        }
        setDialogOpen(false);
        const fresh = await window.pamOsc.getSnapshot();
        adoptEditorSnapshot(fresh);
        setEditorTarget({ kind: "mapping", id: result.id });
      } catch (error) {
        pushError(`creating the mapping failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [pushError, adoptEditorSnapshot]
  );

  // ---- PAM-7 sharing: export/import single files + support package ----
  const exportShare = useCallback(
    async (kind: "mapping" | "device", id: string) => {
      const result = kind === "mapping" ? await window.pamOsc.exportMapping(id) : await window.pamOsc.exportDevice(id);
      if (result.status === "error") pushError(result.error);
      else if (result.status === "saved") {
        setNotices((current) => [...current, { severity: "info", message: `exported to ${result.file}` }]);
      }
    },
    [pushError]
  );

  const importShare = useCallback(
    async (kind: "mapping" | "device") => {
      const result =
        kind === "mapping" ? await window.pamOsc.importMappingFile() : await window.pamOsc.importDeviceFile();
      if ("canceled" in result) return;
      if (!result.ok) {
        pushError(result.error);
        return;
      }
      const fresh = await window.pamOsc.getSnapshot();
      adoptEditorSnapshot(fresh);
      const summary: Notice[] = [
        {
          severity: "info",
          message: `imported ${result.kind === "mapping" ? "mapping" : "board"} "${result.name}" as ${result.id}${
            result.renamed ? " (id was taken — renamed)" : ""
          }`,
        },
      ];
      // AC-7: free-text console commands run verbatim — surface the caution.
      if (result.caution) summary.push({ severity: "warning", message: result.caution });
      setNotices((current) => [...current, ...summary]);
    },
    [pushError, adoptEditorSnapshot]
  );

  const exportSupportPackage = useCallback(async () => {
    const result = await window.pamOsc.exportSupportPackage();
    if (result.status === "error") pushError(result.error);
    else if (result.status === "saved") {
      setNotices((current) => [...current, { severity: "info", message: `support package saved to ${result.file}` }]);
    }
  }, [pushError]);

  if (loadError) {
    return <div className="app-body">Failed to load: {loadError}</div>;
  }
  if (!snapshot || !draft) {
    return <div className="app-body">Loading …</div>;
  }

  if (editorTarget) {
    return (
      <div className="app">
        <StatusBar engineState={engineState} connection={connection} />
        <EditorView
          target={editorTarget}
          midiPorts={midiPorts}
          onClose={() => setEditorTarget(undefined)}
          onSaved={adoptEditorSnapshot}
          pushNotices={(fresh) => setNotices((current) => [...current, ...fresh])}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <StatusBar engineState={engineState} connection={connection} />
      <nav className="tabs" aria-label="Views">
        <button className={`tab ${tab === "setup" ? "active" : ""}`} onClick={() => setTab("setup")}>
          Setup
        </button>
        <button className={`tab ${tab === "status" ? "active" : ""}`} onClick={() => setTab("status")}>
          Status
        </button>
        <button className={`tab ${tab === "boards" ? "active" : ""}`} onClick={() => setTab("boards")}>
          Boards
        </button>
      </nav>
      <main className="app-body">
        <NoticesArea
          notices={notices}
          onDismiss={(index) => setNotices((current) => current.filter((_, i) => i !== index))}
        />
        {tab === "status" && (
          <>
            <StatusView
              engineState={engineState}
              connection={connection}
              devices={devices}
              catalog={snapshot.catalog}
              portDiagnosis={portDiagnosis}
              busy={engineBusy}
              testing={testing}
              onStart={() => void startEngine()}
              onStop={() => void stopEngine()}
              onCheck={() => void window.pamOsc.checkConnection()}
              onTest={(mappingId) => void runOutputTest(mappingId)}
              onExportSupportPackage={() => void exportSupportPackage()}
            />
            <TrafficLog entries={traffic} />
          </>
        )}
        {tab === "setup" && (
          <>
            <ConsoleSection
              console={draft.console}
              errors={fieldErrors}
              onChange={(console) => updateDraft((current) => ({ ...current, console }))}
            />
            <DevicesSection
              active={draft.activeMappings}
              catalog={snapshot.catalog}
              devices={devices}
              midiPorts={midiPorts}
              errors={fieldErrors}
              onAdd={() => setDialogOpen(true)}
              onImportV1={() => void startImportV1()}
              onEdit={(id) => setEditorTarget({ kind: "mapping", id })}
              onChange={(activeMappings) => updateDraft((current) => ({ ...current, activeMappings }))}
              onDuplicate={async (id) => {
                const result = await window.pamOsc.duplicateMapping(id);
                if ("error" in result) {
                  setNotices((current) => [...current, { severity: "error", message: result.error }]);
                  return;
                }
                const fresh = await window.pamOsc.getSnapshot();
                setSnapshot((current) =>
                  current ? { ...current, catalog: fresh.catalog, invalidFiles: fresh.invalidFiles } : current
                );
                updateDraft((current) => ({
                  ...current,
                  activeMappings: [
                    ...current.activeMappings,
                    { id: result.id, input: result.midiPort.input, output: result.midiPort.output },
                  ],
                }));
              }}
            />
          </>
        )}
        {tab === "boards" && (
          <BoardsView
            boards={snapshot.boards}
            catalog={snapshot.catalog}
            invalidFiles={snapshot.invalidFiles}
            onEdit={(id) => setEditorTarget({ kind: "device", id })}
            onCreate={(name, width, height) => setEditorTarget({ kind: "new-device", name, width, height })}
            onEditMapping={(id) => setEditorTarget({ kind: "mapping", id })}
            onCreateMapping={(deviceDefinitionId, name) => void createMappingAndEdit(deviceDefinitionId, name)}
            onExportBoard={(id) => void exportShare("device", id)}
            onExportMapping={(id) => void exportShare("mapping", id)}
            onImportBoard={() => void importShare("device")}
            onImportMapping={() => void importShare("mapping")}
          />
        )}
      </main>
      {tab === "setup" && (
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
      )}
      <ImportV1Dialog
        flow={importFlow}
        boards={snapshot.boards}
        busy={importBusy}
        onImport={(deviceDefinitionId, name) => void runImportV1(deviceDefinitionId, name)}
        onClose={() => setImportFlow(undefined)}
      />
      <AddDeviceDialog
        open={dialogOpen}
        boards={snapshot.boards}
        catalog={snapshot.catalog}
        invalidFiles={snapshot.invalidFiles}
        alreadyActive={new Set(draft.activeMappings.map((mapping) => mapping.id))}
        onClose={() => setDialogOpen(false)}
        onCreateNew={(deviceDefinitionId, name) => void createMappingAndEdit(deviceDefinitionId, name)}
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
