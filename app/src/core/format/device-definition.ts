import { z } from "zod";
import { envelopeShape, midiChannelSchema, midiValueSchema } from "./envelope.js";

/**
 * A device definition describes a board TYPE (hardware facts only), never a
 * concrete unit — the binding to a real MIDI port happens per mapping.
 */

export const midiAddressSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("cc"),
    channel: midiChannelSchema.optional(),
    number: midiValueSchema,
  }),
  z.strictObject({
    kind: z.literal("note"),
    channel: midiChannelSchema.optional(),
    number: midiValueSchema,
  }),
  // Pitchbend is addressed by its channel alone — no number.
  z.strictObject({
    kind: z.literal("pitchbend"),
    channel: midiChannelSchema.optional(),
  }),
]);

export const positionSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  shape: z.enum(["rect", "circle"]).default("rect"),
});

const controlBaseShape = {
  id: z.string().min(1),
  label: z.string().optional(),
  midi: midiAddressSchema,
  position: positionSchema,
};

/** Raw CC value range the hardware sends per encoder detent. */
const encoderRangeSchema = z.strictObject({
  from: midiValueSchema,
  to: midiValueSchema,
});

export const controlSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...controlBaseShape,
    type: z.literal("fader"),
    capabilities: z
      .strictObject({ motorized: z.boolean().default(false) })
      .default({ motorized: false }),
  }),
  z.strictObject({
    ...controlBaseShape,
    type: z.literal("button"),
    capabilities: z.strictObject({
      led: z.enum(["none", "on-off", "velocity-colors"]),
    }),
  }),
  z.strictObject({
    ...controlBaseShape,
    type: z.literal("encoder"),
    capabilities: z.strictObject({
      encoding: z.strictObject({
        increment: encoderRangeSchema,
        decrement: encoderRangeSchema,
      }),
      ledRing: z
        .strictObject({
          channel: midiChannelSchema,
          from: midiValueSchema,
          to: midiValueSchema,
        })
        .optional(),
    }),
  }),
  z.strictObject({
    ...controlBaseShape,
    type: z.literal("display"),
    capabilities: z.strictObject({
      segments: z.number().int().positive(),
    }),
  }),
]);

export const deviceDefinitionSchema = z
  .strictObject({
    ...envelopeShape,
    manufacturer: z.string().optional(),
    mode: z.enum(["standard", "mc"]).default("standard"),
    defaultMidiChannel: midiChannelSchema.default(1),
    layout: z.strictObject({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
    controls: z.array(controlSchema).min(1),
  })
  .superRefine((device, ctx) => {
    const seen = new Set<string>();
    device.controls.forEach((control, index) => {
      if (seen.has(control.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["controls", index, "id"],
          message: `duplicate control id "${control.id}"`,
        });
      }
      seen.add(control.id);
    });
  });

export type MidiAddress = z.infer<typeof midiAddressSchema>;
export type Control = z.infer<typeof controlSchema>;
export type DeviceDefinition = z.infer<typeof deviceDefinitionSchema>;
