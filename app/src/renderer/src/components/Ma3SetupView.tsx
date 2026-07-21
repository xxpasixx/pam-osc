import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConsoleReadable,
  Ma3Asset,
  Ma3Install,
  Ma3InstallResult,
  Ma3SetupInfo,
  Notice,
  RemovableDrive,
  UsbCopyResult,
  UsbExportInfo,
} from "../../../shared/ipc.js";
import { comparePluginVersions } from "../../../shared/plugin-version.js";

/**
 * PAM-9: the MA3 setup assistant — one-click install of the plugin and the
 * OSC config into detected local onPC installations (AC-1/2/3), the USB route
 * for real consoles (AC-4), and the step-by-step console guide with the
 * user's live values (AC-5). Values come from the current settings draft —
 * editing Setup updates the guide immediately.
 */

interface ConsoleValues {
  address: string;
  sendPort: number;
  receivePort: number;
}

/** One install action (plugin or OSC config) as a row with its own busy/result/replace state. */
function InstallRow({
  install,
  asset,
  label,
  present,
  presentDetail,
  bundledLabel,
  onDone,
}: {
  install: Ma3Install;
  asset: Ma3Asset;
  label: string;
  present: boolean;
  presentDetail: string;
  bundledLabel: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ version?: string } | undefined>();
  const [result, setResult] = useState<Ma3InstallResult | undefined>();

  const run = useCallback(
    async (overwrite: boolean) => {
      setBusy(true);
      setConfirmReplace(undefined);
      try {
        const outcome = await window.pamOsc.installMa3Asset(install.base, asset, overwrite);
        if (outcome.status === "exists") {
          setConfirmReplace({ version: outcome.installedVersion });
        } else {
          setResult(outcome);
          onDone();
        }
      } finally {
        setBusy(false);
      }
    },
    [install.base, asset, onDone]
  );

  return (
    <div className="device-row">
      <span
        className={`led ${present ? "ok" : "warn"}`}
        aria-hidden="true"
        title={present ? "installed" : "not installed"}
      />
      <div className="device-name">
        {label}
        <span className="board">{present ? presentDetail : "not installed yet"}</span>
        {result?.status === "installed" && <span className="board">✓ installed to {result.target}</span>}
        {result?.status === "error" && (
          <>
            <span className="board">failed: {result.error}</span>
            <span className="board">copy manually — from: {result.source}</span>
            <span className="board">to: {result.target}</span>
          </>
        )}
      </div>
      <div className="spacer" />
      {result?.status === "error" && (
        <button onClick={() => void window.pamOsc.revealBundledAsset(asset)}>Show file …</button>
      )}
      {confirmReplace ? (
        <>
          <span className="board">Replace {confirmReplace.version ?? "the installed file"} with {bundledLabel}?</span>
          <button className="primary" onClick={() => void run(true)}>
            Replace
          </button>
          <button onClick={() => setConfirmReplace(undefined)}>Keep</button>
        </>
      ) : (
        <button disabled={busy} onClick={() => void run(false)}>
          {busy ? "Installing …" : present ? "Reinstall" : "Install"}
        </button>
      )}
    </div>
  );
}

function InstallCard({ info, onRefresh }: { info: Ma3SetupInfo; onRefresh: () => void }) {
  return (
    <section className="card" aria-label="Install the console files">
      <h2>Step 1 — Install the console files</h2>
      <p className="inspector-meta">
        pam-osc ships plugin version <code>{info.bundledVersion ?? "unknown"}</code>
        {info.hasBundledOscConfig && <> and a ready-made OSC config</>}. GrandMA3 imports these from{" "}
        <code>gma3_library/datapools/plugins</code> and <code>gma3_library/inout/osc</code>.
      </p>

      {info.installs.length === 0 && (
        <>
          <p className="empty-state">
            No GrandMA3 onPC installation was found on this machine — use the USB route for a console:
          </p>
          <ol className="guide-steps">
            <li>
              Click “Show plugin file” below and copy <code>pam-osc.xml</code> onto a USB stick into{" "}
              <code>gma3_library/datapools/plugins/</code> (create it if needed).
            </li>
            <li>Plug the stick into the console — continue with step 2.</li>
          </ol>
        </>
      )}

      {info.installs.map((install) => (
        <div key={install.base} style={{ marginBottom: 8 }}>
          <p className="inspector-meta">{install.base}</p>
          <InstallRow
            install={install}
            asset="plugin"
            label="Plugin (pam-osc Start Stop / Settings)"
            present={install.hasPamOsc}
            presentDetail={`installed, version ${install.installedVersion ?? "unknown"}`}
            bundledLabel={`version ${info.bundledVersion ?? "the bundled one"}`}
            onDone={onRefresh}
          />
          {info.hasBundledOscConfig && (
            <InstallRow
              install={install}
              asset="osc"
              label="OSC config (creates the OSC entry)"
              present={install.hasOscConfig}
              presentDetail="OSC config present"
              bundledLabel="the bundled OSC config"
              onDone={onRefresh}
            />
          )}
        </div>
      ))}

      <div className="section-actions">
        <button onClick={() => void window.pamOsc.revealBundledAsset("plugin")}>Show plugin file …</button>
        {info.hasBundledOscConfig && (
          <button onClick={() => void window.pamOsc.revealBundledAsset("osc")}>Show OSC config …</button>
        )}
      </div>
    </section>
  );
}

function OscEntryCard({ values, localIps }: { values: ConsoleValues; localIps: string[] }) {
  const sameMachine = values.address === "127.0.0.1" || values.address === "localhost";
  const destinationIps = sameMachine ? ["127.0.0.1 (onPC on this machine)"] : localIps;
  return (
    <section className="card" aria-label="Set up the OSC entries">
      <h2>Step 2 — Set up OSC in GrandMA3</h2>
      <p className="inspector-meta">
        Open <strong>Menu → In &amp; Out → OSC</strong>. First pick the correct network card in the{" "}
        <strong>Interface</strong> list (the one on the console/pam-osc network). pam-osc needs <strong>two</strong>{" "}
        entries — one to receive commands, one to send feedback.
      </p>
      <h3 style={{ margin: "10px 0 2px" }}>Receive entry (name doesn’t matter)</h3>
      <ol className="guide-steps">
        <li>
          Port <code>{values.sendPort}</code> — where pam-osc sends its commands (the send port in Setup).
        </li>
        <li>
          Turn <strong>Receive</strong> and <strong>Receive Command</strong> on.
        </li>
      </ol>
      <h3 style={{ margin: "12px 0 2px" }}>Send entry (name must be exactly “pam-osc”)</h3>
      <ol className="guide-steps">
        <li>
          Name it exactly <code>pam-osc</code> — the plugin finds the feedback entry by this name.
        </li>
        <li>
          Destination IP:{" "}
          {destinationIps.length > 0 ? (
            destinationIps.map((ip, index) => (
              <span key={ip}>
                {index > 0 && " or "}
                <code>{ip}</code>
              </span>
            ))
          ) : (
            <em>no network address found — connect this machine to the console network first</em>
          )}{" "}
          (this computer, where pam-osc runs).
        </li>
        <li>
          Destination port <code>{values.receivePort}</code> — where pam-osc listens for feedback (the receive port in
          Setup).
        </li>
        <li>
          Turn only <strong>Send Command</strong> on.
        </li>
      </ol>
      <p className="inspector-meta">
        pam-osc currently talks to the console at <code>{values.address}</code> — change it under Setup and this guide
        updates with it. If you imported the OSC config in step 1, check both entries carry these values.
      </p>
    </section>
  );
}

function ImportPluginCard() {
  return (
    <section className="card" aria-label="Import and start the plugin">
      <h2>Step 3 — Import &amp; start the plugin</h2>
      <ol className="guide-steps">
        <li>
          Open a <strong>Plugins pool</strong> window on the console, edit an empty slot and choose <strong>Import</strong>.
        </li>
        <li>
          Pick <code>pam-osc</code> from the list (installed in step 1) and import both plugins.
        </li>
        <li>
          Run <strong>“pam-osc Start Stop”</strong> once per session — the “pam-osc Settings” plugin configures colors,
          names and more.
        </li>
        <li>Check the Status tab here: the connection check should report the plugin as running.</li>
      </ol>
    </section>
  );
}

/** Filesystem readability hint → LED class + short label (AC-9). */
function readableHint(readable: ConsoleReadable): { led: string; text: string } {
  switch (readable) {
    case "yes":
      return { led: "ok", text: "FAT32 — console-ready" };
    case "likely":
      return { led: "warn", text: "exFAT — usually works, verify on your desk" };
    case "no":
      return { led: "err", text: "not FAT32/exFAT — the console likely can't read this stick" };
    case "unknown":
      return { led: "", text: "filesystem unknown" };
  }
}

function driveLabel(drive: RemovableDrive): string {
  const gb = drive.capacityBytes ? ` · ${Math.round(drive.capacityBytes / 1e9)} GB` : "";
  // AC-1: show the volume name AND its mount path (skip the path when the label
  // already IS the path, e.g. a manually chosen folder).
  const path = drive.label === drive.id ? "" : ` · ${drive.id}`;
  return `${drive.label}${gb}${path}`;
}

/**
 * PAM-23: copy the plugin + OSC config onto a USB stick for a real console.
 * Lists removable drives (AC-1), falls back to a folder picker (AC-2), warns on
 * unreadable filesystems (AC-9), and flags an out-of-date stick (AC-8).
 */
function UsbExportCard({ pushNotice }: { pushNotice: (notice: Notice) => void }) {
  const [info, setInfo] = useState<UsbExportInfo | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string>("");
  const [chosenFolder, setChosenFolder] = useState<RemovableDrive | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ version?: string } | undefined>();
  const [result, setResult] = useState<UsbCopyResult | undefined>();
  const notifiedStale = useRef(new Set<string>());

  const refresh = useCallback(() => {
    setLoadError(undefined);
    setResult(undefined);
    window.pamOsc
      .listRemovableDrives()
      .then(setInfo)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // AC-8: a stick whose plugin is older than the bundle → notification-bar hint (once per drive+version).
  useEffect(() => {
    if (!info?.bundledVersion) return;
    for (const drive of info.drives) {
      if (drive.existingPluginVersion && comparePluginVersions(drive.existingPluginVersion, info.bundledVersion) < 0) {
        const key = `${drive.id}@${drive.existingPluginVersion}`;
        if (notifiedStale.current.has(key)) continue;
        notifiedStale.current.add(key);
        pushNotice({
          severity: "info",
          source: "USB stick",
          message: `Plugin update available on "${drive.label}" — bundle ${info.bundledVersion} is newer than ${drive.existingPluginVersion} on the stick.`,
        });
      }
    }
  }, [info, pushNotice]);

  const allDrives: RemovableDrive[] = [...(info?.drives ?? []), ...(chosenFolder ? [chosenFolder] : [])];
  const selected = allDrives.find((drive) => drive.id === selectedId);

  const chooseFolder = useCallback(async () => {
    const picked = await window.pamOsc.chooseUsbFolder();
    if (picked.status !== "chosen") return;
    const drive: RemovableDrive = {
      id: picked.path,
      label: picked.path,
      consoleReadable: "unknown",
      hasExistingPlugin: false,
    };
    setChosenFolder(drive);
    setSelectedId(drive.id);
  }, []);

  const run = useCallback(
    async (overwrite: boolean) => {
      if (!selectedId) return;
      setBusy(true);
      setConfirmReplace(undefined);
      try {
        const outcome = await window.pamOsc.copyPluginToUsb(selectedId, overwrite);
        if (outcome.status === "exists") {
          setConfirmReplace({ version: outcome.existingPluginVersion });
        } else {
          setResult(outcome);
          if (outcome.status === "copied") refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [selectedId, refresh]
  );

  const staleSelected =
    selected?.existingPluginVersion &&
    info?.bundledVersion &&
    comparePluginVersions(selected.existingPluginVersion, info.bundledVersion) < 0;

  return (
    <section className="card" aria-label="Copy to a USB stick">
      <h2>Copy to a USB stick (for a real console)</h2>
      <p className="inspector-meta">
        Copies the plugin{info?.bundledVersion ? <> (version <code>{info.bundledVersion}</code>)</> : null} and the OSC
        config onto a stick under <code>grandMA3/gma3_library/…</code>, ready to import at the console. GrandMA3 reads
        <strong> FAT32</strong> sticks reliably.
      </p>

      {loadError && <p className="empty-state">Couldn’t scan drives: {loadError}</p>}

      {info && info.drives.length === 0 && !chosenFolder && (
        <p className="empty-state">
          No USB stick detected. Plug one in and press Refresh, or choose a folder to copy into manually.
        </p>
      )}

      {allDrives.length > 0 && (
        <div className="field">
          <label htmlFor="usb-drive">Target drive</label>
          <select id="usb-drive" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">— select a drive —</option>
            {allDrives.map((drive) => (
              <option key={drive.id} value={drive.id}>
                {driveLabel(drive)}
              </option>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <p className="inspector-meta">
          <span className={`led ${readableHint(selected.consoleReadable).led}`} aria-hidden="true" />{" "}
          {readableHint(selected.consoleReadable).text}
          {selected.consoleReadable === "no" && (
            <>
              {" "}
              — copying is still allowed, but reformat the stick as FAT32 if the console shows nothing.
            </>
          )}
        </p>
      )}
      {staleSelected && (
        <p className="inspector-meta">Update available: this stick has {selected!.existingPluginVersion}.</p>
      )}

      {result?.status === "copied" && (
        <div className="device-name">
          <span className="board">✓ copied to {result.pluginTarget}</span>
          <span className="board">and {result.oscTarget}</span>
          <span className="board">
            At the console: import from <code>{result.consolePath}</code> via the Plugins pool (files are on the stick —
            navigate there if the list looks empty).
          </span>
        </div>
      )}
      {result?.status === "error" && (
        <div className="device-name">
          <span className="board">failed: {result.error}</span>
          <span className="board">copy manually — plugin to: {result.pluginTarget}</span>
          <span className="board">OSC config to: {result.oscTarget}</span>
        </div>
      )}

      <div className="section-actions">
        <button onClick={refresh} disabled={busy}>
          Refresh
        </button>
        <button onClick={() => void chooseFolder()} disabled={busy}>
          Choose folder …
        </button>
        {result?.status === "error" && (
          // AC-6: let the user reveal the bundled source files for a manual copy.
          <button onClick={() => void window.pamOsc.revealBundledAsset("plugin")}>Show bundled files …</button>
        )}
        {confirmReplace ? (
          <>
            <span className="board">Replace {confirmReplace.version ?? "the file on the stick"}?</span>
            <button className="primary" disabled={busy} onClick={() => void run(true)}>
              Replace
            </button>
            <button disabled={busy} onClick={() => setConfirmReplace(undefined)}>
              Keep
            </button>
          </>
        ) : (
          <button className="primary" disabled={busy || !selectedId} onClick={() => void run(false)}>
            {busy ? "Copying …" : "Copy to USB"}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Presentation mode (PAM-14): the full MA3 tab renders all three cards; the
 * setup wizard reuses the SAME cards one step at a time — "install" for its
 * install step, "osc" for the console-OSC step. One data path (getMa3Setup),
 * no forked components.
 */
export type Ma3SetupMode = "full" | "install" | "osc";

export function Ma3SetupView({
  values,
  mode = "full",
  pushNotice,
}: {
  values: ConsoleValues;
  mode?: Ma3SetupMode;
  /** Full mode only — lets the USB card raise the AC-8 update notice. */
  pushNotice?: (notice: Notice) => void;
}) {
  const [info, setInfo] = useState<Ma3SetupInfo | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  const refresh = useCallback(() => {
    setLoadError(undefined);
    window.pamOsc
      .getMa3Setup()
      .then(setInfo)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loadError)
    return (
      <section className="card" aria-label="Setup assistant">
        <p className="empty-state">Failed to load the setup assistant: {loadError}</p>
        <div className="section-actions">
          <button className="primary" onClick={refresh}>
            Retry
          </button>
        </div>
      </section>
    );
  if (!info) return <p className="empty-state">Looking for GrandMA3 installations …</p>;

  return (
    <>
      {mode !== "osc" && <InstallCard info={info} onRefresh={refresh} />}
      {mode === "full" && pushNotice && <UsbExportCard pushNotice={pushNotice} />}
      {mode !== "install" && <OscEntryCard values={values} localIps={info.localIps} />}
      {mode !== "install" && <ImportPluginCard />}
    </>
  );
}
