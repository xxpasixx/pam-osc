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

export function ConsoleSection({
  console: consoleSettings,
  fixedPage,
  errors,
  onChange,
  onFixedPageChange,
}: {
  console: ConsoleSettings;
  /** PAM-16 global fixed executor page; undefined = follow the current page.
   *  Optional — the first-run wizard omits it (only the full Setup shows it). */
  fixedPage?: number;
  errors: FieldError[];
  onChange: (console: ConsoleSettings) => void;
  onFixedPageChange?: (fixedPage: number | undefined) => void;
}) {
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;
  const setPort = (key: "sendPort" | "receivePort", raw: string) => {
    // Digits only — "9003x" must not silently become 9003.
    if (!/^\d*$/.test(raw)) return;
    onChange({ ...consoleSettings, [key]: raw === "" ? 0 : Number.parseInt(raw, 10) });
  };
  const setFixedPage = (raw: string) => {
    if (!/^\d*$/.test(raw)) return; // digits only
    onFixedPageChange?.(raw === "" ? undefined : Math.min(Number.parseInt(raw, 10), 9999));
  };

  return (
    <section className="card" aria-label="Console connection">
      <h2>GrandMA3 console</h2>
      <div className="form-row">
        <Field id="console-address" label="Console IP / hostname" error={errorFor("console.address")}>
          <input
            id="console-address"
            value={consoleSettings.address}
            spellCheck={false}
            onChange={(event) => onChange({ ...consoleSettings, address: event.target.value })}
          />
        </Field>
        <Field id="console-send-port" label="Send port (console listens)" error={errorFor("console.sendPort")}>
          <input
            id="console-send-port"
            inputMode="numeric"
            value={consoleSettings.sendPort === 0 ? "" : String(consoleSettings.sendPort)}
            onChange={(event) => setPort("sendPort", event.target.value)}
          />
        </Field>
        <Field id="console-receive-port" label="Receive port (feedback)" error={errorFor("console.receivePort")}>
          <input
            id="console-receive-port"
            inputMode="numeric"
            value={consoleSettings.receivePort === 0 ? "" : String(consoleSettings.receivePort)}
            onChange={(event) => setPort("receivePort", event.target.value)}
          />
        </Field>
        {onFixedPageChange && (
          <Field id="console-fixed-page" label="Fixed page (empty = follow console)" error={errorFor("fixedPage")}>
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
