import { useEffect, useState } from "react";
import type { UpdateStatus } from "../../../shared/update.js";

/** PAM-34: live update status from the main process (initial fetch + pushes). */
export function useUpdateStatus(): UpdateStatus | undefined {
  const [status, setStatus] = useState<UpdateStatus | undefined>();
  useEffect(() => {
    let alive = true;
    void window.pamOscUpdates.getStatus().then((initial) => {
      if (alive) setStatus(initial);
    });
    const unsubscribe = window.pamOscUpdates.onStatus(setStatus);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return status;
}
