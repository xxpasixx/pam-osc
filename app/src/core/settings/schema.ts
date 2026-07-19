import { z } from "zod";

/**
 * App Settings (docs/data-model.md) — one settings.json in the OS userData
 * folder. Persists the console connection and WHICH mappings are active;
 * the MIDI port binding itself lives in the mapping files (PAM-1 AC-2,
 * copy-on-activate — see PAM-3 design).
 */

export const SETTINGS_FORMAT_VERSION = 1;

const portSchema = z.number().int().min(1).max(65535);

export const consoleSettingsSchema = z.strictObject({
  address: z.string().min(1),
  sendPort: portSchema,
  receivePort: portSchema,
});

const windowBoundsSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

// PAM-14: first-run wizard marker. Optional & additive — an older file simply
// lacks it and is treated as "never completed" (absent = not done); no format
// version bump is needed.
const onboardingSchema = z.strictObject({ completed: z.boolean() });

export const persistedSettingsSchema = z.strictObject({
  formatVersion: z.number().int().positive(),
  console: consoleSettingsSchema,
  activeMappingIds: z.array(z.string().min(1)),
  // Written on close outside the Save transaction — never dirties the form.
  ui: z.strictObject({ windowBounds: windowBoundsSchema.optional() }).optional(),
  // PAM-14: set once the user finishes OR skips the setup wizard.
  onboarding: onboardingSchema.optional(),
  // PAM-16: global fixed executor page (1..9999) pushed to the plugin in the
  // config handshake. Absent = follow the console's current page (default).
  // Global, not per mapping, so two active mappings can't demand different
  // pages. Additive & optional — an older file simply lacks it; no bump.
  fixedPage: z.number().int().min(1).max(9999).optional(),
});

export type ConsoleSettings = z.infer<typeof consoleSettingsSchema>;
export type PersistedSettings = z.infer<typeof persistedSettingsSchema>;
export type WindowBounds = z.infer<typeof windowBoundsSchema>;
export type Onboarding = z.infer<typeof onboardingSchema>;

/**
 * PAM-14 AC-1/AC-2: the wizard auto-opens until the user finishes or skips it.
 * Absence of the flag (older files, first launch) means "not completed".
 */
export function isOnboardingCompleted(settings: Pick<PersistedSettings, "onboarding">): boolean {
  return settings.onboarding?.completed === true;
}

/** v1 defaults (OpenStageControlConfig.config) — onPC on the same machine. */
export function defaultSettings(): PersistedSettings {
  return {
    formatVersion: SETTINGS_FORMAT_VERSION,
    console: { address: "127.0.0.1", sendPort: 9003, receivePort: 9004 },
    activeMappingIds: [],
  };
}

/**
 * What the renderer edits and applySettings receives: console plus the
 * active mappings *with* their port choices (the ports are written into the
 * mapping files on Save — copy-on-activate).
 */
export interface ActiveMappingDraft {
  id: string;
  input: string;
  output?: string;
}

export interface SettingsDraft {
  console: ConsoleSettings;
  activeMappings: ActiveMappingDraft[];
  // PAM-16: global fixed executor page; undefined = follow the current page.
  fixedPage?: number;
}
