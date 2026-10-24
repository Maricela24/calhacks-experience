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
