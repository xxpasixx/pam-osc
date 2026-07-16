/**
 * Structured result of loading/validating pam-osc files. Surfaced to the
 * user by the app UI (PAM-3/PAM-4); tested directly in PAM-1.
 */
export interface FormatIssue {
  severity: "error" | "info";
  /** Path of the file the issue belongs to. */
  file: string;
  /** Location inside the file, e.g. "controls[3].midi.number". */
  path?: string;
  /** Human-readable, plain-language description of the problem. */
  message: string;
}
