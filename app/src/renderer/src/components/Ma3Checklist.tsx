import { useState, type ReactNode } from "react";
import { nextOpenStep, type ChecklistStep, type StepId } from "../ma3-checklist.js";
import "./ma3-checklist.css";

const TITLES: Record<StepId, string> = {
  files: "Copy the files to GrandMA3",
  osc: "Set up OSC on the console",
  plugin: "Import & start the plugin",
};

/**
 * PAM-36: the MA3 tab as a checklist — one row per step with a status LED
 * and what the app sees right now. Only the next open step is expanded; done
 * steps fold away. Collapsed steps stay MOUNTED (hidden), so the PAM-35 live
 * check inside the plugin step keeps polling (AC-8: one live check).
 */
export function Ma3Checklist({ steps, bodies }: { steps: ChecklistStep[]; bodies: Record<StepId, ReactNode> }) {
  const [overrides, setOverrides] = useState<Partial<Record<StepId, boolean>>>({});
  const auto = nextOpenStep(steps);
  const doneCount = steps.filter((step) => step.status === "done").length;

  return (
    <section className="card checklist" aria-label="MA3 setup checklist">
      <div className="checklist-head">
        <h2>GrandMA3 setup</h2>
        <span className={`checklist-progress ${doneCount === steps.length ? "complete" : ""}`}>
          {doneCount === steps.length ? "All set" : `${doneCount} of ${steps.length} done`}
        </span>
      </div>
      <ol className="checklist-steps">
        {steps.map((step, index) => {
          const open = overrides[step.id] ?? step.id === auto;
          const led = step.status === "done" ? "ok" : step.status === "open" ? "warn" : "";
          return (
            <li key={step.id} className={`checklist-step ${step.status} ${open ? "open" : ""}`}>
              <button
                className="checklist-row"
                aria-expanded={open}
                onClick={() => setOverrides((current) => ({ ...current, [step.id]: !open }))}
              >
                <span className={`led ${led}`} aria-hidden="true" />
                <span className="checklist-number">{index + 1}</span>
                <span className="checklist-text">
                  <span className="checklist-title">{TITLES[step.id]}</span>
                  <span className="checklist-summary">{step.summary}</span>
                </span>
                <span className="checklist-state">{step.status === "done" ? "✓" : ""}</span>
                <span className="checklist-chevron" aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
              </button>
              <div className="checklist-body" hidden={!open}>
                {bodies[step.id]}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
