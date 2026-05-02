/**
 * Cross-browser idle scheduling. Safari does not implement
 * `requestIdleCallback`; this falls back to a 50ms setTimeout, which
 * is good enough for "run after the AnalysisPage has settled".
 *
 * Returns a handle suitable for `cancelIdle(handle)`.
 */
export type IdleHandle = number;

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type IdleCallback = (deadline: IdleDeadline) => void;

const hasNativeRIC =
  typeof window !== 'undefined' &&
  typeof (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback === 'function';

export function scheduleIdle(cb: IdleCallback): IdleHandle {
  if (hasNativeRIC) {
    return (window as Window & { requestIdleCallback: (cb: IdleCallback) => number })
      .requestIdleCallback(cb);
  }
  // Safari fallback — give first paint room before firing.
  return window.setTimeout(() => {
    cb({ didTimeout: false, timeRemaining: () => 16 });
  }, 50);
}

export function cancelIdle(handle: IdleHandle): void {
  if (hasNativeRIC) {
    (window as Window & { cancelIdleCallback: (h: number) => void })
      .cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}
