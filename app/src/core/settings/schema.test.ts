import { describe, expect, it } from "vitest";
import { defaultSettings, isOnboardingCompleted, persistedSettingsSchema } from "./schema.js";

/**
 * PAM-14: the wizard auto-opens whenever onboarding is not completed. The
 * decision is `!isOnboardingCompleted(...)` — cover its three inputs plus the
 * additive/optional parsing that keeps old files valid.
 */
describe("onboarding flag (PAM-14 AC-1/AC-2)", () => {
  it("absent flag → not completed (older files, first launch)", () => {
    expect(isOnboardingCompleted(defaultSettings())).toBe(false);
    expect(isOnboardingCompleted({ onboarding: undefined })).toBe(false);
  });

  it("completed: false → not completed", () => {
    expect(isOnboardingCompleted({ onboarding: { completed: false } })).toBe(false);
  });

  it("completed: true → completed", () => {
    expect(isOnboardingCompleted({ onboarding: { completed: true } })).toBe(true);
  });

  it("schema accepts a file without onboarding (additive, no version bump)", () => {
    const parsed = persistedSettingsSchema.safeParse({
      formatVersion: 1,
      console: { address: "127.0.0.1", sendPort: 9003, receivePort: 9004 },
      activeMappingIds: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts and round-trips the onboarding object", () => {
    const parsed = persistedSettingsSchema.safeParse({
      formatVersion: 1,
      console: { address: "127.0.0.1", sendPort: 9003, receivePort: 9004 },
      activeMappingIds: [],
      onboarding: { completed: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.onboarding).toEqual({ completed: true });
  });
});
