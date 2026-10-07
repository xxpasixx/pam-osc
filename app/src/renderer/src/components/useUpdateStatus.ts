import { useEffect, useState } from "react";
import type { UpdateStatus } from "../../../shared/update.js";

/** PAM-34: live update status from the main process (initial fetch + pushes). */
export function useUpdateStatus(): UpdateStatus | undefined {
  const [status, setStatus] = useState<UpdateStatus | undefined>();
  useEffect(() => {
    let alive = true;
    // Retry once: a request racing the main process start-up must not leave
    // the Updates section hidden (review BUG-3).
    const load = (attempt: number) =>
      window.pamOscUpdates.getStatus().then(
        (initial) => {
          if (alive) setStatus(initial);
        },
        () => {
          if (alive && attempt === 0) setTimeout(() => void load(1), 1000);
        }
      );
    void load(0);
    const unsubscribe = window.pamOscUpdates.onStatus(setStatus);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return status;
}
