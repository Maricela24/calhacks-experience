import type { ReactNode } from "react";
import {
  AlertTriangle, BadgeCheck, CheckCircle2, CircleHelp, Clock, FlaskConical, Loader2, Mail, MinusCircle, Sparkles, XCircle,
  Inbox, Cpu,
} from "lucide-react";
import type { GenerationMode, IngestionMode, NotificationRecord, TaskStatus } from "@afterhours/contracts";
import { STATUS_LABEL, describeNotification, isActive } from "@/lib/labels";

const STATUS_STYLE: Record<TaskStatus, string> = {
  queued: "neutral", planning: "info", running: "info", needs_input: "warn", ready: "good",
  approved: "good-solid", dismissed: "neutral", failed: "bad", skipped: "neutral",
};

/** Status badge: icon + text + color. The spinner only runs while the worker is healthy. */
export function StatusBadge({ status, workerHealthy = true }: { status: TaskStatus; workerHealthy?: boolean }) {
  let icon: ReactNode;
  const size = 14;
  switch (status) {
    case "queued": icon = <Clock size={size} aria-hidden />; break;
    case "planning":
    case "running": icon = workerHealthy ? <Loader2 size={size} className="spin" aria-hidden /> : <Clock size={size} aria-hidden />; break;
    case "needs_input": icon = <CircleHelp size={size} aria-hidden />; break;
    case "ready": icon = <CheckCircle2 size={size} aria-hidden />; break;
    case "approved": icon = <BadgeCheck size={size} aria-hidden />; break;
    case "failed": icon = <AlertTriangle size={size} aria-hidden />; break;
    case "dismissed": icon = <XCircle size={size} aria-hidden />; break;
    default: icon = <MinusCircle size={size} aria-hidden />;
  }
  const label = status === "queued" && !workerHealthy ? "Queued (worker offline)" : STATUS_LABEL[status];
  return <span className={`badge badge-${STATUS_STYLE[status]}`} data-status={status}>{icon}{label}</span>;
}

export function IngestionBadge({ mode }: { mode: IngestionMode }) {
  return mode === "demo" ? (
    <span className="badge badge-demo" title="This email was injected through the demo path, not read from a mailbox."><FlaskConical size={14} aria-hidden />Demo email</span>
  ) : (
    <span className="badge badge-outline" title="This email was read from the connected Gmail inbox."><Mail size={14} aria-hidden />Gmail</span>
  );
}

export function GenerationBadge({ mode }: { mode: GenerationMode }) {
  return mode === "fixture" ? (
    <span className="badge badge-demo" title="Prepared by fixture intelligence, not a live model."><Sparkles size={14} aria-hidden />Fixture output</span>
  ) : (
    <span className="badge badge-outline" title="Prepared by the live model."><Cpu size={14} aria-hidden />Live model</span>
  );
}

export function NotificationStateBadge({ record }: { record: Pick<NotificationRecord, "state" | "lastError" | "channel"> }) {
  const d = describeNotification(record);
  const state = record.state;
  const Icon = state === "queued" ? Clock : state === "delivered" ? CheckCircle2 : state === "blocked" ? AlertTriangle : state === "failed" ? XCircle : state === "simulated" ? Inbox : Mail;
  return <span className={`badge badge-${d.tone}`}><Icon size={14} aria-hidden />{d.label}</span>;
}

export { isActive };
