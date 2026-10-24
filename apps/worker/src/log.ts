export type Logger = (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void;

/** JSON-line logger. Callers pass only safe fields (IDs, stages, durations, error codes). */
export const consoleLogger: Logger = (level, event, fields = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  (level === "error" ? console.error : console.log)(line);
};
