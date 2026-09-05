import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceFlow Restaurant Operations",
  description:
    "Restaurant schedules, live table allocation, and time-based tip splitting.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0b0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
