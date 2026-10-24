import Link from "next/link";
import type { NotificationRecord } from "@afterhours/contracts";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_STATE } from "@/lib/labels";
import { NotificationStateBadge } from "./badges";

export function NotificationRow({ record, timeZone }: { record: NotificationRecord; timeZone?: string }) {
  const digest = record.taskId === null;
  return (
    <article className="card notif" aria-label={`Notification ${NOTIFICATION_STATE[record.state].label}`}>
      <div className="card-head">
        <NotificationStateBadge state={record.state} />
        <span className="muted small">{record.channel === "outbox" ? "Outbox" : "WhatsApp"}{digest ? ` · digest of ${record.taskIds.length} task${record.taskIds.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      <p className="small">{NOTIFICATION_STATE[record.state].detail}</p>
      <pre className="message" aria-label="Message text">{record.message}</pre>
      <p className="muted small">
        {record.state === "queued" ? "Scheduled for " : "Scheduled "}
        {formatDateTime(record.scheduledFor, timeZone)}
        {record.providerMessageId ? ` · provider ID ${record.providerMessageId}` : ""}
      </p>
      {record.lastError && <p className="callout callout-warn small" role="note">{record.lastError}</p>}
      <p className="small">
        {record.taskId ? <Link href={`/tasks/${encodeURIComponent(record.taskId)}`}>Open the task</Link> : <Link href="/">Open the work queue</Link>}
      </p>
    </article>
  );
}
