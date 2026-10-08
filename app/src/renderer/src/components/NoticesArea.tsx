import type { Notice } from "../../../shared/ipc.js";

/** Loader/engine/settings problems, dismissible (design → Notices area). */
export function NoticesArea({
  notices,
  onDismiss,
  onAction,
}: {
  notices: Notice[];
  onDismiss: (index: number) => void;
  /** PAM-9 AC-10: buttons on an action notice. */
  onAction?: (notice: Notice, choice: "install" | "open-ma3") => void;
}) {
  if (notices.length === 0) return null;
  return (
    <div aria-label="Notices">
      {notices.map((notice, index) => (
        <div key={index} className={`notice ${notice.severity}`}>
          {notice.source && <span className="source">{notice.source}</span>}
          <span className="msg">{notice.message}</span>
          {notice.action === "update-ma3-plugin" && onAction && (
            <span className="notice-actions">
              <button className="primary" onClick={() => onAction(notice, "install")}>
                Install now
              </button>
              <button onClick={() => onAction(notice, "open-ma3")}>Open MA3 tab</button>
            </span>
          )}
          <button className="subtle" onClick={() => onDismiss(index)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
