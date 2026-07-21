import { z } from "zod";
import { envelopeShape, idSchema, midiValueSchema } from "./envelope.js";

/**
 * A mapping binds one device definition to a concrete unit (MIDI port names)
 * and assigns its controls to GrandMA3 actions — pure data, no code (AC-2).
 */

export const actionSchema = z.discriminatedUnion("type", [
  // MA3 executor number on the current page, e.g. 201 (MA3 uses 101-490;
  // the ceiling keeps hostile values out of OSC addresses).
  z.strictObject({ type: z.literal("executor"), number: z.number().int().positive().max(9999) }),
  z.strictObject({ type: z.literal("command"), command: z.string().min(1) }),
  // Triggers the QuickKey named "pam-osc_<KEY>" (created by the Lua plugin).
  z.strictObject({ type: z.literal("quickKey"), key: z.string().min(1) }),
  z.strictObject({ type: z.literal("attribute"), attribute: z.string().min(1) }),
  // Handled inside the app, never sent to MA3 (v1 "local").
  z
    .strictObject({
      type: z.literal("modifier"),
      modifier: z.enum(["encoderFine", "encoderRough", "attributeSelect"]),
      attribute: z.string().min(1).optional(),
    })
    .superRefine((action, ctx) => {
      if (action.modifier === "attributeSelect" && !action.attribute) {
        ctx.addIssue({
          code: "custom",
          path: ["attribute"],
          message: 'modifier "attributeSelect" requires an attribute',
        });
      }
    }),
  // Without a slot the button cycles through slots 0-8 on every press (v1
  // behavior); with a slot it selects exactly that slot.
  z.strictObject({ type: z.literal("timecodeSelect"), slot: z.number().int().min(1).max(8).optional() }),
  z.strictObject({ type: z.literal("timecodePlayPause") }),
  // Executor whose sequence/cue/appearance a display control shows.
  z.strictObject({ type: z.literal("display"), number: z.number().int().positive().max(9999) }),
]);

export const feedbackSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }),
  // Covers every v1 buttonFeedbackMapper: the APC/Launchpad color variants
  // are simply onValue 2/3/5.
  z.strictObject({
    type: z.literal("on-off"),
    onValue: midiValueSchema.default(127),
    offValue: midiValueSchema.default(0),
  }),
  // v1 "permanentFeedback": a fixed value, sent permanently.
  z.strictObject({ type: z.literal("always-on"), value: midiValueSchema }),
  // Motorized fader follows the executor.
  z.strictObject({ type: z.literal("fader-position") }),
  // LED ring on an encoder shows the value.
  z.strictObject({ type: z.literal("encoder-ring") }),
  // PAM-10: an RGB button LED reflects the executor's live MA3 appearance
  // colour (nearest palette entry), lit while the executor runs. The colour
  // arrives from the plugin; only the off value is configurable.
  z.strictObject({ type: z.literal("rgb-color"), offValue: midiValueSchema.default(0) }),
]);

export const assignmentSchema = z.strictObject({
  controlId: z.string().min(1),
  // Composite push-encoders (PAM-1 AC-7): absent = the control's main
  // function; "push" = the encoder's integrated button.
  part: z.literal("push").optional(),
  action: actionSchema,
  options: z
    .strictObject({
      // Velocity threshold below which button input is ignored.
      minValue: midiValueSchema.optional(),
      // Sensitivity per encoder detent for attribute/executor actions
      // (bounded — unbounded values overflow to Infinity in commands).
      amount: z.number().positive().max(1000).optional(),
    })
    .optional(),
  feedback: feedbackSchema.default({ type: "none" }),
});

export const mappingSchema = z
  .strictObject({
    ...envelopeShape,
    deviceDefinitionId: idSchema,
    midiPort: z.strictObject({
      input: z.string().min(1),
      // Input-only boards have no feedback and therefore no output port.
      output: z.string().min(1).optional(),
    }),
    // Maturity/provenance (PAM-19 AC-1): additive with a default, so older
    // files with no status simply load as "draft" — no format-version bump.
    status: z.enum(["draft", "community", "tested"]).default("draft"),
    enableTimecodeSend: z.boolean().default(false),
    // PAM-16 feedback flags — the app OR-merges these across the active
    // mappings and pushes them to the plugin in the config handshake, so the
    // console-side feedback follows the app's configuration. Additive with
    // defaults, so older files load unchanged — no format-version bump.
    // enableTimecodeSend above is reused as the timecode flag.
    sendColors: z.boolean().default(true),
    sendNames: z.boolean().default(true),
    // v1's automaticResendButtons workaround — off by default.
    resendButtons: z.boolean().default(false),
    assignments: z.array(assignmentSchema),
  })
  .superRefine((mapping, ctx) => {
    // Uniqueness key is (controlId, part): a push-encoder carries at most
    // one rotate and one push assignment (PAM-1 AC-7).
    const seen = new Set<string>();
    mapping.assignments.forEach((assignment, index) => {
      const key = `${assignment.controlId}#${assignment.part ?? "main"}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments", index, "controlId"],
          message: `control "${assignment.controlId}"${assignment.part ? ` (${assignment.part})` : ""} is assigned more than once`,
        });
      }
      seen.add(key);
    });
  });

export type Action = z.infer<typeof actionSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Mapping = z.infer<typeof mappingSchema>;
export type MappingStatus = Mapping["status"];
