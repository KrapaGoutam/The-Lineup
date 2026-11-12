import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "The Lineup — Clock Kiosk",
  description: "Station clock-in and clock-out kiosk for restaurant staff.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full touch-manipulation bg-[#0b0b0d] text-[#f6f3ed] antialiased select-none">
      {children}
    </div>
  );
}
