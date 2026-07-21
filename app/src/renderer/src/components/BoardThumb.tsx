import { useEffect, useState } from "react";

/**
 * PAM-21: a board's photo (user-supplied, licence-clean). Fetches the image as
 * a data URL from the main process once per board; shows a neutral placeholder
 * until a `images/<board-id>.{png,jpg,jpeg,webp}` file exists — never a broken
 * image (AC-3).
 */
export function BoardThumb({ boardId, size = "md" }: { boardId: string; size?: "sm" | "md" }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    void window.pamOsc.getDeviceImage(boardId).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [boardId]);

  return (
    <div className={`board-thumb board-thumb--${size}${src ? "" : " board-thumb--empty"}`}>
      {src ? <img src={src} alt="" /> : <span className="board-thumb-ph">no photo</span>}
    </div>
  );
}
