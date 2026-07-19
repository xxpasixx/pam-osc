export { CURRENT_FORMAT_VERSION, idSchema } from "./envelope.js";
export {
  deviceDefinitionSchema,
  controlSchema,
  midiAddressSchema,
  type DeviceDefinition,
  type Control,
  type MidiAddress,
} from "./device-definition.js";
export {
  mappingSchema,
  actionSchema,
  feedbackSchema,
  assignmentSchema,
  type Mapping,
  type MappingStatus,
  type Action,
  type Feedback,
  type Assignment,
} from "./mapping.js";
export { loadFormat, type FormatSource, type LoadResult } from "./loader.js";
export { checkCompatibility } from "./compatibility.js";
export type { FormatIssue } from "./issues.js";
export {
  validateDeviceDraft,
  validateMappingDraft,
  controlUsage,
  orphanedAssignments,
  suffixedCopy,
  type EditorIssue,
  type DraftResult,
  type MappingRef,
} from "./editor-rules.js";
