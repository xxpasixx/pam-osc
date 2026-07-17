import type { Action, Assignment, Control, Feedback } from "../../../../core/format/index.js";
import type { EditorIssue } from "../../../../core/format/index.js";

/**
 * Mapping mode inspector (design → Inspector panel): action, options, and
 * feedback for the selected control — feedback choices filtered by the
 * control's capabilities (AC-2).
 */

type ActionType = Action["type"];
type FeedbackType = Feedback["type"];

const ACTION_LABELS: Record<ActionType, string> = {
  executor: "Executor",
  command: "Command",
  quickKey: "QuickKey",
  attribute: "Attribute",
  modifier: "Modifier (app-local)",
  timecodeSelect: "Timecode: select slot",
  timecodePlayPause: "Timecode: play/pause",
  display: "Display an executor",
};

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  none: "None",
  "on-off": "LED on/off",
  "always-on": "LED always on",
  "fader-position": "Motor fader follows",
  "encoder-ring": "LED ring shows value",
};

function actionTypesFor(control: Control): ActionType[] {
  if (control.type === "display") return ["display"];
  return ["executor", "command", "quickKey", "attribute", "modifier", "timecodeSelect", "timecodePlayPause"];
}

function feedbackTypesFor(control: Control): FeedbackType[] {
  const types: FeedbackType[] = ["none"];
  if (control.type === "button" && control.capabilities.led !== "none") types.push("on-off", "always-on");
  if (control.type === "fader" && control.capabilities.motorized) types.push("fader-position");
  if (control.type === "encoder" && control.capabilities.ledRing) types.push("encoder-ring");
  return types;
}

function defaultAction(type: ActionType): Action {
  switch (type) {
    case "executor":
      return { type, number: 201 };
    case "command":
      return { type, command: "" };
    case "quickKey":
      return { type, key: "" };
    case "attribute":
      return { type, attribute: "" };
    case "modifier":
      return { type, modifier: "encoderFine" };
    case "timecodeSelect":
      return { type };
    case "timecodePlayPause":
      return { type };
    case "display":
      return { type, number: 201 };
  }
}

function defaultFeedback(type: FeedbackType): Feedback {
  switch (type) {
    case "none":
      return { type };
    case "on-off":
      return { type, onValue: 127, offValue: 0 };
    case "always-on":
      return { type, value: 127 };
    case "fader-position":
      return { type };
    case "encoder-ring":
      return { type };
  }
}

/** Text input that maps to an optional 0-127 integer (digits only, PAM-3 style). */
function MidiValueField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="numeric"
        value={value ?? ""}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits === "" ? undefined : Math.min(Number(digits), 127));
        }}
      />
    </div>
  );
}

export function MappingInspector({
  control,
  part,
  assignment,
  issues,
  onChange,
}: {
  /** For part "push" this is the button VIEW of the push declaration (AC-9). */
  control: Control;
  part: "push" | undefined;
  assignment: Assignment | undefined;
  issues: EditorIssue[];
  onChange: (assignment: Assignment | undefined) => void;
}) {
  const addressText =
    control.type === "display"
      ? `display slot ${control.index}`
      : control.midi.kind === "pitchbend"
        ? `pitchbend · ch ${control.midi.channel ?? "default"}`
        : `${control.midi.kind} ${control.midi.number} · ch ${control.midi.channel ?? "default"}`;

  const update = (patch: Partial<Assignment>) => {
    if (!assignment) return;
    onChange({ ...assignment, ...patch });
  };

  return (
    <div className="inspector">
      <h3>
        {control.label ?? control.id}
        {part === "push" ? " — push" : ""}
      </h3>
      <p className="inspector-meta mono">
        {part === "push" ? "push button" : control.type} · {addressText}
      </p>

      {!assignment && (
        <>
          <p className="empty-state">Nothing assigned to this {part === "push" ? "push button" : "control"}.</p>
          <button
            className="primary"
            onClick={() =>
              onChange({
                controlId: control.id,
                ...(part ? { part } : {}),
                action: defaultAction(actionTypesFor(control)[0]!),
                feedback: defaultFeedback("none"),
              })
            }
          >
            + Assign
          </button>
        </>
      )}

      {assignment && (
        <>
          <div className="field">
            <label htmlFor="action-type">Action</label>
            <select
              id="action-type"
              value={assignment.action.type}
              onChange={(event) => update({ action: defaultAction(event.target.value as ActionType) })}
            >
              {actionTypesFor(control).map((type) => (
                <option key={type} value={type}>
                  {ACTION_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {(assignment.action.type === "executor" || assignment.action.type === "display") && (
            <div className="field">
              <label htmlFor="action-number">Executor number</label>
              <input
                id="action-number"
                inputMode="numeric"
                value={assignment.action.number || ""}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
                  update({ action: { ...assignment.action, number: Number(digits) } as Action });
                }}
              />
            </div>
          )}
          {assignment.action.type === "command" && (
            <div className="field">
              <label htmlFor="action-command">MA3 command</label>
              <input
                id="action-command"
                value={assignment.action.command}
                onChange={(event) => update({ action: { type: "command", command: event.target.value } })}
              />
            </div>
          )}
          {assignment.action.type === "quickKey" && (
            <div className="field">
              <label htmlFor="action-key">QuickKey (pam-osc_&lt;KEY&gt;)</label>
              <input
                id="action-key"
                value={assignment.action.key}
                onChange={(event) => update({ action: { type: "quickKey", key: event.target.value } })}
              />
            </div>
          )}
          {assignment.action.type === "attribute" && (
            <div className="field">
              <label htmlFor="action-attribute">Attribute (e.g. dimmer, pan)</label>
              <input
                id="action-attribute"
                value={assignment.action.attribute}
                onChange={(event) => update({ action: { type: "attribute", attribute: event.target.value } })}
              />
            </div>
          )}
          {assignment.action.type === "modifier" && (
            <>
              <div className="field">
                <label htmlFor="action-modifier">Modifier</label>
                <select
                  id="action-modifier"
                  value={assignment.action.modifier}
                  onChange={(event) => {
                    const modifier = event.target.value as "encoderFine" | "encoderRough" | "attributeSelect";
                    update({
                      action:
                        modifier === "attributeSelect"
                          ? { type: "modifier", modifier, attribute: "" }
                          : { type: "modifier", modifier },
                    });
                  }}
                >
                  <option value="encoderFine">encoderFine</option>
                  <option value="encoderRough">encoderRough</option>
                  <option value="attributeSelect">attributeSelect</option>
                </select>
              </div>
              {assignment.action.modifier === "attributeSelect" && (
                <div className="field">
                  <label htmlFor="modifier-attribute">Attribute to select</label>
                  <input
                    id="modifier-attribute"
                    value={assignment.action.attribute ?? ""}
                    onChange={(event) =>
                      update({
                        action: { type: "modifier", modifier: "attributeSelect", attribute: event.target.value },
                      })
                    }
                  />
                </div>
              )}
            </>
          )}
          {assignment.action.type === "timecodeSelect" && (
            <div className="field">
              <label htmlFor="action-slot">Slot (empty = cycle 0–8)</label>
              <input
                id="action-slot"
                inputMode="numeric"
                value={assignment.action.slot ?? ""}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "").slice(0, 1);
                  update({
                    action: { type: "timecodeSelect", slot: digits === "" ? undefined : Number(digits) },
                  });
                }}
              />
            </div>
          )}

          {control.type === "button" && (
            <MidiValueField
              id="option-minvalue"
              label="Min velocity (ignore below)"
              value={assignment.options?.minValue}
              onChange={(minValue) =>
                update({
                  options:
                    minValue === undefined && assignment.options?.amount === undefined
                      ? undefined
                      : { ...assignment.options, minValue },
                })
              }
            />
          )}
          {control.type === "encoder" && (
            <div className="field">
              <label htmlFor="option-amount">Sensitivity per detent</label>
              <input
                id="option-amount"
                inputMode="decimal"
                value={assignment.options?.amount ?? ""}
                onChange={(event) => {
                  const cleaned = event.target.value.replace(/[^\d.]/g, "");
                  const amount = cleaned === "" ? undefined : Number(cleaned);
                  update({
                    options:
                      amount === undefined && assignment.options?.minValue === undefined
                        ? undefined
                        : { ...assignment.options, amount },
                  });
                }}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="feedback-type">Feedback</label>
            <select
              id="feedback-type"
              value={assignment.feedback.type}
              onChange={(event) => update({ feedback: defaultFeedback(event.target.value as FeedbackType) })}
            >
              {feedbackTypesFor(control).map((type) => (
                <option key={type} value={type}>
                  {FEEDBACK_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          {assignment.feedback.type === "on-off" && (
            <div className="form-row">
              <MidiValueField
                id="fb-on"
                label="On value"
                value={assignment.feedback.onValue}
                onChange={(onValue) =>
                  update({
                    feedback: {
                      type: "on-off",
                      onValue: onValue ?? 127,
                      offValue: assignment.feedback.type === "on-off" ? assignment.feedback.offValue : 0,
                    },
                  })
                }
              />
              <MidiValueField
                id="fb-off"
                label="Off value"
                value={assignment.feedback.offValue}
                onChange={(offValue) =>
                  update({
                    feedback: {
                      type: "on-off",
                      onValue: assignment.feedback.type === "on-off" ? assignment.feedback.onValue : 127,
                      offValue: offValue ?? 0,
                    },
                  })
                }
              />
            </div>
          )}
          {assignment.feedback.type === "always-on" && (
            <MidiValueField
              id="fb-value"
              label="Value"
              value={assignment.feedback.value}
              onChange={(value) => update({ feedback: { type: "always-on", value: value ?? 127 } })}
            />
          )}

          {issues.length > 0 && (
            <ul className="inspector-errors">
              {issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          )}

          <div className="inspector-actions">
            <button className="subtle danger" onClick={() => onChange(undefined)}>
              Remove assignment
            </button>
          </div>
        </>
      )}
    </div>
  );
}
