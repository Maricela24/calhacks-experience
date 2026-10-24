import type { ReactNode } from "react";

export const metadata = { title: process.env.NEXT_PUBLIC_APP_NAME ?? "AfterHours" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
