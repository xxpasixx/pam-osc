import { z } from "zod";

/** Highest file format version this build understands. */
export const CURRENT_FORMAT_VERSION = 1;

/** kebab-case identifier, unique within its file type. */
export const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be kebab-case (lowercase letters, digits, dashes)");

/** Fields shared by every pam-osc file. */
export const envelopeShape = {
  formatVersion: z.number().int().positive(),
  id: idSchema,
  name: z.string().min(1),
  notes: z.string().optional(),
};

export const midiChannelSchema = z.number().int().min(1).max(16);
export const midiValueSchema = z.number().int().min(0).max(127);
