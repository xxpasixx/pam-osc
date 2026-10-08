import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dialog, shell, type BrowserWindow } from "electron";

/**
 * PAM-21 (in-app attribution, maintainer decision 2026-10-08): Help → "Board
 * Photo Credits…" shows the CC attributions from the bundled CREDITS.md —
 * the licences require them to be reachable by the people who see the photos.
 */

export interface PhotoCredit {
  file: string;
  title: string;
  url: string;
  author: string;
  licence: string;
}

/** `[text](<url>)` or `[text](url)` → { text, url }. */
function link(cell: string): { text: string; url: string } {
  const match = /^\[(.+)\]\(<?([^>)]+(?:\([^)]*\)[^>)]*)*)>?\)$/.exec(cell.trim());
  return match ? { text: match[1]!, url: match[2]! } : { text: cell.trim(), url: "" };
}

/** Reads the credits table rows (File | Source | Author | Licence) from CREDITS.md. */
export function parsePhotoCredits(markdown: string): PhotoCredit[] {
  const credits: PhotoCredit[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| `")) continue; // data rows start with the `file` cell
    const cells = line.split(" | ").map((cell) => cell.replace(/^\|\s*|\s*\|$/g, "").trim());
    if (cells.length < 4) continue;
    const source = link(cells[1]!);
    credits.push({
      file: cells[0]!.replace(/`/g, ""),
      title: source.text,
      url: source.url,
      author: cells[2]!,
      licence: link(cells[3]!).text,
    });
  }
  return credits;
}

export function formatPhotoCredits(credits: PhotoCredit[]): string {
  return credits
    .map((credit) => `${credit.file}\n“${credit.title}” by ${credit.author}, ${credit.licence}\n${credit.url}`)
    .join("\n\n");
}

export async function showPhotoCredits(window: BrowserWindow | undefined, bundledRoot: string): Promise<void> {
  const file = join(bundledRoot, "devices", "images", "CREDITS.md");
  let detail: string;
  try {
    detail = formatPhotoCredits(parsePhotoCredits(await readFile(file, "utf8")));
  } catch {
    detail = "The credits file could not be read.";
  }
  const options: Electron.MessageBoxOptions = {
    type: "info",
    message: "Board photo credits",
    detail: `${detail}\n\nPhotos from Wikimedia Commons, cropped and downscaled. Product names and logos are trademarks of their owners.`,
    buttons: ["OK", "Open credits file"],
    defaultId: 0,
    cancelId: 0,
  };
  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  if (response === 1) await shell.openPath(file);
}
