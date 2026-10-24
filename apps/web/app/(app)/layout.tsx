import type { ReactNode } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Read at request time so the flag reflects the running server's environment, not the build's.
  await connection();
  const demoEnabled = process.env.DEMO_ENABLED === "true";
  return <AppShell demoEnabled={demoEnabled}>{children}</AppShell>;
}
