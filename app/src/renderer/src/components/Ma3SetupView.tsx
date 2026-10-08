import { useCallback, useEffect, useRef, useState } from "react";
import { pickFeedbackIp, resolveFeedbackIp, type FeedbackIpPick } from "../../../shared/feedback-ip.js";
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
import { isPort, type OscConfigValues } from "../../../shared/osc-config.js";
import { comparePluginVersions } from "../../../shared/plugin-version.js";
import { ma3Checklist, settledConnection } from "../ma3-checklist.js";
import { consoleRoute } from "../wizard-logic.js";
import { ConnectionCheck, type CheckContext } from "./ConnectionCheck.js";
import { Ma3Checklist } from "./Ma3Checklist.js";

/**
 * PAM-9: the MA3 setup assistant — one-click install of the plugin and the
 * OSC config into detected local onPC installations (AC-1/2/3), the USB route
 * for real consoles (AC-4, PAM-23), and the console guide with the user's live
 * values (AC-5). Values come from the current settings draft — editing Setup
 * updates the guide immediately.
 *
 * PAM-35: ordered the way it can be verified — 1 copy the files, 2 OSC on the
 * console (check: the console answers), 3 import & start the plugin (check:
 * connected). The OSC config is generated for the user's setup (AC-5).
 */

interface ConsoleValues {
  address: string;
  sendPort: number;
  receivePort: number;
}

/** The values the generated OSC config is written with — or why it can't be (AC-5). */
type OscTarget = { values: OscConfigValues } | { problem: string };

function oscTargetFor(values: ConsoleValues, feedbackIp: string | undefined): OscTarget {
  if (!isPort(values.sendPort) || !isPort(values.receivePort)) {
    return { problem: "Fix the ports under Setup first — the OSC config needs both." };
  }
  if (!feedbackIp) {
    return {
      problem: "This computer has no network address — connect it to the console network, then press Refresh.",
    };
  }
  return { values: { feedbackIp, sendPort: values.sendPort, receivePort: values.receivePort } };
}

/** One install action (plugin or OSC config) as a row with its own busy/result/replace state. */
function InstallRow({
  install,
  asset,
  label,
  present,
  presentDetail,
  bundledLabel,
  osc,
  onDone,
}: {
  install: Ma3Install;
  asset: Ma3Asset;
  label: string;
  present: boolean;
  presentDetail: string;
  bundledLabel: string;
  /** Required for the OSC config (PAM-35 AC-5); a problem disables the row. */
  osc?: OscTarget;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ version?: string } | undefined>();
  const [result, setResult] = useState<Ma3InstallResult | undefined>();
  const problem = osc && "problem" in osc ? osc.problem : undefined;
  const oscValues = osc && "values" in osc ? osc.values : undefined;

  const run = useCallback(
    async (overwrite: boolean) => {
      setBusy(true);
      setConfirmReplace(undefined);
      try {
        const outcome = await window.pamOsc.installMa3Asset(install.base, asset, overwrite, oscValues);
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
    [install.base, asset, oscValues, onDone]
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
        {problem && <span className="board">{problem}</span>}
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
          <span className="board">
            Replace {confirmReplace.version ?? "the installed file"} with {bundledLabel}?
          </span>
          <button className="primary" onClick={() => void run(true)}>
            Replace
          </button>
          <button onClick={() => setConfirmReplace(undefined)}>Keep</button>
        </>
      ) : (
        <button disabled={busy || problem !== undefined} onClick={() => void run(false)}>
          {busy ? "Installing …" : present ? "Reinstall" : "Install"}
        </button>
      )}
    </div>
  );
}

/** AC-5: what the generated OSC config contains, and which address of this computer it sends feedback to. */
function OscTargetCard({
  values,
  pick,
  feedbackIp,
  onChoose,
  onRefresh,
}: {
  values: ConsoleValues;
  pick: FeedbackIpPick;
  feedbackIp: string | undefined;
  onChoose: (ip: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="card" aria-label="OSC config for your setup">
      <h2>OSC config for your setup</h2>
      <p className="inspector-meta">
        pam-osc writes the console’s OSC config for you: the console listens on port <code>{values.sendPort}</code> and
        sends its feedback to{" "}
        {feedbackIp ? (
          <code>
            {feedbackIp}:{values.receivePort}
          </code>
        ) : (
          "this computer"
        )}
        . Change the console address or ports under Setup and the config follows.
      </p>
      {pick.reason === "this-computer" && (
        <p className="inspector-meta">GrandMA3 runs on this computer, so the feedback goes to 127.0.0.1.</p>
      )}
      {pick.reason === "none" && (
        <>
          <p className="empty-state">
            This computer has no network address — connect it to the console network, then press Refresh.
          </p>
          <div className="section-actions">
            <button onClick={onRefresh}>Refresh</button>
          </div>
        </>
      )}
      {pick.reason !== "this-computer" && pick.reason !== "none" && (
        <div className="field feedback-ip">
          <label htmlFor="feedback-ip">This computer’s address on the console network</label>
          <select id="feedback-ip" value={feedbackIp ?? ""} onChange={(event) => onChoose(event.target.value)}>
            {pick.candidates.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
          {pick.reason === "ambiguous" && (
            <span className="field-hint">
              Several network cards could reach the console — make sure this is the one on the console network.
            </span>
          )}
          {pick.reason === "no-subnet-match" && (
            <span className="field-hint">
              None of this computer’s addresses is on the console’s network ({values.address}) — check the console IP
              under Setup, or pick the address that reaches the console.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function InstallCard({ info, osc, onRefresh }: { info: Ma3SetupInfo; osc: OscTarget; onRefresh: () => void }) {
  return (
    <section className="card" aria-label="onPC on this computer">
      <h2>onPC on this computer</h2>
      <p className="inspector-meta">
        One click copies the plugin (version <code>{info.bundledVersion ?? "unknown"}</code>) and the OSC config for
        your setup into onPC’s library — GrandMA3 imports them from <code>gma3_library/datapools/plugins</code> and{" "}
        <code>gma3_library/inout/osc</code>.
      </p>

      {info.installs.length === 0 && (
        <p className="empty-state">
          No GrandMA3 onPC installation found on this computer. Start onPC once (it creates its library folder) and
          press Refresh — or use a USB stick or folder.
        </p>
      )}

      {info.installs.map((install) => (
        <div key={install.base} style={{ marginBottom: 8 }}>
          <p className="inspector-meta">{install.base}</p>
          <InstallRow
            install={install}
            asset="plugin"
            label="Plugin (pam-osc)"
            present={install.hasPamOsc}
            presentDetail={`installed, version ${install.installedVersion ?? "unknown"}`}
            bundledLabel={`version ${info.bundledVersion ?? "the bundled one"}`}
            onDone={onRefresh}
          />
          <InstallRow
            install={install}
            asset="osc"
            label="OSC config (generated for your setup)"
            present={install.hasOscConfig}
            presentDetail="an OSC config is there — Reinstall writes one for your current settings"
            bundledLabel="one for your current settings"
            osc={osc}
            onDone={onRefresh}
          />
        </div>
      ))}

      <div className="section-actions">
        <button onClick={onRefresh}>Refresh</button>
        <button onClick={() => void window.pamOsc.revealBundledAsset("plugin")}>Show plugin file …</button>
      </div>
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
 * unreadable filesystems (AC-9), and flags an out-of-date stick (AC-8). The OSC
 * config is generated for the remote console (PAM-35 AC-5).
 */
function UsbExportCard({ pushNotice, osc }: { pushNotice: (notice: Notice) => void; osc: OscTarget }) {
  const [info, setInfo] = useState<UsbExportInfo | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string>("");
  const [chosenFolder, setChosenFolder] = useState<RemovableDrive | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<{ version?: string } | undefined>();
  const [result, setResult] = useState<UsbCopyResult | undefined>();
  const notifiedStale = useRef(new Set<string>());
  const problem = "problem" in osc ? osc.problem : undefined;
  const oscValues = "values" in osc ? osc.values : undefined;

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
      if (!selectedId || !oscValues) return;
      setBusy(true);
      setConfirmReplace(undefined);
      try {
        const outcome = await window.pamOsc.copyPluginToUsb(selectedId, overwrite, oscValues);
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
    [selectedId, oscValues, refresh]
  );

  const staleSelected =
    selected?.existingPluginVersion &&
    info?.bundledVersion &&
    comparePluginVersions(selected.existingPluginVersion, info.bundledVersion) < 0;

  return (
    <section className="card" aria-label="Copy to a USB stick or folder">
      <h2>USB stick or folder (console or another computer)</h2>
      {"values" in osc && osc.values.feedbackIp === "127.0.0.1" && (
        // PAM-35 review BUG-6: a loopback config only works for onPC on this very computer.
        <p className="field-hint warn">
          This OSC config sends feedback to <code>127.0.0.1</code> — fine for onPC on this computer, but a console on
          the network needs this computer’s address. Set the console IP under Setup first.
        </p>
      )}
      <p className="inspector-meta">
        Copies the plugin
        {info?.bundledVersion ? (
          <>
            {" "}
            (version <code>{info.bundledVersion}</code>)
          </>
        ) : null}{" "}
        and the OSC config for your setup onto a stick under <code>grandMA3/gma3_library/…</code>, ready to import at
        the console. GrandMA3 reads <strong>FAT32</strong> sticks reliably. For onPC on another computer, choose a
        shared folder instead.
      </p>

      {loadError && <p className="empty-state">Couldn’t scan drives: {loadError}</p>}
      {problem && <p className="empty-state">{problem}</p>}

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
            <> — copying is still allowed, but reformat the stick as FAT32 if the console shows nothing.</>
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
            At the console: the plugin is in <code>{result.consolePath}</code> (Plugins pool → Import), the OSC config
            in <code>grandMA3/gma3_library/inout/osc</code> (MENU → In &amp; Out → OSC). Navigate there if a list looks
            empty.
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
            <span className="board">Replace {confirmReplace.version ?? "the files on the stick"}?</span>
            <button className="primary" disabled={busy} onClick={() => void run(true)}>
              Replace
            </button>
            <button disabled={busy} onClick={() => setConfirmReplace(undefined)}>
              Keep
            </button>
          </>
        ) : (
          <button className="primary" disabled={busy || !selectedId || !oscValues} onClick={() => void run(false)}>
            {busy ? "Copying …" : "Copy to USB"}
          </button>
        )}
      </div>
    </section>
  );
}

/** AC-6: import the generated config first; the hand-made entries are the fallback. */
function OscCard({
  values,
  pick,
  feedbackIp,
  check,
}: {
  values: ConsoleValues;
  pick: FeedbackIpPick;
  feedbackIp: string | undefined;
  check?: { live: boolean; context: CheckContext };
}) {
  const destination = feedbackIp ?? (pick.candidates.length > 0 ? pick.candidates.join(" or ") : undefined);
  return (
    <section className="card" aria-label="OSC entries on the console">
      <h2>OSC entries on the console</h2>
      <ol className="guide-steps">
        <li>
          On the console, open <strong>MENU → In &amp; Out → OSC</strong> and pick the network card in the{" "}
          <strong>Interface</strong> list — the one on the network with this computer.
        </li>
        <li>
          <strong>Import</strong> the OSC config <code>pam-osc</code> you copied over — it creates both entries with
          your values.
        </li>
        <li>
          Check that both entries are there: one listening on port <code>{values.sendPort}</code>, and one named{" "}
          <code>pam-osc</code> sending to <code>{destination ?? "this computer"}</code> on port{" "}
          <code>{values.receivePort}</code>.
        </li>
      </ol>
      <details className="advanced">
        <summary>Set the two entries up by hand instead</summary>
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
            {destination ? (
              <code>{destination}</code>
            ) : (
              <em>no network address found — connect this computer to the console network first</em>
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
      </details>
      {check && <ConnectionCheck target="reachable" live={check.live} context={check.context} />}
    </section>
  );
}

/** AC-7: import + start the plugin, then the "connected" check. */
function PluginCard({ check }: { check?: { live: boolean; context: CheckContext } }) {
  return (
    <section className="card" aria-label="Plugin on the console">
      <h2>Plugin on the console</h2>
      <ol className="guide-steps">
        <li>
          Open a <strong>Plugins</strong> pool window on the console, edit an empty slot and choose{" "}
          <strong>Import</strong>.
        </li>
        <li>
          Pick <code>pam-osc</code> (the plugin you copied over) and import it.
        </li>
        <li>
          Run <strong>“pam-osc”</strong> — once per session. On start it checks the OSC entries and creates missing
          ones; running it again offers Stop, Settings and an OSC re-check. An old “pam-osc Settings” plugin from an
          earlier version can be deleted.
        </li>
      </ol>
      {check && <ConnectionCheck target="connected" live={check.live} context={check.context} />}
    </section>
  );
}

/**
 * Presentation mode: the full MA3 tab renders the three steps as a checklist
 * (PAM-36); the setup wizard reuses the SAME cards one step at a time — "files", "osc",
 * "plugin" (PAM-14, reordered by PAM-35). One data path (getMa3Setup), no
 * forked components.
 */
export type Ma3SetupMode = "full" | "files" | "osc" | "plugin";

export function Ma3SetupView({
  values,
  mode = "full",
  pushNotice,
  feedbackIpChoice,
  onFeedbackIpChoice,
  check,
}: {
  values: ConsoleValues;
  mode?: Ma3SetupMode;
  /** Lets the USB card raise the PAM-23 AC-8 update notice. */
  pushNotice: (notice: Notice) => void;
  /** The user's pick of this computer's address (lifted to App so it survives step changes). */
  feedbackIpChoice: string | undefined;
  onFeedbackIpChoice: (ip: string) => void;
  /** Live-check context (PAM-35 AC-8) — the OSC and plugin steps show their check below. */
  check?: CheckContext;
}) {
  const [info, setInfo] = useState<Ma3SetupInfo | undefined>();
  // PAM-36 BUG-2: last connection result that wasn't "checking".
  const settledRef = useRef<CheckContext["connection"]>(undefined);
  // Forget it whenever the bridge isn't running — a restart must not show the old run (review BUG-5).
  if (check?.engineState !== "running") settledRef.current = undefined;
  const settled = settledConnection(check?.connection, settledRef.current);
  if (check?.connection && check.connection.state !== "checking") settledRef.current = check.connection;
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

  const pick = pickFeedbackIp(values.address, info.localAddresses);
  const feedbackIp = resolveFeedbackIp(pick, feedbackIpChoice);
  const osc = oscTargetFor(values, feedbackIp);
  const onThisComputer = consoleRoute(values.address) === "this-computer";
  const full = mode === "full";

  const oscTarget = (
    <OscTargetCard
      values={values}
      pick={pick}
      feedbackIp={feedbackIp}
      onChoose={onFeedbackIpChoice}
      onRefresh={refresh}
    />
  );
  const installCard = <InstallCard info={info} osc={osc} onRefresh={refresh} />;
  const usbCard = <UsbExportCard pushNotice={pushNotice} osc={osc} />;
  // AC-4 / AC-9: the route that fits the console address comes first.
  const [primary, secondary] = onThisComputer ? [installCard, usbCard] : [usbCard, installCard];
  const secondaryLabel = onThisComputer
    ? "Use a USB stick or folder instead"
    : "Install into onPC on this computer instead";

  // PAM-36: the full tab is a checklist — same cards, one step expanded at a
  // time, status from what the app observes. The wizard modes below are unchanged.
  if (full) {
    const steps = ma3Checklist({
      info,
      onThisComputer,
      engineState: check?.engineState ?? "stopped",
      connection: settled,
    });
    return (
      <Ma3Checklist
        steps={steps}
        bodies={{
          files: (
            <>
              {oscTarget}
              {primary}
              <details className="advanced">
                <summary>{secondaryLabel}</summary>
                {secondary}
              </details>
            </>
          ),
          // One live check in the tab (PAM-35 AC-8): the plugin step polls for both.
          osc: (
            <OscCard
              values={values}
              pick={pick}
              feedbackIp={feedbackIp}
              check={check ? { live: false, context: check } : undefined}
            />
          ),
          plugin: <PluginCard check={check ? { live: true, context: check } : undefined} />,
        }}
      />
    );
  }

  return (
    <>
      {mode === "files" && (
        <>
          {oscTarget}
          {primary}
          <details className="advanced">
            <summary>{secondaryLabel}</summary>
            {secondary}
          </details>
        </>
      )}
      {mode === "osc" && (
        <OscCard
          values={values}
          pick={pick}
          feedbackIp={feedbackIp}
          check={check ? { live: true, context: check } : undefined}
        />
      )}
      {mode === "plugin" && <PluginCard check={check ? { live: true, context: check } : undefined} />}
    </>
  );
}
