import type { Notice } from "../../../shared/ipc.js";

/** Loader/engine/settings problems, dismissible (design → Notices area). */
export function NoticesArea({ notices, onDismiss }: { notices: Notice[]; onDismiss: (index: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div aria-label="Notices">
      {notices.map((notice, index) => (
        <div key={index} className={`notice ${notice.severity}`}>
          {notice.source && <span className="source">{notice.source}</span>}
          <span className="msg">{notice.message}</span>
          <button className="subtle" onClick={() => onDismiss(index)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
