/**
 * MA3 plugin version comparison — node-free so both the main process
 * (ma3-install.ts) and the renderer (USB export card) can use it.
 *
 * Compares dot-separated versions (e.g. "2.0.0.1") numerically, part by part;
 * missing trailing parts count as 0, non-numeric parts as 0 (a garbled version
 * never claims to be newer). Returns <0 when a<b, 0 when equal, >0 when a>b.
 */
export function comparePluginVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = Number.parseInt(pa[i] ?? "0", 10);
    const nb = Number.parseInt(pb[i] ?? "0", 10);
    const va = Number.isNaN(na) ? 0 : na;
    const vb = Number.isNaN(nb) ? 0 : nb;
    if (va !== vb) return va - vb;
  }
  return 0;
}
