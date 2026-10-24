import type { NotificationRecord, OutputKind, TaskEvent, TaskStatus, TaskSummary } from "@afterhours/contracts";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  planning: "Planning",
  running: "Generating",
  needs_input: "Needs input",
  ready: "Ready for review",
  approved: "Marked reviewed",
  dismissed: "Dismissed",
  failed: "Failed",
  skipped: "Skipped",
};

export const OUTPUT_LABEL: Record<OutputKind, string> = {
  proposal: "Proposal (DOCX)",
  report: "Report (DOCX)",
  presentation: "Presentation (PPTX)",
};

export const STAGE_LABEL: Record<TaskEvent["stage"], string> = {
  intake: "Reading request",
  plan: "Planning work",
  extract: "Extracting sources",
  generate: "Generating content",
  verify: "Checking sources",
  export: "Exporting files",
  notify: "Notification",
  review: "Review",
};

export const ACTIVE_STATUSES: TaskStatus[] = ["queued", "planning", "running"];
export const isActive = (s: TaskStatus) => ACTIVE_STATUSES.includes(s);

export type QueueFilter = "all" | "ready" | "active" | "needs_input" | "failed" | "done";

export const FILTERS: Array<{ id: QueueFilter; label: string; statuses: TaskStatus[] | null }> = [
  { id: "all", label: "All", statuses: null },
  { id: "ready", label: "Ready for review", statuses: ["ready"] },
  { id: "active", label: "In progress", statuses: ACTIVE_STATUSES },
  { id: "needs_input", label: "Needs input", statuses: ["needs_input"] },
  { id: "failed", label: "Failed", statuses: ["failed"] },
  { id: "done", label: "Completed / archived", statuses: ["approved", "dismissed", "skipped"] },
];

/** Default order: results to review first, then active, then needing input, then everything else. */
const RANK: Record<TaskStatus, number> = {
  ready: 0, running: 1, planning: 1, queued: 1, needs_input: 2, failed: 3, skipped: 4, approved: 5, dismissed: 5,
};
export function sortForQueue(tasks: TaskSummary[]): TaskSummary[] {
  return [...tasks].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

export const NOTIFICATION_STATE: Record<NotificationRecord["state"], { label: string; detail: string }> = {
  queued: { label: "Queued", detail: "Waiting for its scheduled time. Nothing has been sent yet." },
  simulated: { label: "Simulated (outbox)", detail: "Shown here only. This message was not sent to any phone or inbox." },
  accepted: { label: "Accepted by provider", detail: "The provider accepted the request. Delivery to the phone is not confirmed." },
  delivered: { label: "Delivered", detail: "The provider confirmed delivery." },
  blocked: { label: "Blocked", detail: "Not sent. The reason is shown below. The result is still available in the queue." },
  failed: { label: "Failed", detail: "Sending failed. The result is still available in the queue." },
};

/** Failed-task error codes that mean "server configuration is missing", where retrying alone will not help. */
export function isConfigError(code: string | undefined): boolean {
  return !!code && /NOT_CONFIGURED|MISSING_CONFIG|NO_CREDENTIALS/.test(code);
}
