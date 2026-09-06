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
import {
  designationToRole,
  type Designation,
} from "@/features/auth/domain/passcode";
import {
  addShiftAction,
  publishScheduleAction,
  saveScheduleConfigAction,
} from "@/features/schedules/actions/schedule-actions";
import { ScheduleWorkspace } from "@/features/schedules/components/schedule-workspace";
import type { ScheduleContext } from "@/features/schedules/data/schedule-data";
import {
  getMonthDates,
  getWeekDates,
  type ShiftDefaults,
} from "@/features/schedules/domain/shift-planning";
import { TeamWorkspace } from "@/features/team/components/team-workspace";
import {
  addTipIntervalAction,
  finalizeTipsAction,
  reopenTipsAction,
} from "@/features/tips/actions/tips-actions";
import { TipWorkspace } from "@/features/tips/components/tip-workspace";
import type { TipIntervalInput } from "@/features/tips/domain/calculate-tip-splits";
import type {
  TipsAuditEntry,
  TipsDayStatus,
} from "@/features/tips/domain/tips-status";
import type { TipsContext } from "@/features/tips/data/tips-data";
import {
  type DayHours,
  useRestaurantClock,
} from "@/hooks/use-restaurant-clock";
import {
  DEMO_ORGANIZATION_ID,
  demoAccounts as staticDemoAccounts,
  team as staticDemoTeam,
  type DemoShift,
  type TeamMember,
} from "@/lib/demo-data";
import { cn } from "@/lib/utils";

import {
  LoginScreen,
  type RegisterDemoResult,
  type SignedInUser,
} from "./login-screen";
import { OrgLockoutBanner } from "./org-lockout-banner";
import { ThemeToggle } from "./theme-toggle";
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

// Demo mode's fixed "today" -- chosen so getWeekDates/getMonthDates
// reproduce the exact September 2026 week this app has always demoed
// with (verified: getWeekDates("2026-09-10") === the original hardcoded
// array), rather than duplicating that date logic.
const DEMO_ANCHOR_DATE = "2026-09-10";
const DEMO_OPERATING_HOURS: DayHours[] = weekDays.map(() => ({
  opening: "11:00",
  closing: "23:00",
  closed: false,
}));
const DEMO_SHIFT_DEFAULTS: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};
const DEMO_TIME_ZONE = "America/Chicago";

function HoursDialog({
  hours,
  shiftDefaults,
  timeZone,
  onClose,
  onSave,
}: {
  hours: DayHours[];
  shiftDefaults: ShiftDefaults;
  timeZone: string;
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
              <span className="text-foreground">{timeZone}</span>.
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
  initialScheduleContext = null,
  initialTipsContext = null,
}: {
  demoMode: boolean;
  restaurantSlug: string;
  initialUser?: SignedInUser | null;
  initialScheduleContext?: ScheduleContext | null;
  initialTipsContext?: TipsContext | null;
}) {
  const [user, setUser] = useState<SignedInUser | null>(initialUser);
  const [tab, setTab] = useState<AppTab>("schedule");
  const [actionError, setActionError] = useState<string | null>(null);

  // Feature 015 (Phases B/D): real mode seeds every one of these from the
  // Server Component's initial fetch; demo mode keeps its original fixed
  // values. Same state shape either way -- only where it starts from
  // differs, matching the pattern already used for the Team tab.
  const locationId =
    initialScheduleContext?.locationId ??
    initialTipsContext?.locationId ??
    null;
  const timeZone =
    initialScheduleContext?.timeZone ??
    initialTipsContext?.timeZone ??
    DEMO_TIME_ZONE;
  const tipsServiceDate = initialTipsContext?.serviceDate ?? DEMO_ANCHOR_DATE;

  const [team, setTeam] = useState<TeamMember[]>(
    () =>
      initialScheduleContext?.team ??
      initialTipsContext?.team ??
      staticDemoTeam,
  );
  const [demoAccounts, setDemoAccounts] = useState<
    Record<string, SignedInUser>
  >(() => ({ ...staticDemoAccounts }));

  const [operatingHours, setOperatingHours] = useState<DayHours[]>(
    () => initialScheduleContext?.operatingHours ?? DEMO_OPERATING_HOURS,
  );
  const [shiftDefaults, setShiftDefaults] = useState<ShiftDefaults>(
    () => initialScheduleContext?.shiftDefaults ?? DEMO_SHIFT_DEFAULTS,
  );
  const [weekDates] = useState<string[]>(
    () => initialScheduleContext?.weekDates ?? getWeekDates(DEMO_ANCHOR_DATE),
  );
  const [monthDates] = useState<string[]>(
    () => initialScheduleContext?.monthDates ?? getMonthDates(DEMO_ANCHOR_DATE),
  );
  const [shifts, setShifts] = useState<DemoShift[]>(
    () => initialScheduleContext?.shifts ?? [],
  );
  const [showHours, setShowHours] = useState(false);
  const clock = useRestaurantClock(timeZone, operatingHours);

  const [tipPoolId, setTipPoolId] = useState<number | null>(
    () => initialTipsContext?.tipPoolId ?? null,
  );
  const [tipIntervals, setTipIntervals] = useState<TipIntervalInput[]>(
    () => initialTipsContext?.intervals ?? [],
  );
  const [tipsStatus, setTipsStatus] = useState<TipsDayStatus>(
    () => initialTipsContext?.status ?? "estimating",
  );
  const [tipsAuditLog, setTipsAuditLog] = useState<TipsAuditEntry[]>(
    () => initialTipsContext?.auditLog ?? [],
  );

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
      designation: "staff",
      organizationId: DEMO_ORGANIZATION_ID,
    };
    setTeam((current) => [
      ...current,
      {
        id: profileId,
        name: input.displayName,
        shortName: input.displayName.split(" ")[0] || input.displayName,
        role: "server",
        designation: "staff",
        color: "var(--server-one)",
      },
    ]);
    setDemoAccounts((current) => ({
      ...current,
      [input.passcode]: account,
    }));
    return { ok: true, account };
  }

  /**
   * Feature 014. Updates both the roster row's designation AND its
   * derived AppRole together (never one without the other — see the
   * comment on TeamMember.designation), and also syncs the matching
   * `demoAccounts` login-identity entry if this member has one, so a
   * promotion or demotion actually takes effect the next time they sign
   * in. It does NOT retroactively change an already-open session's
   * `user` state (that would need a session-claim refresh in real mode
   * too) — signing out and back in is what picks up the new designation,
   * same as a real RLS-backed session would need a fresh JWT.
   */
  function changeDemoMemberDesignation(memberId: string, next: Designation) {
    const nextRole = designationToRole(next);
    setTeam((current) =>
      current.map((member) =>
        member.id === memberId
          ? { ...member, designation: next, role: nextRole }
          : member,
      ),
    );
    setDemoAccounts((current) => {
      let changed = false;
      const updated = { ...current };
      for (const [passcode, account] of Object.entries(current)) {
        if (account.profileId === memberId) {
          updated[passcode] = {
            ...account,
            designation: next,
            role: nextRole,
          };
          changed = true;
        }
      }
      return changed ? updated : current;
    });
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

  async function addShifts(added: DemoShift[]) {
    if (added.length === 0) return;
    if (demoMode) {
      setShifts((current) => [...current, ...added]);
      return;
    }
    if (!locationId) return;
    const result = await addShiftAction({
      restaurantSlug,
      organizationId: currentUser.organizationId,
      locationId,
      timeZone,
      shifts: added.map((shift) => ({
        employeeId: shift.employeeId,
        serviceDate: shift.serviceDate,
        endDate: shift.endDate,
        shiftKind: shift.shiftKind,
        startLocal: shift.startLocal,
        endLocal: shift.endLocal,
        usesDefaultTime: shift.usesDefaultTime,
        note: shift.note,
      })),
    });
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setShifts((current) => [...current, ...result.data]);
  }

  async function publishSchedule() {
    if (!demoMode) {
      if (!locationId) return;
      const result = await publishScheduleAction({
        restaurantSlug,
        locationId,
        timeZone,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
    }
    setShifts((current) =>
      current.map((shift) => ({ ...shift, status: "published" as const })),
    );
  }

  async function saveScheduleConfig(
    nextHours: DayHours[],
    nextShiftDefaults: ShiftDefaults,
  ) {
    if (!demoMode && locationId) {
      const result = await saveScheduleConfigAction({
        restaurantSlug,
        organizationId: currentUser.organizationId,
        locationId,
        operatingHours: nextHours,
        shiftDefaults: nextShiftDefaults,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
    }
    setOperatingHours(nextHours);
    setShiftDefaults(nextShiftDefaults);
  }

  async function addTipInterval(
    interval: TipIntervalInput,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      setTipIntervals((current) => [...current, interval]);
      return { ok: true };
    }
    if (!locationId) return { ok: false, error: "Not ready yet." };
    const result = await addTipIntervalAction({
      restaurantSlug,
      organizationId: currentUser.organizationId,
      locationId,
      timeZone,
      serviceDate: tipsServiceDate,
      start: interval.start,
      end: interval.end,
      amountCents: interval.amountCents,
      participantIds: interval.participantIds,
    });
    if (!result.ok) return { ok: false, error: result.error };
    setTipPoolId(result.data.tipPoolId);
    setTipIntervals((current) => [...current, result.data.interval]);
    return { ok: true };
  }

  async function finalizeTips() {
    if (!demoMode) {
      if (!locationId || tipPoolId === null) return;
      const result = await finalizeTipsAction({
        restaurantSlug,
        organizationId: currentUser.organizationId,
        locationId,
        tipPoolId,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
    }
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

  async function reopenTips(reason: string) {
    if (!demoMode) {
      if (!locationId || tipPoolId === null) return;
      const result = await reopenTipsAction({
        restaurantSlug,
        organizationId: currentUser.organizationId,
        locationId,
        tipPoolId,
        reason,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
    }
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
      <header className="bg-background/90 border-border sticky top-0 z-40 border-b backdrop-blur-xl">
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
                The Monk&apos;s
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
            <ThemeToggle />
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
        <div className="border-border border-t px-4 py-2 md:hidden">
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

      {actionError ? (
        <div className="border-destructive/30 bg-destructive/10 border-b px-4 py-2 text-center text-sm sm:px-6 lg:px-8">
          <span className="text-destructive">{actionError}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground ml-3 text-xs underline"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1540px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        {tab === "schedule" ? (
          <ScheduleWorkspace
            user={user}
            team={team}
            shiftDefaults={shiftDefaults}
            shifts={shifts}
            weekDates={weekDates}
            monthDates={monthDates}
            timeZone={timeZone}
            onAddShifts={addShifts}
            onPublish={publishSchedule}
          />
        ) : null}
        {tab === "allocation" ? (
          <AllocationWorkspace
            user={user}
            team={team}
            boardLocked={tipsStatus === "finalized"}
            onReopenTips={reopenTips}
            tipsAuditLog={tipsAuditLog}
          />
        ) : null}
        {tab === "tips" ? (
          <TipWorkspace
            user={user}
            team={team}
            status={tipsStatus}
            intervals={tipIntervals}
            onAddInterval={addTipInterval}
            onFinalize={finalizeTips}
            onReopen={reopenTips}
            auditLog={tipsAuditLog}
          />
        ) : null}
        {tab === "team" && isManager ? (
          <TeamWorkspace
            user={user}
            team={team}
            onChangeDesignation={changeDemoMemberDesignation}
          />
        ) : null}
      </main>

      <nav
        className={cn(
          "bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 grid border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden",
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
          timeZone={timeZone}
          onClose={() => setShowHours(false)}
          onSave={saveScheduleConfig}
        />
      ) : null}
    </div>
  );
}
