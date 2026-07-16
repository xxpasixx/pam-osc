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
]);

export const assignmentSchema = z.strictObject({
  controlId: z.string().min(1),
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
    enableTimecodeSend: z.boolean().default(false),
    assignments: z.array(assignmentSchema),
  })
  .superRefine((mapping, ctx) => {
    const seen = new Set<string>();
    mapping.assignments.forEach((assignment, index) => {
      if (seen.has(assignment.controlId)) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments", index, "controlId"],
          message: `control "${assignment.controlId}" is assigned more than once`,
        });
      }
      seen.add(assignment.controlId);
    });
  });

export type Action = z.infer<typeof actionSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Mapping = z.infer<typeof mappingSchema>;
