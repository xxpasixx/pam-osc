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

/**
 * PAM-24: a complete MIDI System-Exclusive frame the engine sends to the board
 * on connect (e.g. the APC40 mkII "Introduction message" that switches it into
 * Ableton Live Mode). Opaque to the engine — it just emits the bytes. Framing
 * bytes 0xF0/0xF7 are 240/247, so the array is 0-255; inner data bytes must stay
 * 7-bit. Length is bounded so a shared/user board file can't push a huge buffer.
 */
export const sysexFrameSchema = z
  .array(z.number().int().min(0).max(255))
  .min(2)
  .max(64)
  .superRefine((bytes, ctx) => {
    if (bytes[0] !== 0xf0) {
      ctx.addIssue({ code: "custom", path: [0], message: "SysEx frame must start with 0xF0" });
    }
    if (bytes[bytes.length - 1] !== 0xf7) {
      ctx.addIssue({ code: "custom", path: [bytes.length - 1], message: "SysEx frame must end with 0xF7" });
    }
    for (let i = 1; i < bytes.length - 1; i++) {
      if (bytes[i]! > 127) {
        ctx.addIssue({ code: "custom", path: [i], message: "SysEx data bytes must be 0-127" });
      }
    }
  });

/**
 * PAM-24 AC-8: control-change messages the engine sends on connect, right after
 * initSysEx. Used to configure host-controlled hardware that isn't a mode blob —
 * e.g. the APC40 mkII per-knob LED-ring TYPE (0=off, 1=Single, 2=Volume, 3=Pan).
 * This is where a board sets its ring style, so it is configurable per device.
 * `channel` defaults to 1 when omitted. Bounded so a shared file can't spam.
 */
export const initCcSchema = z
  .array(
    z.strictObject({
      controller: midiValueSchema,
      value: midiValueSchema,
      channel: midiChannelSchema.optional(),
    })
  )
  .max(64);

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

/**
 * Integrated push button of a composite push-encoder (PAM-1 AC-7): its own
 * note/cc address (a press is never pitchbend) and LED capability. One
 * physical knob = one control; mappings address the press via part "push".
 */
export const pushCapabilitySchema = z.strictObject({
  midi: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("cc"), channel: midiChannelSchema.optional(), number: midiValueSchema }),
    z.strictObject({ kind: z.literal("note"), channel: midiChannelSchema.optional(), number: midiValueSchema }),
  ]),
  led: z.enum(["none", "on-off", "velocity-colors"]),
});

export const controlSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...controlBaseShape,
    type: z.literal("fader"),
    capabilities: z.strictObject({ motorized: z.boolean().default(false) }).default({ motorized: false }),
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
      // PAM-20: relative decode mode. "range" (default) is the original
      // X-Touch behaviour driven by increment/decrement windows; "signed" is
      // the Akai two's-complement scheme (1..63 = +, 64..127 = −) that needs no
      // ranges. "note-pair" (PAM-27) is for encoders that fire a note press per
      // detent on two distinct notes: the control's own midi note is clockwise
      // (+1), decrementNote is counter-clockwise (−1) — e.g. the X-Touch
      // Compact MC-mode side encoders 15/16. Additive with a default, so
      // existing files load unchanged.
      encoding: z
        .strictObject({
          mode: z.enum(["range", "signed", "note-pair"]).default("range"),
          increment: encoderRangeSchema.optional(),
          decrement: encoderRangeSchema.optional(),
          decrementNote: midiValueSchema.optional(),
        })
        .superRefine((encoding, ctx) => {
          if (encoding.mode === "range") {
            if (!encoding.increment)
              ctx.addIssue({ code: "custom", path: ["increment"], message: '"range" encoding requires increment' });
            if (!encoding.decrement)
              ctx.addIssue({ code: "custom", path: ["decrement"], message: '"range" encoding requires decrement' });
          }
          if (encoding.mode === "note-pair" && encoding.decrementNote === undefined) {
            ctx.addIssue({
              code: "custom",
              path: ["decrementNote"],
              message: '"note-pair" encoding requires decrementNote (the counter-clockwise note)',
            });
          }
          if (encoding.mode !== "note-pair" && encoding.decrementNote !== undefined) {
            ctx.addIssue({
              code: "custom",
              path: ["decrementNote"],
              message: 'decrementNote is only valid with "note-pair" encoding',
            });
          }
        }),
      // The ring is driven via its own CC number (e.g. X-Touch: encoder on
      // CC 16-23, ring feedback out on CC 48-55), not via a MIDI channel.
      ledRing: z
        .strictObject({
          controller: midiValueSchema,
          from: midiValueSchema,
          to: midiValueSchema,
        })
        .optional(),
      push: pushCapabilitySchema.optional(),
    }),
  }),
  // Displays (scribble strips) are addressed by their slot index via sysex,
  // not by a MIDI note/CC — so they carry an index instead of a midi address.
  // The supported scribble protocol (X-Touch) carries exactly 8 strips, and
  // text offsets must stay 7-bit — the index is bounded accordingly (an
  // unbounded index lets a shared device file freeze the engine).
  z.strictObject({
    id: controlBaseShape.id,
    label: controlBaseShape.label,
    position: controlBaseShape.position,
    type: z.literal("display"),
    index: z.number().int().min(0).max(7),
    capabilities: z.strictObject({
      segments: z.number().int().positive(),
    }),
  }),
]);

export const deviceDefinitionSchema = z
  .strictObject({
    ...envelopeShape,
    manufacturer: z.string().optional(),
    // PAM-10: name of the LED colour palette for velocity-colours buttons
    // (resolved by the engine's palette registry). Absent = no colour mapping.
    ledPalette: z.string().optional(),
    // PAM-21: optional board photo override — a bare filename with an image
    // extension, resolved inside the board's images/ folder. The regex bars
    // path separators and "..", so it can never read outside that folder.
    // Absent = convention lookup (images/<board-id>.{png,jpg,jpeg,webp}).
    image: z
      .string()
      .regex(/^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i, "must be a plain image filename (png/jpg/jpeg/webp)")
      .optional(),
    mode: z.enum(["standard", "mc"]).default("standard"),
    // PAM-28: short user-facing setup steps shown when the board is picked
    // (e.g. how to switch the hardware into the mode this definition expects).
    // Plain text, newlines = steps. Bounded so a shared file can't flood the UI.
    setupInstructions: z.string().min(1).max(1000).optional(),
    // PAM-24: raw SysEx frame sent to the board's MIDI OUT once on every connect
    // (before any other output). Absent = nothing sent. Used to put controllers
    // like the APC40 mkII into a host-controllable mode.
    initSysEx: sysexFrameSchema.optional(),
    // PAM-24 AC-8: control-change messages sent on connect after initSysEx
    // (e.g. per-knob LED-ring style). Absent = none sent.
    initCC: initCcSchema.optional(),
    // PAM-25: boards that lose LED state get their feedback cache replayed
    // periodically by the APP (replaces the v1 console-side resendButtons —
    // a board fact, so it lives on the device, not the mapping).
    resendFeedback: z.boolean().default(false),
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
      // "note-pair" encoders live on note addresses by definition — the two
      // direction notes are what the hardware sends per detent.
      if (control.type === "encoder" && control.capabilities.encoding.mode === "note-pair") {
        if (control.midi.kind !== "note") {
          ctx.addIssue({
            code: "custom",
            path: ["controls", index, "midi", "kind"],
            message: '"note-pair" encoders must use a note midi address (the clockwise note)',
          });
        } else if (control.capabilities.encoding.decrementNote === control.midi.number) {
          ctx.addIssue({
            code: "custom",
            path: ["controls", index, "capabilities", "encoding", "decrementNote"],
            message: "decrementNote must differ from the control's own (clockwise) note",
          });
        }
      }
    });
  });

export type MidiAddress = z.infer<typeof midiAddressSchema>;
export type PushCapability = z.infer<typeof pushCapabilitySchema>;
export type Control = z.infer<typeof controlSchema>;
export type DeviceDefinition = z.infer<typeof deviceDefinitionSchema>;
