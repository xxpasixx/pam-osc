import { useCallback, useEffect, useState } from "react";
import type { Ma3InstallResult, Ma3SetupInfo } from "../../../shared/ipc.js";

/**
 * PAM-9: the MA3 setup assistant — one-click plugin install into detected
 * local onPC installations (AC-1/2/3), the USB route for real consoles
 * (AC-4), and the step-by-step console guide with the user's live values
 * (AC-5). Values come from the current settings draft — editing Setup
 * updates the guide immediately.
 */

interface ConsoleValues {
  address: string;
  sendPort: number;
  receivePort: number;
}

function InstallCard({
  info,
  onRefresh,
}: {
  info: Ma3SetupInfo;
  onRefresh: () => void;
}) {
  const [busyDir, setBusyDir] = useState<string | undefined>();
  const [pendingReplace, setPendingReplace] = useState<{ dir: string; version?: string } | undefined>();
  const [results, setResults] = useState<Record<string, Ma3InstallResult>>({});

  const install = useCallback(
    async (pluginsDir: string, overwrite: boolean) => {
      setBusyDir(pluginsDir);
      setPendingReplace(undefined);
      try {
        const result = await window.pamOsc.installMa3Plugin(pluginsDir, overwrite);
        if (result.status === "exists") {
          // AC-2: replace only after an explicit confirmation.
          setPendingReplace({ dir: pluginsDir, version: result.installedVersion });
        } else {
          setResults((current) => ({ ...current, [pluginsDir]: result }));
          onRefresh();
        }
      } finally {
        setBusyDir(undefined);
      }
    },
    [onRefresh]
  );

  return (
    <section className="card" aria-label="Install the console plugin">
      <h2>Step 1 — Install the console plugin</h2>
      <p className="inspector-meta">
        pam-osc ships plugin version <code>{info.bundledVersion ?? "unknown"}</code>. GrandMA3 imports plugins from{" "}
        <code>gma3_library/datapools/plugins</code>.
      </p>

      {info.installs.length === 0 && (
        <>
          <p className="empty-state">
            No GrandMA3 onPC installation was found on this machine — use the USB route for a console:
          </p>
          <ol className="guide-steps">
            <li>
              Click “Show plugin file” below and copy <code>pam-osc.xml</code> onto a USB stick into the folder{" "}
              <code>gma3_library/datapools/plugins/</code> (create it if needed).
            </li>
            <li>Plug the stick into the console — continue with step 3 below.</li>
          </ol>
        </>
      )}

      {info.installs.map((entry) => {
        const result = results[entry.pluginsDir];
        return (
          <div className="device-row" key={entry.pluginsDir}>
            <span
              className={`led ${entry.hasPamOsc ? "ok" : "warn"}`}
              aria-hidden="true"
              title={entry.hasPamOsc ? "plugin present" : "plugin not installed"}
            />
            <div className="device-name">
              {entry.base}
              <span className="board">
                {entry.hasPamOsc
                  ? `pam-osc.xml present (version ${entry.installedVersion ?? "unknown"})`
                  : "pam-osc.xml not installed yet"}
              </span>
              {result?.status === "installed" && (
                <span className="board">✓ installed to {result.target} — continue with step 2</span>
              )}
              {result?.status === "error" && (
                <span className="board">
                  Install failed: {result.error} — copy the file manually to {result.target}
                </span>
              )}
            </div>
            <div className="spacer" />
            {pendingReplace?.dir === entry.pluginsDir ? (
              <>
                <span className="board">
                  Replace version {pendingReplace.version ?? "unknown"} with {info.bundledVersion ?? "the bundled one"}?
                </span>
                <button className="primary" onClick={() => void install(entry.pluginsDir, true)}>
                  Replace
                </button>
                <button onClick={() => setPendingReplace(undefined)}>Keep</button>
              </>
            ) : (
              <button disabled={busyDir === entry.pluginsDir} onClick={() => void install(entry.pluginsDir, false)}>
                {busyDir === entry.pluginsDir ? "Installing …" : entry.hasPamOsc ? "Update plugin" : "Install plugin"}
              </button>
            )}
          </div>
        );
      })}

      <div className="section-actions">
        <button onClick={() => void window.pamOsc.revealBundledPlugin()}>Show plugin file …</button>
      </div>
    </section>
  );
}

function OscEntryCard({ values, localIps }: { values: ConsoleValues; localIps: string[] }) {
  const sameMachine = values.address === "127.0.0.1" || values.address === "localhost";
  const destinationIps = sameMachine ? ["127.0.0.1 (onPC on this machine)"] : localIps;
  return (
    <section className="card" aria-label="Create the OSC entry">
      <h2>Step 2 — Create the OSC entry in GrandMA3</h2>
      <ol className="guide-steps">
        <li>
          In GrandMA3, open <strong>Menu → Settings → OSC</strong>.
        </li>
        <li>
          Add an entry and name it exactly <code>pam-osc</code> — the plugin finds it by this name, the line number does
          not matter.
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
          Port: <code>{values.receivePort}</code> — pam-osc listens here for the console feedback (the receive port
          under Setup).
        </li>
        <li>
          Mode <code>UDP</code>, and enable both <strong>Send</strong> and <strong>Receive</strong> on the entry.
        </li>
        <li>
          Make sure the console accepts OSC input on port <code>{values.sendPort}</code> — that is where pam-osc sends
          its commands (the send port under Setup).
        </li>
      </ol>
      <p className="inspector-meta">
        pam-osc currently talks to the console at <code>{values.address}</code> — change it under Setup and this guide
        updates with it.
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
          Pick <code>pam-osc</code> from the list (the file installed in step 1) and import both plugins.
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

export function Ma3SetupView({ values }: { values: ConsoleValues }) {
  const [info, setInfo] = useState<Ma3SetupInfo | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  const refresh = useCallback(() => {
    window.pamOsc
      .getMa3Setup()
      .then(setInfo)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loadError) return <p className="empty-state">Failed to load the setup assistant: {loadError}</p>;
  if (!info) return <p className="empty-state">Looking for GrandMA3 installations …</p>;

  return (
    <>
      <InstallCard info={info} onRefresh={refresh} />
      <OscEntryCard values={values} localIps={info.localIps} />
      <ImportPluginCard />
    </>
  );
}
