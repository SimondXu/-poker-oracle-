/**
 * Ordered event gate for the table. `run` applies an update now, or queues it while the table is
 * holding a moment (the action that closed a street, a fresh deal). `hold(ms, then)` starts such a
 * moment; `then` runs first when it ends, before anything that was already waiting, and every
 * queued update is applied in arrival order. Pure apart from the injected timer.
 */
export interface HoldQueue {
  run: (apply: () => void) => void;
  hold: (ms: number, then?: () => void) => void;
  clear: () => void;
}

export function createHoldQueue(
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): HoldQueue {
  let timer: unknown = null;
  let queue: Array<() => void> = [];

  const release = () => {
    timer = null;
    // A step may start a new hold; stop there and keep the rest (in order) for after it.
    while (timer === null && queue.length > 0) {
      queue.shift()?.();
    }
  };

  return {
    run(apply) {
      if (timer !== null) queue.push(apply);
      else apply();
    },
    hold(ms, then) {
      if (timer !== null) timers.clear(timer);
      timer = timers.set(release, ms);
      if (then) queue.unshift(then);
    },
    clear() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      queue = [];
    },
  };
}
