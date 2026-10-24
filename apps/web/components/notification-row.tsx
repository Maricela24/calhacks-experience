import Link from "next/link";
import type { NotificationRecord } from "@afterhours/contracts";
import { formatDateTime } from "@/lib/format";
import { describeNotification } from "@/lib/labels";
import { NotificationStateBadge } from "./badges";

export function NotificationRow({ record, timeZone, preparedAt }: { record: NotificationRecord; timeZone?: string; preparedAt?: string | null }) {
  const digest = record.taskId === null;
  const d = describeNotification(record);
  return (
    <article className="card notif" aria-label={`Notification ${d.label}`}>
      <div className="card-head">
        <NotificationStateBadge record={record} />
        <span className="muted small">{record.channel === "outbox" ? "Outbox" : "WhatsApp"}{digest ? ` · digest of ${record.taskIds.length} task${record.taskIds.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      <p className="small">{d.detail}</p>
      <pre className="message" aria-label="Message text">{record.message}</pre>
      {record.state === "queued" && <p className="muted small">This is a placeholder. The final wording is composed when the message is sent.</p>}
      <dl className="kv small">
        {preparedAt !== undefined && (<><dt>Files prepared</dt><dd>{preparedAt ? formatDateTime(preparedAt, timeZone, true) : "Unavailable"}</dd></>)}
        <dt>{record.state === "queued" ? "Currently planned for" : "Planned for"}</dt><dd>{formatDateTime(record.scheduledFor, timeZone)}</dd>
        <dt>Notification created</dt><dd>{formatDateTime(record.createdAt, timeZone)}</dd>
        {record.providerMessageId && (<><dt>Provider ID</dt><dd className="wrap-anywhere">{record.providerMessageId}</dd></>)}
      </dl>
      {d.reason && <p className="callout callout-warn small" role="note">{d.reason}</p>}
      <p className="small">
        {record.taskId ? <Link href={`/tasks/${encodeURIComponent(record.taskId)}`}>Open the task</Link> : <Link href="/">Open the work queue</Link>}
      </p>
    </article>
  );
}
