export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new EngineError("ENGINE_ABORTED", "Generation was cancelled.", true);
}

/**
 * Runs `fn` with a child signal that aborts when the parent aborts or after `ms`.
 * The timer and parent listener are always released, so repeated runs leak no handles.
 * This only cancels work that honors the signal (fetch, body reads); it does not preempt CPU work.
 */
export async function withTimeout<T>(parent: AbortSignal, ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<{ value: T } | { timedOut: true } | { cancelled: true; error: unknown } | { failed: unknown }> {
  abortIfNeeded(parent);
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort(parent.reason);
  const timer = setTimeout(() => { timedOut = true; controller.abort(new Error("timeout")); }, ms);
  parent.addEventListener("abort", onParentAbort, { once: true });
  let onChildAbort = () => undefined as void;
  // Settle at the deadline even if `fn` ignores its signal. That work is detached, not stopped:
  // a noncooperative promise may keep running, so its eventual rejection is swallowed here.
  const aborted = new Promise<never>((_, reject) => { onChildAbort = () => reject(controller.signal.reason); });
  controller.signal.addEventListener("abort", onChildAbort, { once: true });
  const work = fn(controller.signal);
  work.catch(() => undefined);
  try {
    return { value: await Promise.race([work, aborted]) };
  } catch (error) {
    if (parent.aborted) return { cancelled: true, error };
    if (timedOut) return { timedOut: true };
    return { failed: error };
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onParentAbort);
    controller.signal.removeEventListener("abort", onChildAbort);
  }
}
