import type { ConsoleSettings } from "../../../core/settings/schema.js";
import type { FieldError } from "../../../shared/ipc.js";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

const errorIn = (errors: FieldError[], field: string) => errors.find((error) => error.field === field)?.message;

/** The console IP field — shared by the Setup tab and the wizard's "Where is your MA3?" step (PAM-35 AC-3). */
export function ConsoleAddressField({
  console: consoleSettings,
  errors,
  onChange,
}: {
  console: ConsoleSettings;
  errors: FieldError[];
  onChange: (console: ConsoleSettings) => void;
}) {
  return (
    <Field id="console-address" label="Console IP / hostname" error={errorIn(errors, "console.address")}>
      <input
        id="console-address"
        value={consoleSettings.address}
        spellCheck={false}
        onChange={(event) => onChange({ ...consoleSettings, address: event.target.value })}
      />
    </Field>
  );
}

/** Send/receive port fields; the labels say which side listens (PAM-35 AC-11). */
export function ConsolePortFields({
  console: consoleSettings,
  errors,
  onChange,
}: {
  console: ConsoleSettings;
  errors: FieldError[];
  onChange: (console: ConsoleSettings) => void;
}) {
  const setPort = (key: "sendPort" | "receivePort", raw: string) => {
    // Digits only — "9003x" must not silently become 9003.
    if (!/^\d*$/.test(raw)) return;
    onChange({ ...consoleSettings, [key]: raw === "" ? 0 : Number.parseInt(raw, 10) });
  };
  return (
    <>
      <Field id="console-send-port" label="Send port — MA3 listens here" error={errorIn(errors, "console.sendPort")}>
        <input
          id="console-send-port"
          inputMode="numeric"
          value={consoleSettings.sendPort === 0 ? "" : String(consoleSettings.sendPort)}
          onChange={(event) => setPort("sendPort", event.target.value)}
        />
      </Field>
      <Field
        id="console-receive-port"
        label="Receive port — pam-osc listens here (feedback)"
        error={errorIn(errors, "console.receivePort")}
      >
        <input
          id="console-receive-port"
          inputMode="numeric"
          value={consoleSettings.receivePort === 0 ? "" : String(consoleSettings.receivePort)}
          onChange={(event) => setPort("receivePort", event.target.value)}
        />
      </Field>
    </>
  );
}

export function ConsoleSection({
  console: consoleSettings,
  fixedPage,
  errors,
  onChange,
  onFixedPageChange,
}: {
  console: ConsoleSettings;
  /** PAM-16 global fixed executor page; undefined = follow the current page. */
  fixedPage?: number;
  errors: FieldError[];
  onChange: (console: ConsoleSettings) => void;
  onFixedPageChange?: (fixedPage: number | undefined) => void;
}) {
  const setFixedPage = (raw: string) => {
    if (!/^\d*$/.test(raw)) return; // digits only
    onFixedPageChange?.(raw === "" ? undefined : Math.min(Number.parseInt(raw, 10), 9999));
  };

  return (
    <section className="card" aria-label="Console connection">
      <h2>GrandMA3 console</h2>
      <div className="form-row">
        <ConsoleAddressField console={consoleSettings} errors={errors} onChange={onChange} />
        <ConsolePortFields console={consoleSettings} errors={errors} onChange={onChange} />
        {onFixedPageChange && (
          <Field
            id="console-fixed-page"
            label="Fixed page (empty = follow console)"
            error={errorIn(errors, "fixedPage")}
          >
            <input
              id="console-fixed-page"
              inputMode="numeric"
              placeholder="follow current"
              value={fixedPage === undefined ? "" : String(fixedPage)}
              onChange={(event) => setFixedPage(event.target.value)}
            />
          </Field>
        )}
      </div>
    </section>
  );
}
