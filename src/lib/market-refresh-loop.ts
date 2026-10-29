/** One timer per mounted consumer; an in-flight request is allowed to finish. */
export function startMarketRefreshLoop({
  refresh,
  isVisible,
  initiallyDue,
}: {
  refresh: () => Promise<number>;
  isVisible: () => boolean;
  initiallyDue: boolean;
}) {
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextAttempt = initiallyDue ? 0 : Date.now() + 60_000;

  function schedule() {
    clearTimeout(timer);
    if (!disposed && !running && isVisible()) {
      timer = setTimeout(
        () => void run(),
        Math.max(0, nextAttempt - Date.now()),
      );
    }
  }

  async function run() {
    if (disposed || running || !isVisible()) return;
    running = true;
    let delay = 60_000;
    try {
      delay = Math.max(delay, await refresh());
    } catch {
      /* The caller displays the error; keep automatic retries bounded. */
    } finally {
      running = false;
      nextAttempt = Date.now() + delay;
      schedule();
    }
  }

  schedule();
  return {
    onVisibility: schedule,
    retry: () => {
      nextAttempt = 0;
      schedule();
    },
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
