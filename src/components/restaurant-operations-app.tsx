"use client";

import { FormEvent, useState } from "react";
import {
  CalendarDays,
  Clock3,
  LogOut,
  Settings2,
  Table2,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { AllocationWorkspace } from "@/features/allocation/components/allocation-workspace";
import { ScheduleWorkspace } from "@/features/schedules/components/schedule-workspace";
import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";
import { TeamWorkspace } from "@/features/team/components/team-workspace";
import { TipWorkspace } from "@/features/tips/components/tip-workspace";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import {
  type DayHours,
  useRestaurantClock,
} from "@/hooks/use-restaurant-clock";
import {
  demoAccounts as staticDemoAccounts,
  team as initialTeam,
  type TeamMember,
} from "@/lib/demo-data";
import { cn } from "@/lib/utils";

import {
  LoginScreen,
  type RegisterDemoResult,
  type SignedInUser,
} from "./login-screen";
import { OrgLockoutBanner } from "./org-lockout-banner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AppTab = "schedule" | "allocation" | "tips" | "team";

const tabs: Array<{ id: AppTab; label: string; icon: typeof CalendarDays }> = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "allocation", label: "Table allocation", icon: Table2 },
  { id: "tips", label: "Tip split", icon: WalletCards },
];

const teamTab = { id: "team" as const, label: "Team", icon: Users };

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function HoursDialog({
  hours,
  shiftDefaults,
  onClose,
  onSave,
}: {
  hours: DayHours[];
  shiftDefaults: ShiftDefaults;
  onClose: () => void;
  onSave: (hours: DayHours[], shiftDefaults: ShiftDefaults) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextHours = weekDays.map((_, index) => ({
      opening: String(form.get(`${index}-opening`)),
      closing: String(form.get(`${index}-closing`)),
      closed: form.get(`${index}-closed`) === "on",
    }));
    onSave(nextHours, {
      morning: {
        start: String(form.get("morning-start")),
        end: String(form.get("morning-end")),
      },
      evening: {
        start: String(form.get("evening-start")),
        end: String(form.get("evening-end")),
      },
      full_day: {
        start: String(form.get("full-day-start")),
        end: String(form.get("full-day-end")),
      },
    });
    onClose();
  }
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="hours-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="hours-title" className="text-lg font-semibold">
              Restaurant hours
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Configure each operating day, closing countdown, and the three
              shift labels.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close hours settings"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1">
              {weekDays.map((day, index) => (
                <div
                  key={day}
                  className="border-border grid grid-cols-[48px_1fr_1fr_auto] items-center gap-2 border-b py-2 last:border-b-0"
                >
                  <Label htmlFor={`${index}-opening`}>{day}</Label>
                  <Input
                    id={`${index}-opening`}
                    name={`${index}-opening`}
                    type="time"
                    defaultValue={hours[index].opening}
                    required
                    aria-label={`${day} opening`}
                  />
                  <Input
                    id={`${index}-closing`}
                    name={`${index}-closing`}
                    type="time"
                    defaultValue={hours[index].closing}
                    required
                    aria-label={`${day} closing`}
                  />
                  <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                    <input
                      type="checkbox"
                      name={`${index}-closed`}
                      defaultChecked={hours[index].closed}
                      className="accent-[var(--primary)]"
                    />
                    Closed
                  </Label>
                </div>
              ))}
            </div>
            <div className="border-border bg-background/60 text-muted-foreground rounded-xl border p-3 text-xs leading-5">
              Each row is opening then closing. Overnight closing times are
              supported. Time zone:{" "}
              <span className="text-foreground">America/Chicago</span>.
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">
                Shift label defaults
              </legend>
              <div className="mt-2 space-y-1">
                {(
                  [
                    ["Morning", "morning", shiftDefaults.morning],
                    ["Evening", "evening", shiftDefaults.evening],
                    ["Full day", "full-day", shiftDefaults.full_day],
                  ] as const
                ).map(([label, key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[76px_1fr_1fr] items-center gap-2 py-1"
                  >
                    <Label htmlFor={`${key}-start`}>{label}</Label>
                    <Input
                      id={`${key}-start`}
                      name={`${key}-start`}
                      type="time"
                      defaultValue={value.start}
                      required
                      aria-label={`${label} default start`}
                    />
                    <Input
                      id={`${key}-end`}
                      name={`${key}-end`}
                      type="time"
                      defaultValue={value.end}
                      required
                      aria-label={`${label} default end`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save hours</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function RestaurantOperationsApp({
  demoMode,
  restaurantSlug,
  initialUser = null,
}: {
  demoMode: boolean;
  restaurantSlug: string;
  initialUser?: SignedInUser | null;
}) {
  const [user, setUser] = useState<SignedInUser | null>(initialUser);
  const [tab, setTab] = useState<AppTab>("schedule");
  const [tipsStatus, setTipsStatus] = useState<TipsDayStatus>("estimating");
  const [tipsAuditLog, setTipsAuditLog] = useState<TipsAuditEntry[]>([]);
  const [operatingHours, setOperatingHours] = useState<DayHours[]>(() =>
    weekDays.map(() => ({
      opening: "11:00",
      closing: "23:00",
      closed: false,
    })),
  );
  const [shiftDefaults, setShiftDefaults] = useState<ShiftDefaults>({
    morning: { start: "11:00", end: "16:00" },
    evening: { start: "16:00", end: "23:00" },
    full_day: { start: "11:00", end: "23:00" },
  });
  const [showHours, setShowHours] = useState(false);
  const clock = useRestaurantClock("America/Chicago", operatingHours);

  const [demoTeam, setDemoTeam] = useState<TeamMember[]>(initialTeam);
  const [demoAccounts, setDemoAccounts] = useState<
    Record<string, SignedInUser>
  >(() => ({ ...staticDemoAccounts }));

  function registerDemoMember(input: {
    displayName: string;
    passcode: string;
  }): RegisterDemoResult {
    if (demoAccounts[input.passcode]) {
      return {
        ok: false,
        error: "That passcode is already in use — choose a different one.",
      };
    }
    const profileId = `demo-${Date.now()}`;
    const account: SignedInUser = {
      profileId,
      name: input.displayName,
      role: "server",
    };
    setDemoTeam((current) => [
      ...current,
      {
        id: profileId,
        name: input.displayName,
        shortName: input.displayName.split(" ")[0] || input.displayName,
        role: "server",
        color: "var(--server-one)",
      },
    ]);
    setDemoAccounts((current) => ({
      ...current,
      [input.passcode]: account,
    }));
    return { ok: true, account };
  }

  function changeDemoMemberRole(
    memberId: string,
    nextRole: TeamMember["role"],
  ) {
    setDemoTeam((current) =>
      current.map((member) =>
        member.id === memberId ? { ...member, role: nextRole } : member,
      ),
    );
  }

  if (!user) {
    return (
      <LoginScreen
        demoMode={demoMode}
        restaurantSlug={restaurantSlug}
        onSignIn={setUser}
        demoAccounts={demoAccounts}
        onRegisterDemo={registerDemoMember}
      />
    );
  }

  const isManager = user.role !== "server";
  const visibleTabs = isManager ? [...tabs, teamTab] : tabs;
  // Narrowing doesn't cross into the nested function declarations below —
  // capture a non-null local so TypeScript can see it there too.
  const currentUser = user;

  function finalizeTips() {
    setTipsAuditLog((log) => [
      ...log,
      {
        action: "finalized",
        actorName: currentUser.name,
        at: new Date().toISOString(),
      },
    ]);
    setTipsStatus("finalized");
  }

  function reopenTips(reason: string) {
    setTipsAuditLog((log) => [
      ...log,
      {
        action: "reopened",
        actorName: currentUser.name,
        reason,
        at: new Date().toISOString(),
      },
    ]);
    setTipsStatus("estimating");
  }

  async function signOut() {
    if (!demoMode) await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    setTab("schedule");
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="bg-background/90 sticky top-0 z-40 border-b border-white/8 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1540px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => setTab("schedule")}
            className="flex min-h-11 items-center gap-3"
            aria-label="ServiceFlow schedule home"
          >
            <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl font-black shadow-[0_12px_40px_-14px_var(--primary)]">
              S
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-bold tracking-tight">
                ServiceFlow
              </span>
              <span className="text-muted-foreground block text-[11px]">
                Autumn House
              </span>
            </span>
          </button>

          <nav
            className="ml-4 hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {visibleTabs.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={tab === id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium">{clock.dateTime}</p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-[11px]",
                  clock.isClosed ? "text-muted-foreground" : "text-primary",
                )}
              >
                <Clock3 className="mr-1 inline size-3" aria-hidden="true" />
                {clock.isClosed
                  ? clock.countdown
                  : `Day ends in ${clock.countdown}`}
              </p>
            </div>
            <div className="border-border hidden h-8 w-px sm:block" />
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-muted-foreground text-[10px] capitalize">
                {user.role.replace("_", " ")}
              </p>
            </div>
            <Badge
              tone={isManager ? "accent" : "neutral"}
              className="hidden xl:inline-flex"
            >
              {isManager ? "Manager access" : "Server access"}
            </Badge>
            {isManager ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHours(true)}
                aria-label="Edit restaurant hours"
              >
                <Settings2 />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <div className="border-t border-white/5 px-4 py-2 md:hidden">
          <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-3 text-xs">
            <span>{clock.dateTime}</span>
            <span className="text-primary font-mono">
              {clock.isClosed
                ? clock.countdown
                : `Closes in ${clock.countdown}`}
            </span>
          </div>
        </div>
      </header>

      {!demoMode && isManager ? (
        <OrgLockoutBanner restaurantSlug={restaurantSlug} />
      ) : null}

      <main className="mx-auto max-w-[1540px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {tab === "schedule" ? (
          <ScheduleWorkspace user={user} shiftDefaults={shiftDefaults} />
        ) : null}
        {tab === "allocation" ? (
          <AllocationWorkspace
            user={user}
            boardLocked={tipsStatus === "finalized"}
            onReopenTips={reopenTips}
            tipsAuditLog={tipsAuditLog}
          />
        ) : null}
        {tab === "tips" ? (
          <TipWorkspace
            user={user}
            status={tipsStatus}
            onFinalize={finalizeTips}
            onReopen={reopenTips}
            auditLog={tipsAuditLog}
          />
        ) : null}
        {tab === "team" && isManager ? (
          <TeamWorkspace
            user={user}
            team={demoTeam}
            onChangeRole={changeDemoMemberRole}
          />
        ) : null}
      </main>

      <nav
        className={cn(
          "bg-background/95 fixed inset-x-0 bottom-0 z-40 grid border-t border-white/10 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden",
          isManager ? "grid-cols-4" : "grid-cols-3",
        )}
        aria-label="Mobile navigation"
      >
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {showHours && isManager ? (
        <HoursDialog
          hours={operatingHours}
          shiftDefaults={shiftDefaults}
          onClose={() => setShowHours(false)}
          onSave={(nextHours, nextShiftDefaults) => {
            setOperatingHours(nextHours);
            setShiftDefaults(nextShiftDefaults);
          }}
        />
      ) : null}
    </div>
  );
}
