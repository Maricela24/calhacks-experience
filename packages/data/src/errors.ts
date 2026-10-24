/** Typed domain failure surfaced by the API as a safe error envelope. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} not found`, 404);
export const staleRevision = (current: number) =>
  new DomainError(
    "STALE_REVISION",
    "This task changed since you loaded it. Refresh to see the current revision.",
    409,
    { currentRevision: current },
  );
export const invalidTransition = (from: string, to: string) =>
  new DomainError("INVALID_TRANSITION", `Cannot move a ${from} task to ${to}.`, 409);
export const badRequest = (message: string, details?: unknown) =>
  new DomainError("VALIDATION_ERROR", message, 400, details);
