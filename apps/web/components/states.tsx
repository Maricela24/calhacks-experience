import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Inbox, WifiOff } from "lucide-react";
import { ApiError, describeError } from "@/lib/api";

export function ErrorPanel({
  error, title = "Something went wrong", onRetry, children,
}: { error: unknown; title?: string; onRetry?: () => void; children?: ReactNode }) {
  const offline = error instanceof ApiError && (error.status === 0 || error.code === "SERVICE_UNAVAILABLE");
  return (
    <div className="panel panel-error" role="alert">
      {offline ? <WifiOff size={22} aria-hidden /> : <AlertTriangle size={22} aria-hidden />}
      <div>
        <h2>{offline ? "The server is not reachable" : title}</h2>
        <p>{describeError(error)}</p>
        {error instanceof ApiError && error.requestId && <p className="muted small">Reference: {error.requestId}</p>}
        {children}
        {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

export function EmptyPanel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel panel-empty">
      <Inbox size={24} aria-hidden />
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function NotFoundPanel({ what = "task" }: { what?: string }) {
  return (
    <div className="panel panel-empty" role="alert">
      <AlertTriangle size={24} aria-hidden />
      <div>
        <h2>That {what} was not found</h2>
        <p>It may belong to another workspace, or the link is wrong.</p>
        <Link href="/" className="btn btn-secondary">Back to the work queue</Link>
      </div>
    </div>
  );
}

/** Skeletons are visually distinct from real cards (no text, dashed). */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  );
}
