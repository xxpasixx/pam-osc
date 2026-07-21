import { describe, expect, it } from "vitest";
import {
  classifyFilesystem,
  consoleImportPath,
  parseDiskutilInfo,
  parseLsblkJson,
  parseWindowsDrives,
  usbTargetDirs,
} from "./usb-export.js";
import { comparePluginVersions } from "./ma3-install.js";

/**
 * PAM-23: the per-OS drive parsers are pure — driven here by captured command
 * fixtures. The thin exec wrapper and fs probing are covered by integration.
 */

describe("usbTargetDirs (AC-3 — grandMA3 wrapper layout)", () => {
  it("writes under the grandMA3/gma3_library wrapper on the stick", () => {
    const { pluginsDir, oscDir } = usbTargetDirs("/Volumes/USB");
    expect(pluginsDir).toBe("/Volumes/USB/grandMA3/gma3_library/datapools/plugins");
    expect(oscDir).toBe("/Volumes/USB/grandMA3/gma3_library/inout/osc");
  });

  it("exposes the console navigation path for the success message (AC-10)", () => {
    expect(consoleImportPath()).toBe("grandMA3/gma3_library/datapools/plugins");
  });
});

describe("classifyFilesystem (AC-9)", () => {
  it("marks FAT32 readable, exFAT likely, Mac/Linux/NTFS not, unknown otherwise", () => {
    expect(classifyFilesystem("MS-DOS FAT32")).toBe("yes");
    expect(classifyFilesystem("vfat")).toBe("yes");
    expect(classifyFilesystem("ExFAT")).toBe("likely");
    expect(classifyFilesystem("APFS")).toBe("no");
    expect(classifyFilesystem("Mac OS Extended (HFS+)")).toBe("no");
    expect(classifyFilesystem("NTFS")).toBe("no");
    expect(classifyFilesystem("ext4")).toBe("no");
    expect(classifyFilesystem("weirdfs")).toBe("unknown");
    expect(classifyFilesystem(undefined)).toBe("unknown");
  });
});

describe("comparePluginVersions (shared PAM-9 AC-9 / PAM-23 AC-8)", () => {
  it("orders 4-part MA3 versions numerically", () => {
    expect(comparePluginVersions("2.0.0.0", "2.0.0.1")).toBeLessThan(0);
    expect(comparePluginVersions("2.0.0.1", "2.0.0.0")).toBeGreaterThan(0);
    expect(comparePluginVersions("2.0.0.0", "2.0.0.0")).toBe(0);
    expect(comparePluginVersions("2.0.0.10", "2.0.0.2")).toBeGreaterThan(0); // numeric, not lexical
  });

  it("treats missing trailing parts as 0 and non-numeric as 0", () => {
    expect(comparePluginVersions("2.0", "2.0.0.0")).toBe(0);
    expect(comparePluginVersions("2.0.1", "2.0")).toBeGreaterThan(0);
    expect(comparePluginVersions("garbage", "0.0.0.0")).toBe(0);
  });
});

describe("parseDiskutilInfo (macOS)", () => {
  const makeInfo = (entries: Record<string, string>) =>
    `<?xml version="1.0"?><plist><dict>${Object.entries(entries)
      .map(([k, v]) => `<key>${k}</key>${v}`)
      .join("")}</dict></plist>`;

  it("accepts an external, writable, physical USB volume", () => {
    const xml = makeInfo({
      MountPoint: "<string>/Volumes/STICK</string>",
      VolumeName: "<string>STICK</string>",
      Internal: "<false/>",
      WritableVolume: "<true/>",
      VirtualOrPhysical: "<string>Physical</string>",
      FilesystemName: "<string>MS-DOS FAT32</string>",
      TotalSize: "<integer>16000000000</integer>",
      FreeSpace: "<integer>15000000000</integer>",
    });
    expect(parseDiskutilInfo(xml)).toEqual({
      id: "/Volumes/STICK",
      label: "STICK",
      filesystem: "MS-DOS FAT32",
      capacityBytes: 16000000000,
      freeBytes: 15000000000,
    });
  });

  it("rejects the internal boot disk", () => {
    const xml = makeInfo({
      MountPoint: "<string>/</string>",
      Internal: "<true/>",
      WritableVolume: "<true/>",
    });
    expect(parseDiskutilInfo(xml)).toBeUndefined();
  });

  it("rejects an internal (non-boot) volume even if writable", () => {
    const xml = makeInfo({
      MountPoint: "<string>/Volumes/Macintosh HD - Data</string>",
      Internal: "<true/>",
      WritableVolume: "<true/>",
    });
    expect(parseDiskutilInfo(xml)).toBeUndefined();
  });

  it("rejects a read-only mount (locked stick / ISO)", () => {
    const xml = makeInfo({
      MountPoint: "<string>/Volumes/READONLY</string>",
      Internal: "<false/>",
      WritableVolume: "<false/>",
    });
    expect(parseDiskutilInfo(xml)).toBeUndefined();
  });

  it("rejects a mounted disk image (Virtual)", () => {
    const xml = makeInfo({
      MountPoint: "<string>/Volumes/Installer</string>",
      Internal: "<false/>",
      WritableVolume: "<true/>",
      VirtualOrPhysical: "<string>Virtual</string>",
    });
    expect(parseDiskutilInfo(xml)).toBeUndefined();
  });

  it("falls back to the mount path when the volume has no name", () => {
    const xml = makeInfo({
      MountPoint: "<string>/Volumes/Untitled</string>",
      Internal: "<false/>",
      WritableVolume: "<true/>",
      VirtualOrPhysical: "<string>Physical</string>",
    });
    expect(parseDiskutilInfo(xml)?.label).toBe("/Volumes/Untitled");
  });
});

describe("parseLsblkJson (Linux)", () => {
  it("keeps a mounted, writable USB partition and drops the internal disk", () => {
    const json = JSON.stringify({
      blockdevices: [
        {
          name: "sda",
          rm: false,
          tran: "sata",
          children: [{ name: "sda1", mountpoint: "/", fstype: "ext4", ro: false }],
        },
        {
          name: "sdb",
          rm: true,
          tran: "usb",
          children: [
            {
              name: "sdb1",
              label: "MYSTICK",
              mountpoint: "/media/user/MYSTICK",
              fstype: "vfat",
              ro: false,
              size: "16000000000",
            },
          ],
        },
      ],
    });
    const drives = parseLsblkJson(json);
    expect(drives).toHaveLength(1);
    expect(drives[0]).toEqual({
      id: "/media/user/MYSTICK",
      label: "MYSTICK",
      filesystem: "vfat",
      capacityBytes: 16000000000,
    });
  });

  it("inherits removability from the parent disk and skips unmounted/RO partitions", () => {
    const json = JSON.stringify({
      blockdevices: [
        {
          name: "sdb",
          hotplug: true,
          children: [
            { name: "sdb1", mountpoint: null, fstype: "vfat", ro: false }, // unmounted
            { name: "sdb2", mountpoint: "/media/user/RO", fstype: "vfat", ro: true }, // read-only
            { name: "sdb3", mountpoint: "/media/user/OK", fstype: "exfat", ro: false },
          ],
        },
      ],
    });
    const drives = parseLsblkJson(json);
    expect(drives.map((d) => d.id)).toEqual(["/media/user/OK"]);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseLsblkJson("not json")).toEqual([]);
  });
});

describe("parseWindowsDrives", () => {
  it("keeps USB-bus and Removable volumes, drops internal fixed disks", () => {
    const json = JSON.stringify([
      { DriveLetter: "C", FileSystem: "NTFS", DriveType: "Fixed", BusType: "SATA", Size: 500, SizeRemaining: 100 },
      { DriveLetter: "E", FileSystemLabel: "STICK", FileSystem: "FAT32", DriveType: "Removable", BusType: "USB", Size: 16, SizeRemaining: 15 },
      { DriveLetter: "F", FileSystemLabel: "USBHDD", FileSystem: "exFAT", DriveType: "Fixed", BusType: "USB", Size: 1000, SizeRemaining: 900 },
    ]);
    const drives = parseWindowsDrives(json);
    expect(drives.map((d) => d.id)).toEqual(["E:\\", "F:\\"]); // E removable, F external USB HDD (Fixed but USB bus)
    expect(drives[0]!.label).toBe("STICK");
    expect(drives[0]!.filesystem).toBe("FAT32");
    expect(drives[0]!.capacityBytes).toBe(16);
  });

  it("accepts a single bare object (one match)", () => {
    const json = JSON.stringify({ DriveLetter: "E", FileSystem: "FAT32", DriveType: "Removable", BusType: "USB" });
    const drives = parseWindowsDrives(json);
    expect(drives).toHaveLength(1);
    expect(drives[0]!.id).toBe("E:\\");
  });

  it("falls back to the drive root when unlabeled", () => {
    const json = JSON.stringify([{ DriveLetter: "G", FileSystem: "FAT32", DriveType: "Removable", BusType: "USB" }]);
    expect(parseWindowsDrives(json)[0]!.label).toBe("G:\\");
  });

  it("returns [] on malformed JSON", () => {
    expect(parseWindowsDrives("boom")).toEqual([]);
  });
});
