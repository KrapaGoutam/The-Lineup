import type { Metadata, Viewport } from "next";

import { THEME_STORAGE_KEY } from "@/hooks/use-theme";
import { ClientHydrationMarker } from "@/components/hydration-marker";

import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceFlow Restaurant Operations",
  description:
    "Restaurant schedules, live table allocation, and time-based tip splitting.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

// Runs before first paint so the page never flashes the wrong theme.
// Mirrors use-theme.ts's resolution exactly: an explicit stored choice
// wins, otherwise fall back to the OS preference. Keep this string in sync
// with that hook if the resolution logic ever changes.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var resolved = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ClientHydrationMarker />
      </body>
    </html>
  );
}
