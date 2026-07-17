import type { Control } from "./device-definition.js";
import type { Assignment } from "./mapping.js";

/**
 * Action/feedback rules a control's capabilities must support. Shared by the
 * loader (cross-validation) and the PAM-6 editor rules — browser-safe, so
 * the renderer can validate live without pulling in the Node loader.
 */
export function checkCompatibility(assignment: Assignment, control: Control): string | undefined {
  if (assignment.action.type === "display" && control.type !== "display") {
    return `action "display" is only valid on display controls, "${control.id}" is a ${control.type}`;
  }
  if (control.type === "display" && assignment.action.type !== "display") {
    return `display control "${control.id}" only supports the "display" action`;
  }

  const feedback = assignment.feedback;
  switch (feedback.type) {
    case "fader-position":
      if (control.type !== "fader" || !control.capabilities.motorized) {
        return `feedback "fader-position" needs a motorized fader, "${control.id}" is not one`;
      }
      return undefined;
    case "encoder-ring":
      if (control.type !== "encoder" || !control.capabilities.ledRing) {
        return `feedback "encoder-ring" needs an encoder with an LED ring, "${control.id}" has none`;
      }
      return undefined;
    case "on-off":
    case "always-on":
      if (control.type !== "button" || control.capabilities.led === "none") {
        return `feedback "${feedback.type}" needs a button with an LED, "${control.id}" has none`;
      }
      return undefined;
    case "none":
      return undefined;
  }
}
