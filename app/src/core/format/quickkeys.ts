/**
 * PAM-18 — Canonical QuickKey catalogue (single source of truth, AC-2).
 *
 * These are the MA3 hardkey codes the plugin pre-creates as `pam-osc_<CODE>`
 * Quickey pool objects (`createQuickeysIfNotExists` in `pam-OSC.lua`). The
 * editor dropdown (MappingInspector) reads this list so the UI and the plugin
 * cannot drift; a parity test (`quickkeys.test.ts`) asserts this set matches the
 * Lua array byte-for-byte.
 *
 * Pure data — no logic. Edit here AND in `pam-OSC.lua` together (the parity test
 * enforces it).
 */

export type QuickKeyGroup = "Keypad" | "Transport" | "Function" | "Object" | "Navigation" | "Special";

export interface QuickKeyDef {
  /** Exact MA3 hardkey code — the `<CODE>` in `pam-osc_<CODE>`. */
  code: string;
  /** Human-friendly label for the dropdown. */
  label: string;
  /** Grouping bucket for the dropdown's <optgroup>s. */
  group: QuickKeyGroup;
}

/** Display order of the groups in the dropdown. */
export const QUICKKEY_GROUP_ORDER: QuickKeyGroup[] = [
  "Keypad",
  "Transport",
  "Function",
  "Object",
  "Navigation",
  "Special",
];

/**
 * The canonical list. Codes are exactly the array in
 * `pam-OSC.lua > createQuickeysIfNotExists` (107 codes).
 */
export const QUICKKEYS: QuickKeyDef[] = [
  { code: "ALIGN", label: "Align", group: "Function" },
  { code: "ASSIGN", label: "Assign", group: "Function" },
  { code: "ASTERISK", label: "Asterisk (*)", group: "Keypad" },
  { code: "AT", label: "At (@)", group: "Keypad" },
  { code: "BLACK", label: "Black", group: "Function" },
  { code: "BLIND", label: "Blind", group: "Function" },
  { code: "CHANNEL", label: "Channel", group: "Object" },
  { code: "CLEAR", label: "Clear", group: "Function" },
  { code: "COPY", label: "Copy", group: "Function" },
  { code: "CUE", label: "Cue", group: "Object" },
  { code: "DEF_GO", label: "Go (default)", group: "Transport" },
  { code: "DEF_GOBACK", label: "Go Back (default)", group: "Transport" },
  { code: "DEF_PAUSE", label: "Pause (default)", group: "Transport" },
  { code: "DELETE", label: "Delete", group: "Function" },
  { code: "DOT", label: "Dot (.)", group: "Keypad" },
  { code: "DOUBLE_SPEED", label: "Double Speed", group: "Transport" },
  { code: "DOWN", label: "Down", group: "Navigation" },
  { code: "EDIT", label: "Edit", group: "Function" },
  { code: "ESC", label: "Escape", group: "Navigation" },
  { code: "EXECUTOR", label: "Executor", group: "Object" },
  { code: "FIX", label: "Fix", group: "Function" },
  { code: "FIXTURE", label: "Fixture", group: "Object" },
  { code: "FLASH", label: "Flash", group: "Transport" },
  { code: "FLIP", label: "Flip", group: "Function" },
  { code: "FREEZE", label: "Freeze", group: "Transport" },
  { code: "FULL", label: "Full", group: "Keypad" },
  { code: "GO", label: "Go", group: "Transport" },
  { code: "GOBACK", label: "Go Back", group: "Transport" },
  { code: "GOBACKFAST", label: "Go Back Fast", group: "Transport" },
  { code: "GOFAST", label: "Go Fast", group: "Transport" },
  { code: "GOTO", label: "Goto", group: "Transport" },
  { code: "GRID", label: "Grid", group: "Object" },
  { code: "GROUP", label: "Group", group: "Object" },
  { code: "HALF_SPEED", label: "Half Speed", group: "Transport" },
  { code: "HELP", label: "Help", group: "Special" },
  { code: "HIGHLIGHT", label: "Highlight", group: "Function" },
  { code: "IF", label: "If", group: "Function" },
  { code: "KILL", label: "Kill", group: "Transport" },
  { code: "LAYOUT", label: "Layout", group: "Object" },
  { code: "LEARN", label: "Learn", group: "Transport" },
  { code: "LIST", label: "List", group: "Function" },
  { code: "LOAD", label: "Load", group: "Function" },
  { code: "LOWLIGHT", label: "Lowlight", group: "Function" },
  { code: "MA1", label: "MA 1", group: "Special" },
  { code: "MA2", label: "MA 2", group: "Special" },
  { code: "MACRO", label: "Macro", group: "Object" },
  { code: "MENU", label: "Menu", group: "Navigation" },
  { code: "MINUS", label: "Minus (-)", group: "Keypad" },
  { code: "MOVE", label: "Move", group: "Function" },
  { code: "NEXT", label: "Next", group: "Navigation" },
  { code: "NEXT_STEP", label: "Next Step", group: "Navigation" },
  { code: "NEXT_X", label: "Next X", group: "Navigation" },
  { code: "NEXT_Y", label: "Next Y", group: "Navigation" },
  { code: "NEXT_Z", label: "Next Z", group: "Navigation" },
  { code: "NUM0", label: "Numpad 0", group: "Keypad" },
  { code: "NUM1", label: "Numpad 1", group: "Keypad" },
  { code: "NUM2", label: "Numpad 2", group: "Keypad" },
  { code: "NUM3", label: "Numpad 3", group: "Keypad" },
  { code: "NUM4", label: "Numpad 4", group: "Keypad" },
  { code: "NUM5", label: "Numpad 5", group: "Keypad" },
  { code: "NUM6", label: "Numpad 6", group: "Keypad" },
  { code: "NUM7", label: "Numpad 7", group: "Keypad" },
  { code: "NUM8", label: "Numpad 8", group: "Keypad" },
  { code: "NUM9", label: "Numpad 9", group: "Keypad" },
  { code: "OFF", label: "Off", group: "Function" },
  { code: "ON", label: "On", group: "Function" },
  { code: "OOPS", label: "Oops", group: "Special" },
  { code: "PAGE", label: "Page", group: "Object" },
  { code: "PAGE_DOWN", label: "Page Down", group: "Navigation" },
  { code: "PAGE_UP", label: "Page Up", group: "Navigation" },
  { code: "PAUSE", label: "Pause", group: "Transport" },
  { code: "PHASER", label: "Phaser", group: "Object" },
  { code: "PLEASE", label: "Please (Enter)", group: "Keypad" },
  { code: "PLUS", label: "Plus (+)", group: "Keypad" },
  { code: "PRESET", label: "Preset", group: "Object" },
  { code: "PREV", label: "Previous", group: "Navigation" },
  { code: "PREVIEW", label: "Preview", group: "Function" },
  { code: "PREV_STEP", label: "Previous Step", group: "Navigation" },
  { code: "PREV_X", label: "Previous X", group: "Navigation" },
  { code: "PREV_Y", label: "Previous Y", group: "Navigation" },
  { code: "PREV_Z", label: "Previous Z", group: "Navigation" },
  { code: "RATE1", label: "Rate 1", group: "Transport" },
  { code: "RESET_MATRICKS", label: "Reset MAtricks", group: "Special" },
  { code: "SELECT", label: "Select", group: "Function" },
  { code: "SELFIX", label: "Select Fixture", group: "Function" },
  { code: "SEQUENCE", label: "Sequence", group: "Object" },
  { code: "SET", label: "Set", group: "Function" },
  { code: "SLASH", label: "Slash (/)", group: "Keypad" },
  { code: "SOLO", label: "Solo", group: "Function" },
  { code: "STEP", label: "Step", group: "Function" },
  { code: "STOMP", label: "Stomp", group: "Function" },
  { code: "STORE", label: "Store", group: "Function" },
  { code: "SWAP", label: "Swap", group: "Function" },
  { code: "TEMP", label: "Temp", group: "Transport" },
  { code: "THRU", label: "Thru", group: "Keypad" },
  { code: "TIME", label: "Time", group: "Function" },
  { code: "TIMECODE", label: "Timecode", group: "Object" },
  { code: "TOGGLE", label: "Toggle", group: "Function" },
  { code: "TOGGLE_MATRICKS", label: "Toggle MAtricks", group: "Special" },
  { code: "TOGGLE_STEP", label: "Toggle Step", group: "Special" },
  { code: "TOP", label: "Top", group: "Transport" },
  { code: "UP", label: "Up", group: "Navigation" },
  { code: "UPDATE", label: "Update", group: "Function" },
  { code: "USER1", label: "User 1", group: "Object" },
  { code: "USER2", label: "User 2", group: "Object" },
  { code: "VIEW", label: "View", group: "Object" },
  { code: "XKEYS", label: "X-Keys", group: "Special" },
];

/** Fast lookup by code. */
export const QUICKKEY_BY_CODE: ReadonlyMap<string, QuickKeyDef> = new Map(
  QUICKKEYS.map((qk) => [qk.code, qk]),
);

/** True if a code is a known, plugin-created QuickKey. */
export function isKnownQuickKey(code: string): boolean {
  return QUICKKEY_BY_CODE.has(code);
}
