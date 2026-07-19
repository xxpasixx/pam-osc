import type { ActiveMappingDraft } from "../../core/settings/schema.js";
import type { EngineState } from "../../shared/ipc.js";

/**
 * PAM-14: the wizard's pure decision logic, extracted from the components so it
 * is unit-testable without a renderer harness (BUG-2). The App/SetupWizard
 * components call these — they are the single source of truth, so the tests
 * cover the code that actually runs, not a copy.
 */

/** Minimal shape of the onboarding marker carried on the snapshot / settings. */
export type OnboardingMarker = { completed: boolean } | undefined;

/**
 * AC-1: the wizard auto-opens on first launch. This is decided ONLY from the
 * initial snapshot (App calls it once in loadSnapshot) — a post-save snapshot
 * adopt never re-evaluates it, so completing setup and saving cannot reopen the
 * wizard. Absent/false flag → open; explicit `completed: true` → stay closed.
 */
export function shouldAutoOpenWizard(onboarding: OnboardingMarker): boolean {
  return onboarding?.completed !== true;
}

/** A catalog-ish entry carrying the MIDI port binding stored in its file. */
type PortedEntry = { id: string; midiPort: { input: string; output?: string } };

/**
 * AC-3 / BUG-1: activate a catalog entry in the draft's active-mappings list —
 * the SAME path the bundled-board pick and the duplicate flow use, so a v1
 * import ends the controller step with an active mapping (Next enables). Idempotent:
 * an id already active is left untouched (harmless from the normal tabbed import).
 */
export function activateCatalogEntry(
  activeMappings: ActiveMappingDraft[],
  entry: PortedEntry
): ActiveMappingDraft[] {
  if (activeMappings.some((mapping) => mapping.id === entry.id)) return activeMappings;
  return [...activeMappings, { id: entry.id, input: entry.midiPort.input, output: entry.midiPort.output }];
}

/**
 * AC-8: reaching the verify step auto-starts the bridge so a first-run user
 * never has to discover the Status tab — but only when the engine is idle AND
 * something is bound to bridge.
 */
export function shouldAutoStartEngine(input: {
  onVerifyStep: boolean;
  engineState: EngineState;
  activeMappingCount: number;
}): boolean {
  return input.onVerifyStep && input.engineState === "stopped" && input.activeMappingCount > 0;
}
