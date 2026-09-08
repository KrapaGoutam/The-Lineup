import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  KeyRound,
  LogOut,
  Users,
  type LucideIcon,
} from "lucide-react";

import { AppearanceSwitch } from "@/components/appearance-switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";
import type { DayHours } from "@/hooks/use-restaurant-clock";

import { PayRatesSection } from "./pay-rates-section";
import { ShiftHoursCard } from "./shift-hours-card";
import { StoreHoursGrid } from "./store-hours-grid";

/**
 * Feature 023. A dedicated Settings tab -- same "own the full `<main>`,
 * driven by `tab` state" treatment every other section of this app already
 * has (there is no per-tab URL routing anywhere in this app, so "page not
 * modal" means this, not a new Next.js route). Composes existing pieces by
 * role; owns no state and calls no server actions itself except indirectly
 * through `PayRatesSection`. Manager-only sections are gated the same way
 * the app's nav already gates Team/Payroll (`isManager`, `!demoMode`).
 */
export function SettingsPage({
  isManager,
  demoMode,
  restaurantSlug,
  timeZone,
  operatingHours,
  shiftDefaults,
  todayIndex,
  onEditHours,
  onChangePasscode,
  onGoToTab,
  onSignOut,
  onBack,
}: {
  isManager: boolean;
  demoMode: boolean;
  restaurantSlug: string;
  timeZone: string;
  operatingHours: DayHours[];
  shiftDefaults: ShiftDefaults;
  todayIndex: number;
  onEditHours: () => void;
  onChangePasscode: () => void;
  onGoToTab: (tab: "team" | "schedule") => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const showPayRates = isManager && !demoMode;

  const navItems = [
    ...(isManager
      ? [{ href: "#settings-shift-hours", label: "Shift hours" }]
      : []),
    { href: "#settings-store-hours", label: "Store hours" },
    ...(isManager ? [{ href: "#settings-schedule", label: "Schedule" }] : []),
    ...(isManager ? [{ href: "#settings-team", label: "Team" }] : []),
    ...(showPayRates
      ? [{ href: "#settings-pay-rates", label: "Pay rates" }]
      : []),
    { href: "#settings-passcode", label: "Passcode" },
    { href: "#settings-appearance", label: "Appearance" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="secondary"
          size="icon"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Settings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The Monk&apos;s · {timeZone}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <nav
          aria-label="Settings sections"
          className="hidden w-[220px] flex-none flex-col gap-1 lg:flex"
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-11 items-center rounded-xl px-3.5 text-sm font-medium"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-5">
          {isManager ? (
            <div id="settings-shift-hours">
              <ShiftHoursCard
                shiftDefaults={shiftDefaults}
                onEdit={onEditHours}
              />
            </div>
          ) : null}

          <Card id="settings-store-hours">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Store hours</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  What the countdown in the header counts down to.
                </p>
              </div>
              {isManager ? (
                <Button variant="secondary" size="sm" onClick={onEditHours}>
                  Edit hours
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <StoreHoursGrid hours={operatingHours} todayIndex={todayIndex} />
            </CardContent>
          </Card>

          {isManager ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <QuickLinkCard
                id="settings-team"
                icon={Users}
                title="Team"
                description="Rename, set designation, reset a passcode, link attendance."
                onClick={() => onGoToTab("team")}
              />
              <QuickLinkCard
                id="settings-schedule"
                icon={CalendarDays}
                title="Schedule"
                description="Rarely touched mid-shift. Plan and publish the week here."
                onClick={() => onGoToTab("schedule")}
              />
            </div>
          ) : null}

          {showPayRates ? (
            <div id="settings-pay-rates">
              <PayRatesSection restaurantSlug={restaurantSlug} />
            </div>
          ) : null}

          <Card id="settings-passcode">
            <CardHeader>
              <h2 className="font-semibold">Passcode</h2>
            </CardHeader>
            <CardContent>
              <button
                onClick={onChangePasscode}
                className="hover:bg-muted border-border flex min-h-13 w-full items-center gap-3 rounded-xl border px-3.5 text-left"
              >
                <KeyRound
                  className="text-muted-foreground size-[18px]"
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm font-medium">
                  Change your passcode
                </span>
                <ChevronRight
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              </button>
            </CardContent>
          </Card>

          <Card id="settings-appearance">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <h2 className="font-semibold">Appearance</h2>
              <AppearanceSwitch />
            </CardHeader>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <button
                onClick={onSignOut}
                className="text-destructive hover:bg-destructive/10 flex min-h-13 w-full items-center gap-3 rounded-xl px-3.5 text-left"
              >
                <LogOut className="size-[18px]" aria-hidden="true" />
                <span className="text-sm font-semibold">Sign out</span>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLinkCard({
  id,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card id={id} className="p-0">
      <button
        onClick={onClick}
        className="hover:bg-muted flex w-full items-center gap-4 rounded-2xl p-5 text-left"
      >
        <span className="bg-primary/10 text-primary grid size-12 flex-none place-items-center rounded-2xl">
          <Icon className="size-[21px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-base font-semibold"
            role="heading"
            aria-level={2}
          >
            {title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-sm">
            {description}
          </span>
        </span>
        <ChevronRight
          className="text-muted-foreground size-[18px] flex-none"
          aria-hidden="true"
        />
      </button>
    </Card>
  );
}
