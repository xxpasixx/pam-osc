import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ConsoleReadable, RemovableDrive } from "../shared/ipc.js";
import { readPluginVersion } from "./ma3-install.js";

/**
 * PAM-23: list connected removable/external drives and compute the on-stick
 * target layout for copying the MA3 plugin + OSC config. Detection shells out
 * to OS commands (diskutil / lsblk / PowerShell) and parses their output — no
 * native npm dependency (the project avoids native modules). The parsers are
 * pure functions unit-tested with captured command fixtures; the thin exec
 * wrapper and fs probing live here too but are exercised via integration.
 *
 * Copy itself reuses installFile() from ma3-install.ts (index.ts wires it up).
 */

const execFileAsync = promisify(execFile);

/**
 * The console-import layout on external media lives under a top-level
 * `grandMA3/` wrapper — the console browses a stick from
 * `<drive>/grandMA3/gma3_library/…`, not the stick root (pre-mortem finding,
 * HARDWARE-VERIFY). Kept as a single constant so it is a one-line change if a
 * real console proves the root works too.
 */
export const USB_LIBRARY_WRAPPER = join("grandMA3", "gma3_library");

/** The two target folders on a stick for a given drive root. */
export function usbTargetDirs(driveRoot: string): { pluginsDir: string; oscDir: string } {
  const base = join(driveRoot, USB_LIBRARY_WRAPPER);
  return {
    pluginsDir: join(base, "datapools", "plugins"),
    oscDir: join(base, "inout", "osc"),
  };
}

/**
 * Human hint for the console-navigation path (AC-10) — where to import from at
 * the desk. Uses forward slashes for display regardless of host OS.
 */
export function consoleImportPath(): string {
  return "grandMA3/gma3_library/datapools/plugins";
}

/**
 * Classify a filesystem for GrandMA3 readability (AC-9). FAT32 is the
 * documented safe format; exFAT usually works but is per-desk unverified;
 * Mac/Linux-native filesystems and NTFS are treated as "no".
 */
export function classifyFilesystem(fs: string | undefined): ConsoleReadable {
  if (!fs) return "unknown";
  const f = fs.toLowerCase();
  if (f.includes("fat32") || f === "fat" || f === "msdos" || f === "vfat") return "yes";
  if (f.includes("exfat")) return "likely";
  if (
    f.includes("apfs") ||
    f.includes("hfs") ||
    f.includes("ntfs") ||
    f.includes("ext2") ||
    f.includes("ext3") ||
    f.includes("ext4")
  ) {
    return "no";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Pure parsers (unit-tested with captured command output)
// ---------------------------------------------------------------------------

/** A drive candidate before the fs probe for an existing plugin is added. */
export interface DriveCandidate {
  id: string;
  label: string;
  filesystem?: string;
  capacityBytes?: number;
  freeBytes?: number;
}

/**
 * macOS: parse `diskutil info -plist <mount>` output for one volume and decide
 * whether it is a safe removable target. Returns a candidate or undefined.
 * Keeps a volume only when it is external (Internal=false), writable, and not
 * a disk image (DMG). The boot volume is Internal=true and is dropped here.
 */
export function parseDiskutilInfo(plistXml: string): DriveCandidate | undefined {
  const bool = (key: string): boolean | undefined => {
    // <key>Internal</key><true/> or <false/>
    const re = new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`);
    const m = plistXml.match(re);
    return m ? m[1] === "true" : undefined;
  };
  const str = (key: string): string | undefined => {
    const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
    return plistXml.match(re)?.[1];
  };
  const num = (key: string): number | undefined => {
    const re = new RegExp(`<key>${key}</key>\\s*<integer>(\\d+)</integer>`);
    const m = plistXml.match(re);
    return m ? Number(m[1]) : undefined;
  };

  const mount = str("MountPoint");
  if (!mount || mount === "/") return undefined; // unmounted or the boot volume
  const internal = bool("Internal");
  const writable = bool("WritableVolume");
  const virtualOrPhysical = str("VirtualOrPhysical"); // "Physical" for real disks, "Virtual" for DMGs/APFS synth
  if (internal === true) return undefined; // internal disk — never offer
  if (writable === false) return undefined; // read-only mount (DMG/ISO/locked)
  if (virtualOrPhysical === "Virtual") return undefined; // mounted disk image

  return {
    id: mount,
    label: str("VolumeName") ?? mount,
    filesystem: str("FilesystemName") ?? str("FilesystemType"),
    capacityBytes: num("TotalSize") ?? num("VolumeSize"),
    freeBytes: num("FreeSpace") ?? num("APFSContainerFree"),
  };
}

interface LsblkNode {
  name?: string;
  label?: string;
  rm?: boolean;
  hotplug?: boolean;
  tran?: string | null;
  ro?: boolean;
  mountpoint?: string | null;
  fstype?: string | null;
  size?: number | string | null;
  children?: LsblkNode[];
}

/**
 * Linux: parse `lsblk --json -b -o NAME,LABEL,RM,HOTPLUG,TRAN,RO,MOUNTPOINT,FSTYPE,SIZE`.
 * Keeps mounted, writable partitions that are removable / hotplug / on the USB
 * bus. Walks children (partitions live under their disk). `-b` gives SIZE in bytes.
 */
export function parseLsblkJson(json: string): DriveCandidate[] {
  let parsed: { blockdevices?: LsblkNode[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const out: DriveCandidate[] = [];
  const walk = (node: LsblkNode, parentRemovable: boolean) => {
    // Removability is a property of the parent disk; children inherit it.
    const removable = parentRemovable || node.rm === true || node.hotplug === true || node.tran === "usb";
    const mount = node.mountpoint ?? undefined;
    if (mount && node.ro !== true && removable) {
      const sizeNum = typeof node.size === "string" ? Number(node.size) : node.size ?? undefined;
      out.push({
        id: mount,
        label: node.label && node.label.length > 0 ? node.label : mount,
        filesystem: node.fstype ?? undefined,
        capacityBytes: typeof sizeNum === "number" && !Number.isNaN(sizeNum) ? sizeNum : undefined,
      });
    }
    for (const child of node.children ?? []) walk(child, removable);
  };
  for (const dev of parsed.blockdevices ?? []) walk(dev, false);
  return out;
}

interface WindowsVolumeRow {
  DriveLetter?: string | null;
  FileSystemLabel?: string | null;
  FileSystem?: string | null;
  Size?: number | string | null;
  SizeRemaining?: number | string | null;
  /** Joined-in from Get-Disk: "USB", "SATA", … */
  BusType?: string | null;
  /** Get-Volume DriveType: "Removable" | "Fixed" | … */
  DriveType?: string | null;
}

/**
 * Windows: parse the JSON emitted by a Get-Volume/Get-Disk join. Keeps volumes
 * with a drive letter that are on the USB bus OR of DriveType "Removable"
 * (external USB HDDs report as Fixed, so bus type matters). Accepts either a
 * single object or an array (PowerShell emits a bare object for one match).
 */
export function parseWindowsDrives(json: string): DriveCandidate[] {
  let rows: WindowsVolumeRow[];
  try {
    const parsed = JSON.parse(json);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
  const toNum = (v: number | string | null | undefined): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isNaN(n) ? undefined : n;
  };
  const out: DriveCandidate[] = [];
  for (const row of rows) {
    const letter = row.DriveLetter?.trim();
    if (!letter) continue;
    const isUsb = row.BusType === "USB";
    const isRemovable = row.DriveType === "Removable";
    if (!isUsb && !isRemovable) continue;
    const root = `${letter.replace(/:$/, "")}:\\`;
    out.push({
      id: root,
      label: row.FileSystemLabel && row.FileSystemLabel.length > 0 ? row.FileSystemLabel : root,
      filesystem: row.FileSystem ?? undefined,
      capacityBytes: toNum(row.Size),
      freeBytes: toNum(row.SizeRemaining),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Thin OS exec + assembly (integration-tested, not unit-tested)
// ---------------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Run the platform command and return raw candidates (before the plugin probe). */
async function detectCandidates(platform: NodeJS.Platform): Promise<DriveCandidate[]> {
  try {
    if (platform === "darwin") {
      const { stdout: listOut } = await execFileAsync("diskutil", ["list", "-plist"]);
      // Mount points appear in the list plist; probe each volume's info plist.
      const mounts = [...listOut.matchAll(/<key>MountPoint<\/key>\s*<string>([^<]+)<\/string>/g)]
        .map((m) => m[1]!)
        .filter((mount) => mount && mount !== "/");
      const uniqueMounts = [...new Set(mounts)];
      const candidates: DriveCandidate[] = [];
      for (const mount of uniqueMounts) {
        const { stdout } = await execFileAsync("diskutil", ["info", "-plist", mount]);
        const candidate = parseDiskutilInfo(stdout);
        if (candidate) candidates.push(candidate);
      }
      return candidates;
    }
    if (platform === "linux") {
      const { stdout } = await execFileAsync("lsblk", [
        "--json",
        "-b",
        "-o",
        "NAME,LABEL,RM,HOTPLUG,TRAN,RO,MOUNTPOINT,FSTYPE,SIZE",
      ]);
      return parseLsblkJson(stdout);
    }
    if (platform === "win32") {
      // Join Get-Volume with Get-Disk (via partition) to get BusType; emit JSON.
      const script =
        "$vols = Get-Volume | Where-Object { $_.DriveLetter }; " +
        "$vols | ForEach-Object { $v = $_; $bus = $null; " +
        "try { $bus = ($v | Get-Partition | Get-Disk).BusType } catch {}; " +
        "[pscustomobject]@{ DriveLetter=$v.DriveLetter; FileSystemLabel=$v.FileSystemLabel; " +
        "FileSystem=$v.FileSystem; Size=$v.Size; SizeRemaining=$v.SizeRemaining; " +
        "DriveType=$v.DriveType.ToString(); BusType=$bus.ToString() } } | ConvertTo-Json -Compress";
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
      return parseWindowsDrives(stdout);
    }
  } catch {
    // A missing command or a parse failure yields no drives — the UI still
    // offers the "choose folder" fallback (AC-2). Never crash the app.
    return [];
  }
  return [];
}

/**
 * Full detection: raw candidates enriched with the on-stick plugin probe and
 * the console-readability hint. Used by the IPC handler (index.ts).
 */
export async function listRemovableDrives(platform: NodeJS.Platform): Promise<RemovableDrive[]> {
  const candidates = await detectCandidates(platform);
  const drives: RemovableDrive[] = [];
  for (const c of candidates) {
    const { pluginsDir } = usbTargetDirs(c.id);
    const pluginXml = join(pluginsDir, "pam-osc.xml");
    const hasExistingPlugin = await exists(pluginXml);
    const drive: RemovableDrive = {
      id: c.id,
      label: c.label,
      filesystem: c.filesystem,
      consoleReadable: classifyFilesystem(c.filesystem),
      capacityBytes: c.capacityBytes,
      freeBytes: c.freeBytes,
      hasExistingPlugin,
    };
    if (hasExistingPlugin) {
      const version = await readPluginVersion(pluginXml);
      if (version) drive.existingPluginVersion = version;
    }
    drives.push(drive);
  }
  return drives;
}
