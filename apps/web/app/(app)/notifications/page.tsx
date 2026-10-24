"use client";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { NotificationRow } from "@/components/notification-row";
import { useShell } from "@/components/shell";
import { EmptyPanel, ErrorPanel, SkeletonCards } from "@/components/states";
import { useNotificationList, useSettings } from "@/lib/hooks";

export default function NotificationsPage() {
  const list = useNotificationList();
  const settings = useSettings();
  const { integrations } = useShell();
  const tz = settings.data?.organization.timezone;
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const channel = integrations?.notifications.channel;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            {channel === "whatsapp"
              ? "Messages sent through WhatsApp. “Accepted by provider” means the provider took the request, not that it reached a phone."
              : "Outbox mode: each message below is shown exactly as it would be sent, but nothing is sent to a phone or inbox."}
          </p>
        </div>
      </div>
      {list.isPending && <SkeletonCards />}
      {list.isError && <ErrorPanel error={list.error} title="Could not load notifications" onRetry={() => void list.refetch()} />}
      {list.data && items.length === 0 && (
        <EmptyPanel title="No notifications yet"><p>A notification is created when a task becomes ready for review.</p></EmptyPanel>
      )}
      <div className="stack">
        {items.map((n) => <NotificationRow key={n.id} record={n} timeZone={tz} />)}
      </div>
      {list.hasNextPage && (
        <p>
          <button type="button" className="btn btn-secondary" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? <><Loader2 size={16} className="spin" aria-hidden />Loading…</> : "Load older notifications"}
          </button>
        </p>
      )}
    </>
  );
}
