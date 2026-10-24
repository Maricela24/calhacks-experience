import { Suspense } from "react";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading settings…</p>}>
      <SettingsView />
    </Suspense>
  );
}
