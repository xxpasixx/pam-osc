import { useCallback, useEffect, useState } from "react";
import type { Ma3Asset, Ma3Install, Ma3InstallResult, Ma3SetupInfo } from "../../../shared/ipc.js";

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

export function Ma3SetupView({ values }: { values: ConsoleValues }) {
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
      <InstallCard info={info} onRefresh={refresh} />
      <OscEntryCard values={values} localIps={info.localIps} />
      <ImportPluginCard />
    </>
  );
}
