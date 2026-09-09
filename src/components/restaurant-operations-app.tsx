"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Banknote,
  CalendarDays,
  CalendarSearch,
  ChevronDown,
  ChevronUp,
  KeyRound,
  LogOut,
  Menu,
  Settings2,
  SlidersHorizontal,
  Store,
  Table2,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import { AppearanceSwitch } from "@/components/appearance-switch";
import { AllocationWorkspace } from "@/features/allocation/components/allocation-workspace";
import type { AllocationContext } from "@/features/allocation/data/allocation-data";
import {
  getAttendanceLinkOptionsAction,
  removeAttendanceIdentityLinkAction,
  setAttendanceIdentityLinkAction,
  type AttendanceLinkOptions,
} from "@/features/attendance/actions/attendance-actions";
import { AttendanceReport } from "@/features/attendance/components/attendance-report";
import {
  demoNeonAttendance,
  demoNeonUsers,
} from "@/features/attendance/demo-data";
import {
  designationToRole,
  type Designation,
} from "@/features/auth/domain/passcode";
import { PayrollWorkspace } from "@/features/payroll/components/payroll-workspace";
import {
  addShiftAction,
  deleteShiftAction,
  publishScheduleAction,
  saveScheduleConfigAction,
  updateShiftAction,
} from "@/features/schedules/actions/schedule-actions";
import { ScheduleWorkspace } from "@/features/schedules/components/schedule-workspace";
import type { ShiftEditResult } from "@/features/schedules/components/shift-edit-dialog";
import type { ScheduleContext } from "@/features/schedules/data/schedule-data";
import {
  addDays,
  getMonthDates,
  getWeekDates,
  type ShiftDefaults,
  type ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { renameTeamMemberAction } from "@/features/team/actions/member-actions";
import { updateTeamDesignationAction } from "@/features/team/actions/team-actions";
import type { ResetPasscodeResult } from "@/features/team/components/passcode-reset-dialog";
import type { RenameMemberResult } from "@/features/team/components/rename-member-dialog";
import { TeamWorkspace } from "@/features/team/components/team-workspace";
import {
  addTipIntervalAction,
  finalizeTipsAction,
  getClockedInRosterAction,
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
import {
  PasscodeChangeDialog,
  type ChangePasscodeResult,
} from "./passcode-change-dialog";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AppTab =
  | "schedule"
  | "allocation"
  | "tips"
  | "team"
  | "attendance"
  | "payroll"
  | "settings";

// Feature 021: weighted into two tiers on desktop (primary, underlined when
// active; secondary, plain icon+label) rather than one flat row. Schedule
// stays primary on desktop, where there's room for it, but moves into the
// mobile "More" sheet alongside the secondary tabs -- the fixed 3-button
// mobile dock only has room for the two truly continuous-during-service
// actions (Allocation, Tip Split), matching design-system-reference.html's
// own mobile priority.
const scheduleTab = {
  id: "schedule" as const,
  label: "Schedule",
  icon: CalendarDays,
};
const allocationTab = {
  id: "allocation" as const,
  label: "Table Allocation",
  icon: Table2,
};
const tipsTab = { id: "tips" as const, label: "Tip Split", icon: WalletCards };
const primaryTabs = [allocationTab, tipsTab];

const teamTab = { id: "team" as const, label: "Team", icon: Users };
// Feature 019: visible to every signed-in role -- unlike Feature 018,
// which gated the whole tab manager/owner-only. What's inside it is now
// scoped by getAttendanceAccessAction's server-resolved answer instead
// (see attendance-report.tsx), so the tab itself no longer needs a
// client-side role gate.
const attendanceTab = {
  id: "attendance" as const,
  label: "Attendance",
  icon: CalendarSearch,
};
// Feature 020 Phase 2: manager/owner-only, real mode only -- gated exactly
// like Team was before Feature 019, plus !demoMode, since this phase has
// no demo-mode data source built for it yet (deliberately deferred, see
// docs/features/020-payroll.md's build notes).
const payrollTab = {
  id: "payroll" as const,
  label: "Payroll",
  icon: Banknote,
};

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

// Feature 016, demo mode only: a lightweight stand-in for the server-side
// generateRandomPasscode() (src/lib/passcode-security.ts), which can't run
// in the browser (it needs node:crypto and APP_PIN_PEPPER). Demo passcodes
// aren't real credentials, so Math.random is fine here -- this is purely
// about picking an unused 4-digit key into the in-memory demoAccounts map,
// not a security boundary.
function generateDemoPasscode(taken: ReadonlySet<string>): string {
  let candidate: string;
  do {
    candidate = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  } while (taken.has(candidate));
  return candidate;
}

/**
 * Feature 021. Closes an open popover/sheet on an outside pointerdown or
 * Escape -- the minimum non-modal-popover contract (no backdrop, no focus
 * trap; the rest of the page stays interactive, unlike the app's actual
 * modal dialogs which do trap focus). Shared by the avatar quick-settings
 * panel and the mobile "More" sheet rather than duplicated per surface.
 *
 * Takes an array of container refs, not just one: the avatar panel has two
 * concurrent DOM occurrences (desktop row 1, mobile header) swapped by
 * responsive CSS rather than conditional rendering, both driven by the same
 * `isOpen` state. A click "outside" must mean outside *every* container --
 * checking just one would see a real click inside the visible panel as
 * outside the other (hidden, irrelevant) one and close the shared state.
 */
function useDismissOnOutsideOrEscape(
  containerRefs:
    | { current: HTMLElement | null }
    | { current: HTMLElement | null }[],
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const refs = Array.isArray(containerRefs) ? containerRefs : [containerRefs];
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const insideAny = refs.some(
        (ref) => ref.current && ref.current.contains(target),
      );
      if (!insideAny) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);
}

type ClockLike = {
  dateTime: string;
  countdown: string;
  isClosed: boolean;
  remainingSeconds: number;
};

type CountdownTier = "normal" | "warn" | "danger" | "closed";

function countdownTier(clock: ClockLike): CountdownTier {
  if (clock.isClosed) return "closed";
  if (clock.remainingSeconds <= 900) return "danger";
  if (clock.remainingSeconds <= 3600) return "warn";
  return "normal";
}

const countdownPillTone: Record<CountdownTier, string> = {
  normal: "bg-surface border-border",
  warn: "bg-warn/15 border-warn/30",
  danger: "bg-destructive/15 border-destructive/30",
  closed: "bg-surface border-border",
};

const countdownDigitTone: Record<CountdownTier, string> = {
  normal: "text-primary",
  warn: "text-warn",
  danger: "text-destructive",
  closed: "text-muted-foreground",
};

/**
 * Feature 021, acceptance criteria: urgency communicated by both color AND
 * the label text ("Day ends in" -> "Closing" under 15 minutes) so the
 * state reads without relying on distinguishing amber from red. Digits are
 * `font-mono tabular-nums` so they never jitter width as they tick.
 */
function CountdownPill({
  clock,
  compact = false,
}: {
  clock: ClockLike;
  compact?: boolean;
}) {
  const tier = countdownTier(clock);
  const label = tier === "danger" ? "Closing" : "Day ends in";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border shadow-sm",
        compact ? "px-4 py-2" : "px-7 py-2.5",
        countdownPillTone[tier],
      )}
    >
      <span
        className="text-muted-foreground text-xs font-medium"
        suppressHydrationWarning
      >
        {clock.dateTime}
      </span>
      {clock.isClosed ? (
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            countdownDigitTone[tier],
          )}
          suppressHydrationWarning
        >
          {clock.countdown}
        </span>
      ) : (
        <span className="flex items-baseline gap-2.5">
          <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            {label}
          </span>
          <span
            className={cn(
              "font-mono text-2xl leading-none font-semibold tracking-tight tabular-nums",
              countdownDigitTone[tier],
            )}
            suppressHydrationWarning
          >
            {clock.countdown}
          </span>
        </span>
      )}
    </div>
  );
}

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
  initialAllocationContext = null,
}: {
  demoMode: boolean;
  restaurantSlug: string;
  initialUser?: SignedInUser | null;
  initialScheduleContext?: ScheduleContext | null;
  initialTipsContext?: TipsContext | null;
  initialAllocationContext?: AllocationContext | null;
}) {
  const [user, setUser] = useState<SignedInUser | null>(initialUser);
  const [tab, setTab] = useState<AppTab>("allocation");
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
  const [demoAttendanceLinks, setDemoAttendanceLinks] = useState<
    Record<string, number>
  >({});

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
  const [showChangePasscode, setShowChangePasscode] = useState(false);
  // Feature 021: the avatar quick-settings panel (desktop) and the mobile
  // "More" sheet are two different surfaces for the same underlying
  // secondary-tab/settings content, each with its own open state -- never
  // both open at once in practice (one is lg:hidden, the other lg:flex),
  // but kept as separate booleans rather than one shared "menu open" flag
  // so closing one on outside-click can never accidentally read as closing
  // the other on a viewport resize.
  const [showAvatarPanel, setShowAvatarPanel] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  // Two DOM occurrences of the avatar trigger+panel exist at once (desktop
  // row 1 and the mobile header), swapped by responsive CSS rather than
  // conditional rendering -- each needs its own ref, or the second one to
  // mount steals `.current` from the first and every outside-click check
  // resolves against the wrong (often off-screen) subtree.
  const avatarPanelDesktopRef = useRef<HTMLDivElement>(null);
  const avatarPanelMobileRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideOrEscape(
    [avatarPanelDesktopRef, avatarPanelMobileRef],
    showAvatarPanel,
    () => setShowAvatarPanel(false),
  );
  useDismissOnOutsideOrEscape(mobileSheetRef, showMobileSheet, () =>
    setShowMobileSheet(false),
  );
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
  // Feature 019: attendanceTab is now always included -- Team stays
  // manager-only. Feature 020 Phase 2: payrollTab is manager-only AND
  // real-mode-only (demo mode has no data source for it yet). Feature 021:
  // split into desktop's two weighted tiers; secondaryTabs alone (without
  // Schedule) is also exactly the manager-only/universal tab set the
  // avatar panel and mobile sheet need.
  const secondaryTabs = [
    scheduleTab,
    ...(isManager ? [teamTab] : []),
    attendanceTab,
    ...(!demoMode ? [payrollTab] : []),
  ];
  // Mobile sheet ("More" tab) collects everything not in the 3-button fixed dock
  const moreTabs = [...secondaryTabs];
  // Narrowing doesn't cross into the nested function declarations below —
  // capture a non-null local so TypeScript can see it there too.
  const currentUser = user;

  // Feature 017: `team` now includes deactivated members too (so the Team
  // tab can offer "Reactivate" -- see getOrganizationRoster's doc
  // comment), but nowhere else should ever offer a deactivated person as
  // a new assignment target. Schedule/allocation/tips all get this
  // filtered view; only TeamWorkspace gets the full `team`.
  const activeTeam = team.filter((member) => member.active !== false);

  /**
   * Feature 017: signs the client out cleanly and returns to the
   * passcode screen -- the same as clicking "Sign out" -- rather than
   * leaving a stale, no-longer-authorized session's UI on screen. Also
   * clears the (already-dead, since this only ever runs after the
   * server reported the session invalid) local Supabase cookie, same as
   * a normal sign-out -- fire-and-forget, since nothing meaningful
   * depends on it finishing before the UI switches to the login screen.
   */
  function forceSignOut() {
    if (!demoMode) void fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    setTab("schedule");
  }

  /**
   * The single reaction point for every real-mode action whose result
   * reports `sessionInvalid` (set by requireLiveSession, shared across
   * every Server Action file) -- most commonly, this person was
   * deactivated mid-session. An ordinary action failure (no
   * sessionInvalid flag) still goes to the normal actionError banner.
   */
  function handleActionFailure(error: string, sessionInvalid?: boolean) {
    if (sessionInvalid) {
      forceSignOut();
      return;
    }
    setActionError(error);
  }

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
      handleActionFailure(result.error, result.sessionInvalid);
      return;
    }
    setShifts((current) => [...current, ...result.data]);
  }

  // Feature 027. Editing/deleting a shift, published or draft alike --
  // there was no such action before this feature (see
  // tasks/current-task.md's Investigation #2). Optimistic update of the
  // parent's own `shifts` state mirrors addShifts's exact pattern: real
  // mode applies the same patch only after the action confirms success,
  // demo mode applies it directly. ScheduleWorkspace derives whichever
  // week it's showing from this same `shifts` prop -- unchanged for the
  // initial week, filtered fresh for a demo-mode browsed week, and
  // re-fetched (via its own afterMutation -> weekReloadKey) for a
  // real-mode browsed week.
  function applyShiftEdit(
    current: DemoShift[],
    shiftId: string,
    edit: {
      employeeId: string;
      shiftKind: ShiftKind;
      startLocal: string;
      endLocal: string;
      note?: string;
    },
  ): DemoShift[] {
    return current.map((shift) =>
      shift.id === shiftId
        ? {
            ...shift,
            employeeId: edit.employeeId,
            shiftKind: edit.shiftKind,
            startLocal: edit.startLocal,
            endLocal: edit.endLocal,
            endDate:
              edit.endLocal <= edit.startLocal
                ? addDays(shift.serviceDate, 1)
                : shift.serviceDate,
            usesDefaultTime: false,
            note: edit.note,
          }
        : shift,
    );
  }

  async function updateShift(input: {
    shiftId: string;
    employeeId: string;
    shiftKind: ShiftKind;
    startLocal: string;
    endLocal: string;
    note?: string;
  }): Promise<ShiftEditResult> {
    if (demoMode) {
      setShifts((current) => applyShiftEdit(current, input.shiftId, input));
      return { ok: true };
    }
    if (!locationId) return { ok: false, error: "No location is set up yet." };
    const result = await updateShiftAction({
      restaurantSlug,
      organizationId: currentUser.organizationId,
      shiftId: input.shiftId,
      timeZone,
      employeeId: input.employeeId,
      shiftKind: input.shiftKind,
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      note: input.note,
    });
    if (!result.ok) {
      if (result.sessionInvalid) forceSignOut();
      return { ok: false, error: result.error };
    }
    setShifts((current) => applyShiftEdit(current, input.shiftId, input));
    return { ok: true };
  }

  async function deleteShift(input: {
    shiftId: string;
  }): Promise<ShiftEditResult> {
    if (demoMode) {
      setShifts((current) =>
        current.filter((shift) => shift.id !== input.shiftId),
      );
      return { ok: true };
    }
    if (!locationId) return { ok: false, error: "No location is set up yet." };
    const result = await deleteShiftAction({
      restaurantSlug,
      organizationId: currentUser.organizationId,
      shiftId: input.shiftId,
    });
    if (!result.ok) {
      if (result.sessionInvalid) forceSignOut();
      return { ok: false, error: result.error };
    }
    setShifts((current) =>
      current.filter((shift) => shift.id !== input.shiftId),
    );
    return { ok: true };
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
        handleActionFailure(result.error, result.sessionInvalid);
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
        handleActionFailure(result.error, result.sessionInvalid);
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
    if (!result.ok) {
      if (result.sessionInvalid) forceSignOut();
      return { ok: false, error: result.error };
    }
    setTipPoolId(result.data.tipPoolId);
    setTipIntervals((current) => [...current, result.data.interval]);
    return { ok: true };
  }

  // Feature 029. Read-only convenience lookup, never a write -- demo
  // mode resolves it from the same in-memory demoAttendanceLinks map
  // Team's own link dialog already writes to (empty until a manager
  // deliberately links someone), crossed against demoNeonAttendance's
  // fixture rows for tipsServiceDate; real mode re-derives everything
  // server-side via getClockedInRosterAction.
  async function pullClockedInTeam(): Promise<
    { ok: true; data: string[] } | { ok: false; error: string }
  > {
    if (demoMode) {
      const activeNeonUserIds = new Set(
        demoNeonAttendance
          .filter(
            (row) =>
              row.date === tipsServiceDate &&
              row.clockIn &&
              !row.clockOut &&
              !row.autoClockedOut,
          )
          .map((row) => row.userId),
      );
      const profileIds = Object.entries(demoAttendanceLinks)
        .filter(([, neonUserId]) => activeNeonUserIds.has(neonUserId))
        .map(([profileId]) => profileId);
      return { ok: true, data: profileIds };
    }
    const result = await getClockedInRosterAction({ restaurantSlug });
    if (!result.ok) {
      if (result.sessionInvalid) forceSignOut();
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.data.profileIds };
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
        handleActionFailure(result.error, result.sessionInvalid);
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
        handleActionFailure(result.error, result.sessionInvalid);
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

  /**
   * Feature 014's demo behavior, now dual-mode (Feature 015 Phase E).
   * Updates both the roster row's designation AND its derived AppRole
   * together (never one without the other — see the comment on
   * TeamMember.designation), and in demo mode also syncs the matching
   * `demoAccounts` login-identity entry if this member has one, so a
   * promotion or demotion actually takes effect the next time they sign
   * in. Neither mode retroactively changes an already-open session's
   * `user` state (that would need a session-claim refresh in real mode
   * too) — signing out and back in is what picks up the new designation,
   * same as a real RLS-backed session needs a fresh JWT. Who may change
   * whose designation is enforced by the existing `memberships_update_manager`
   * RLS policy in real mode (unchanged by this feature); the client only
   * ever offers an allowed option via `assignableDesignations`.
   */
  async function changeDesignation(memberId: string, next: Designation) {
    if (!demoMode) {
      const previous = team.find((member) => member.id === memberId);
      const result = await updateTeamDesignationAction({
        restaurantSlug,
        organizationId: currentUser.organizationId,
        targetProfileId: memberId,
        previousDesignation: previous?.designation ?? next,
        nextDesignation: next,
      });
      if (!result.ok) {
        handleActionFailure(result.error, result.sessionInvalid);
        return;
      }
      setTeam((current) =>
        current.map((member) =>
          member.id === memberId
            ? { ...member, designation: next, role: designationToRole(next) }
            : member,
        ),
      );
      return;
    }

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

  /**
   * Feature 024. Mirrors changeDesignation's exact shape: demo mode
   * updates team/demoAccounts locally, real mode calls the action (which
   * is authorized entirely by the new profiles_update_manager RLS
   * policy, not re-checked here) then applies the same local update.
   * Like changeDesignation, this does not update the signed-in `user`
   * object even when an owner renames themselves -- a pre-existing,
   * unchanged limitation (the header would show the old name until the
   * next reload), not something this feature introduces or fixes.
   */
  async function renameTeamMember(input: {
    targetProfileId: string;
    previousDisplayName: string;
    nextDisplayName: string;
  }): Promise<RenameMemberResult> {
    if (!demoMode) {
      const result = await renameTeamMemberAction({
        restaurantSlug,
        organizationId: currentUser.organizationId,
        targetProfileId: input.targetProfileId,
        previousDisplayName: input.previousDisplayName,
        nextDisplayName: input.nextDisplayName,
      });
      if (!result.ok) {
        handleActionFailure(result.error, result.sessionInvalid);
        return result;
      }
    }
    setTeam((current) =>
      current.map((member) =>
        member.id === input.targetProfileId
          ? { ...member, name: input.nextDisplayName }
          : member,
      ),
    );
    setDemoAccounts((current) => {
      let changed = false;
      const updated = { ...current };
      for (const [passcode, account] of Object.entries(current)) {
        if (account.profileId === input.targetProfileId) {
          updated[passcode] = { ...account, name: input.nextDisplayName };
          changed = true;
        }
      }
      return changed ? updated : current;
    });
    return { ok: true };
  }

  async function loadAttendanceLinkOptions(): Promise<
    { ok: true; data: AttendanceLinkOptions } | { ok: false; error: string }
  > {
    if (demoMode) {
      return {
        ok: true,
        data: {
          users: demoNeonUsers.filter((candidate) => candidate.isActive),
          links: Object.entries(demoAttendanceLinks).map(
            ([profileId, neonUserId]) => ({ profileId, neonUserId }),
          ),
        },
      };
    }
    const result = await getAttendanceLinkOptionsAction({ restaurantSlug });
    if (!result.ok && result.sessionInvalid) {
      forceSignOut();
    }
    return result;
  }

  async function linkAttendanceIdentity(input: {
    targetProfileId: string;
    neonUserId: number;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      const claimant = Object.entries(demoAttendanceLinks).find(
        ([profileId, neonUserId]) =>
          profileId !== input.targetProfileId &&
          neonUserId === input.neonUserId,
      );
      if (claimant) {
        return {
          ok: false,
          error:
            "That attendance record is already linked to a different person.",
        };
      }
      setDemoAttendanceLinks((current) => ({
        ...current,
        [input.targetProfileId]: input.neonUserId,
      }));
      return { ok: true };
    }

    const result = await setAttendanceIdentityLinkAction({
      restaurantSlug,
      ...input,
    });
    if (!result.ok) {
      handleActionFailure(result.error, result.sessionInvalid);
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }

  async function unlinkAttendanceIdentity(input: {
    targetProfileId: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      setDemoAttendanceLinks((current) => {
        const next = { ...current };
        delete next[input.targetProfileId];
        return next;
      });
      return { ok: true };
    }

    const result = await removeAttendanceIdentityLinkAction({
      restaurantSlug,
      targetProfileId: input.targetProfileId,
    });
    if (!result.ok) {
      handleActionFailure(result.error, result.sessionInvalid);
      return { ok: false, error: result.error };
    }
    return { ok: true };
  }

  /**
   * Feature 016, self-service change: any signed-in role, available from
   * the header. Real mode hits POST /api/auth/passcode/change, which
   * verifies currentPasscode itself (signInWithPassword) before touching
   * anything -- this function never re-derives that check client-side.
   * Demo mode approximates the same "prove you know the current one"
   * requirement by matching the typed value against demoAccounts' own key.
   */
  async function changeMyPasscode(input: {
    currentPasscode: string;
    newPasscode: string;
  }): Promise<ChangePasscodeResult> {
    if (demoMode) {
      const currentEntry = demoAccounts[input.currentPasscode];
      if (!currentEntry || currentEntry.profileId !== currentUser.profileId) {
        return { ok: false, error: "Current passcode not recognized." };
      }
      if (demoAccounts[input.newPasscode]) {
        return {
          ok: false,
          error: "That passcode is already in use — choose a different one.",
        };
      }
      setDemoAccounts((current) => {
        const updated = { ...current };
        delete updated[input.currentPasscode];
        updated[input.newPasscode] = currentEntry;
        return updated;
      });
      return { ok: true };
    }

    const response = await fetch("/api/auth/passcode/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug,
        currentPasscode: input.currentPasscode,
        newPasscode: input.newPasscode,
      }),
    });
    const payload = (await response.json()) as {
      ok?: true;
      error?: string;
      sessionInvalid?: true;
    };
    if (!response.ok || !payload.ok) {
      if (payload.sessionInvalid) forceSignOut();
      return {
        ok: false,
        error: payload.error ?? "Unable to change your passcode right now.",
      };
    }
    return { ok: true };
  }

  /**
   * Feature 016, manager/owner reset: authorization is enforced by
   * TeamWorkspace only rendering the reset button for a target
   * `canChangeDesignation` allows (real mode's route re-checks this
   * server-side too, since the client can't be trusted as the only gate).
   * Also doubles as "issue a first passcode" for a demo roster member who
   * doesn't have a `demoAccounts` login entry yet -- built straight from
   * the roster row rather than requiring one to already exist.
   */
  async function resetMemberPasscode(input: {
    targetProfileId: string;
    reason: string;
    newPasscode?: string;
  }): Promise<ResetPasscodeResult> {
    if (demoMode) {
      const target = team.find((member) => member.id === input.targetProfileId);
      if (!target) {
        return { ok: false, error: "That person is not on the roster." };
      }
      if (input.newPasscode && demoAccounts[input.newPasscode]) {
        return {
          ok: false,
          error: "That passcode is already in use — choose a different one.",
        };
      }
      const passcode =
        input.newPasscode ??
        generateDemoPasscode(new Set(Object.keys(demoAccounts)));
      setDemoAccounts((current) => {
        const updated = { ...current };
        for (const [existingPasscode, account] of Object.entries(current)) {
          if (account.profileId === target.id) delete updated[existingPasscode];
        }
        updated[passcode] = {
          profileId: target.id,
          name: target.name,
          role: target.role,
          designation: target.designation,
          organizationId: DEMO_ORGANIZATION_ID,
        };
        return updated;
      });
      return { ok: true, passcode };
    }

    const response = await fetch("/api/auth/passcode/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug,
        targetProfileId: input.targetProfileId,
        reason: input.reason,
        newPasscode: input.newPasscode,
      }),
    });
    const payload = (await response.json()) as {
      ok?: true;
      passcode?: string;
      error?: string;
      sessionInvalid?: true;
    };
    if (!response.ok || !payload.ok || !payload.passcode) {
      if (payload.sessionInvalid) forceSignOut();
      return {
        ok: false,
        error: payload.error ?? "Unable to reset this passcode right now.",
      };
    }
    return { ok: true, passcode: payload.passcode };
  }

  /**
   * Feature 017. Authorization (`canDeactivateMember`) is enforced the
   * same way every other personnel action in this app is: TeamWorkspace
   * only renders the Deactivate button for a target the actor is allowed
   * to touch, and the real-mode route re-checks it server-side too. On
   * success, `team` is updated locally the same way `changeDesignation`
   * already does, rather than waiting on a reload -- so the row flips to
   * "Reactivate" immediately.
   */
  async function deactivateTeamMember(input: {
    targetProfileId: string;
    reason: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      setTeam((current) =>
        current.map((member) =>
          member.id === input.targetProfileId
            ? { ...member, active: false }
            : member,
        ),
      );
      // Also drops their demo login credential, mirroring the real
      // Auth ban -- a deactivated demo member can't sign back in either.
      setDemoAccounts((current) => {
        const updated = { ...current };
        for (const [passcode, account] of Object.entries(current)) {
          if (account.profileId === input.targetProfileId) {
            delete updated[passcode];
          }
        }
        return updated;
      });
      return { ok: true };
    }

    const response = await fetch("/api/team/deactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug,
        targetProfileId: input.targetProfileId,
        reason: input.reason,
      }),
    });
    const payload = (await response.json()) as {
      ok?: true;
      error?: string;
      sessionInvalid?: true;
    };
    if (!response.ok || !payload.ok) {
      if (payload.sessionInvalid) forceSignOut();
      return {
        ok: false,
        error: payload.error ?? "Unable to deactivate this person right now.",
      };
    }
    setTeam((current) =>
      current.map((member) =>
        member.id === input.targetProfileId
          ? { ...member, active: false }
          : member,
      ),
    );
    return { ok: true };
  }

  /**
   * The exact symmetric reverse of deactivateTeamMember. Real mode
   * restores the exact passcode they had before (the credential row's
   * `active` flips back, its locator was never touched) -- demo mode
   * can't do that, since deactivateTeamMember already deleted their
   * demoAccounts entry entirely (there's no inactive-but-remembered
   * credential to restore in the in-memory model), so it silently issues
   * a fresh random one instead. A named, demo-mode-only rough edge, not
   * a real-mode behavior difference.
   */
  async function reactivateTeamMember(input: {
    targetProfileId: string;
    reason: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      const target = team.find((member) => member.id === input.targetProfileId);
      setTeam((current) =>
        current.map((member) =>
          member.id === input.targetProfileId
            ? { ...member, active: true }
            : member,
        ),
      );
      const alreadyHasCredential = Object.values(demoAccounts).some(
        (account) => account.profileId === input.targetProfileId,
      );
      if (target && !alreadyHasCredential) {
        const passcode = generateDemoPasscode(
          new Set(Object.keys(demoAccounts)),
        );
        setDemoAccounts((current) => ({
          ...current,
          [passcode]: {
            profileId: target.id,
            name: target.name,
            role: target.role,
            designation: target.designation,
            organizationId: DEMO_ORGANIZATION_ID,
          },
        }));
      }
      return { ok: true };
    }

    const response = await fetch("/api/team/reactivate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug,
        targetProfileId: input.targetProfileId,
        reason: input.reason,
      }),
    });
    const payload = (await response.json()) as {
      ok?: true;
      error?: string;
      sessionInvalid?: true;
    };
    if (!response.ok || !payload.ok) {
      if (payload.sessionInvalid) forceSignOut();
      return {
        ok: false,
        error: payload.error ?? "Unable to reactivate this person right now.",
      };
    }
    setTeam((current) =>
      current.map((member) =>
        member.id === input.targetProfileId
          ? { ...member, active: true }
          : member,
      ),
    );
    return { ok: true };
  }

  /**
   * Feature 035. Demo mode simulates the same visible effect the real
   * RPC produces -- display_name scrubbed to "Deleted User", a
   * purgedAt timestamp set -- but obviously can't run the actual
   * atomic Postgres function; there's no database here to purge. The
   * confirmName check happens before this is ever called (the dialog
   * itself validates it against member.name), so this function's own
   * job is only the write, same division as deactivate/reactivate.
   */
  async function purgeTeamMember(input: {
    targetProfileId: string;
    confirmName: string;
    reason: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (demoMode) {
      setTeam((current) =>
        current.map((member) =>
          member.id === input.targetProfileId
            ? {
                ...member,
                name: "Deleted User",
                shortName: "Deleted User",
                purgedAt: new Date().toISOString(),
              }
            : member,
        ),
      );
      return { ok: true };
    }

    const response = await fetch("/api/team/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug,
        targetProfileId: input.targetProfileId,
        confirmName: input.confirmName,
        reason: input.reason,
      }),
    });
    const payload = (await response.json()) as {
      ok?: true;
      error?: string;
      sessionInvalid?: true;
    };
    if (!response.ok || !payload.ok) {
      if (payload.sessionInvalid) forceSignOut();
      return {
        ok: false,
        error: payload.error ?? "Unable to purge this person right now.",
      };
    }
    setTeam((current) =>
      current.map((member) =>
        member.id === input.targetProfileId
          ? {
              ...member,
              name: "Deleted User",
              shortName: "Deleted User",
              purgedAt: new Date().toISOString(),
            }
          : member,
      ),
    );
    return { ok: true };
  }

  async function signOut() {
    console.log("Sign out clicked!");
    if (!demoMode) await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    setTab("schedule");
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  const todayWeekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date());
  const todayIndex = weekDays.indexOf(todayWeekdayShort);
  const todayHours = todayIndex >= 0 ? operatingHours[todayIndex] : null;

  function openHours() {
    setShowHours(true);
    setShowAvatarPanel(false);
    setShowMobileSheet(false);
  }

  // Feature 023: distinct from openHours -- "More options" (and every
  // Settings nav entry point) goes to the full Settings page, while the
  // avatar panel's own "Edit" and "Store hours" quick-shortcuts keep
  // opening HoursDialog directly, unchanged (quick mid-shift adjustments
  // stay one click away, per the feature's own User Outcome).
  function openSettingsPage() {
    setTab("settings");
    setShowAvatarPanel(false);
    setShowMobileSheet(false);
  }
  function openChangePasscode() {
    setShowChangePasscode(true);
    setShowAvatarPanel(false);
    setShowMobileSheet(false);
  }
  function goToTab(id: AppTab) {
    setTab(id);
    setShowMobileSheet(false);
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <header className="border-border bg-background sticky top-0 z-40 border-b">
        {/* Desktop row 1: brand, centered countdown pill, avatar pill */}
        <div className="mx-auto hidden min-h-[76px] max-w-[1540px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-8 lg:grid">
          <button
            onClick={() => setTab("allocation")}
            className="flex min-h-11 items-center gap-3 justify-self-start"
            aria-label="Home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.monkswebster.com/assets/img/logo-light.png"
                alt="The Monk's Logo"
                className="h-6 object-contain"
              />
            </span>
            <span className="text-left">
              <span className="block text-sm font-bold tracking-tight">
                The Monk&apos;s
              </span>
            </span>
          </button>

          <CountdownPill clock={clock} />

          <div
            className="relative justify-self-end"
            ref={avatarPanelDesktopRef}
          >
            <button
              onClick={() => setShowAvatarPanel((open) => !open)}
              aria-expanded={showAvatarPanel}
              aria-haspopup="true"
              aria-label="Account and quick settings"
              className="border-border bg-surface flex items-center gap-2.5 rounded-full border py-1.5 pr-3.5 pl-1.5"
            >
              <span className="bg-avatar grid size-10 place-items-center rounded-full text-sm font-bold">
                {initials}
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold">{user.name}</span>
                <span className="text-muted-foreground block text-xs capitalize">
                  {user.role.replace("_", " ")}
                </span>
              </span>
              {showAvatarPanel ? (
                <ChevronUp
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              )}
            </button>

            {showAvatarPanel ? (
              <div
                data-testid="account-menu"
                className="border-border bg-card absolute top-full right-0 z-50 mt-2 w-[380px] overflow-hidden rounded-[20px] border shadow-2xl"
              >
                <div className="border-border/60 flex items-center justify-between border-b px-[18px] py-3.5">
                  <span className="text-faint text-[10px] font-semibold tracking-[0.12em] uppercase">
                    Appearance
                  </span>
                  <AppearanceSwitch />
                </div>
                <div className="border-border/60 space-y-3 border-b px-[18px] py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-faint text-[10px] font-semibold tracking-[0.12em] uppercase">
                      Shift hours
                    </span>
                    {isManager ? (
                      <Button variant="secondary" size="sm" onClick={openHours}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Morning</span>
                      <span className="text-muted-foreground font-mono">
                        {shiftDefaults.morning.start} –{" "}
                        {shiftDefaults.morning.end}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Evening</span>
                      <span className="text-muted-foreground font-mono">
                        {shiftDefaults.evening.start} –{" "}
                        {shiftDefaults.evening.end}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Full day</span>
                      <span className="text-muted-foreground font-mono">
                        {shiftDefaults.full_day.start} –{" "}
                        {shiftDefaults.full_day.end}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border-border/60 space-y-1 border-b px-[18px] py-4">
                  <span className="text-faint text-[10px] font-semibold tracking-[0.12em] uppercase">
                    Store hours
                  </span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-base font-semibold">
                      Today, {todayWeekdayShort}
                    </span>
                    <span className="text-primary font-mono text-base">
                      {todayHours
                        ? todayHours.closed
                          ? "Closed"
                          : `${todayHours.opening} – ${todayHours.closing}`
                        : "—"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {timeZone}. Overnight closing times supported.
                  </p>
                </div>
                <div className="space-y-0.5 p-2">
                  <button
                    onClick={openChangePasscode}
                    className="hover:bg-muted flex min-h-13 w-full items-center gap-3 rounded-xl px-2.5 text-left"
                  >
                    <KeyRound
                      className="text-muted-foreground size-[18px]"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-medium">
                      Change passcode
                    </span>
                  </button>
                  {isManager ? (
                    <button
                      onClick={openHours}
                      className="hover:bg-muted flex min-h-13 w-full items-center gap-3 rounded-xl px-2.5 text-left"
                    >
                      <Store
                        className="text-muted-foreground size-[18px]"
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm font-medium">
                        Store hours
                      </span>
                      <span className="text-faint text-xs">Mon–Sun</span>
                    </button>
                  ) : null}
                </div>
                <div className="border-border/60 space-y-2 border-t px-3.5 py-3">
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={openSettingsPage}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    More options
                  </Button>
                  <button
                    onClick={signOut}
                    className="text-destructive hover:bg-destructive/10 flex min-h-13 w-full items-center gap-3 rounded-xl px-2.5 text-left"
                  >
                    <LogOut className="size-[18px]" aria-hidden="true" />
                    <span className="text-sm font-semibold">Sign out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Desktop row 2: weighted nav -- primary (underlined), divider,
            secondary (icon+label), Settings trigger far right. */}
        <div className="border-border/60 bg-card hidden items-center gap-4 border-t border-b px-8 lg:flex">
          <div className="flex gap-1.5">
            {primaryTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "flex h-14 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap",
                  tab === id
                    ? "border-primary text-foreground"
                    : "text-foreground/80 hover:text-foreground border-transparent",
                )}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <span className="bg-border h-6.5 w-px" />
          <div className="flex gap-0.5">
            {secondaryTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "flex h-14 items-center gap-1.5 px-3.5 text-[13px] font-medium whitespace-nowrap",
                  tab === id ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => setTab("settings")}
          >
            <Settings2 aria-hidden="true" />
            Settings
          </Button>
        </div>

        {/* Mobile header: brand + avatar row, then the countdown pill. */}
        <div
          className="flex flex-col gap-3.5 px-4 py-3.5 lg:hidden"
          ref={avatarPanelMobileRef}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab("allocation")}
              className="flex min-h-11 items-center gap-2.5"
              aria-label="Home"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.monkswebster.com/assets/img/logo-light.png"
                  alt="The Monk's Logo"
                  className="h-5 object-contain"
                />
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">The Monk&apos;s</span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={() => setShowChangePasscode(true)}
              aria-label="Change your passcode"
            >
              <KeyRound />
            </Button>
            <button
              onClick={() => setShowAvatarPanel((open) => !open)}
              aria-expanded={showAvatarPanel}
              aria-label="Account and quick settings"
              className="border-border bg-surface flex min-h-11 items-center gap-2 rounded-full border py-1 pr-2.5 pl-1"
            >
              <span className="bg-avatar grid size-[34px] place-items-center rounded-full text-xs font-bold">
                {initials}
              </span>
              <ChevronDown
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            </button>
          </div>
          <CountdownPill clock={clock} compact />
          {showAvatarPanel ? (
            <div
              data-testid="account-menu"
              className="border-border bg-card absolute top-[calc(100%+0.5rem)] right-0 z-50 min-w-64 space-y-1 rounded-2xl border p-2 shadow-xl"
            >
              <div className="border-border/60 mb-1 flex flex-col border-b px-2.5 pb-2">
                <span className="text-sm font-semibold">{user.name}</span>
                <span className="text-muted-foreground text-xs capitalize">
                  {user.role.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-faint text-[10px] font-semibold tracking-[0.12em] uppercase">
                  Appearance
                </span>
                <AppearanceSwitch />
              </div>
              <button
                onClick={openSettingsPage}
                className="hover:bg-muted flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left"
              >
                <Settings2
                  className="text-muted-foreground size-[18px]"
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm font-medium">Settings</span>
              </button>
              <button
                onClick={signOut}
                className="text-destructive hover:bg-destructive/10 flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left"
              >
                <LogOut className="size-[18px]" aria-hidden="true" />
                <span className="text-sm font-semibold">Sign out</span>
              </button>
            </div>
          ) : null}
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
            team={activeTeam}
            shiftDefaults={shiftDefaults}
            shifts={shifts}
            weekDates={weekDates}
            monthDates={monthDates}
            timeZone={timeZone}
            restaurantSlug={restaurantSlug}
            demoMode={demoMode}
            onAddShifts={addShifts}
            onPublish={publishSchedule}
            onUpdateShift={updateShift}
            onDeleteShift={deleteShift}
          />
        ) : null}
        {tab === "allocation" ? (
          <AllocationWorkspace
            user={user}
            team={activeTeam}
            boardLocked={tipsStatus === "finalized"}
            onReopenTips={reopenTips}
            tipsAuditLog={tipsAuditLog}
            demoMode={demoMode}
            restaurantSlug={restaurantSlug}
            initialContext={initialAllocationContext}
            onSessionInvalid={forceSignOut}
          />
        ) : null}
        {tab === "tips" ? (
          <TipWorkspace
            user={user}
            team={activeTeam}
            status={tipsStatus}
            intervals={tipIntervals}
            onAddInterval={addTipInterval}
            onFinalize={finalizeTips}
            onReopen={reopenTips}
            onPullClockedInTeam={pullClockedInTeam}
            auditLog={tipsAuditLog}
          />
        ) : null}
        {tab === "team" && isManager ? (
          <TeamWorkspace
            user={user}
            team={team}
            onChangeDesignation={changeDesignation}
            onRenameMember={renameTeamMember}
            onResetPasscode={resetMemberPasscode}
            onDeactivate={deactivateTeamMember}
            onReactivate={reactivateTeamMember}
            onPurge={purgeTeamMember}
            onLoadAttendanceOptions={loadAttendanceLinkOptions}
            onLinkAttendance={linkAttendanceIdentity}
            onUnlinkAttendance={unlinkAttendanceIdentity}
          />
        ) : null}
        {tab === "attendance" ? (
          <AttendanceReport
            restaurantSlug={restaurantSlug}
            demoMode={demoMode}
            timeZone={timeZone}
            user={user}
            demoNeonUserId={demoAttendanceLinks[user.profileId] ?? null}
          />
        ) : null}
        {tab === "payroll" && !demoMode ? (
          <PayrollWorkspace
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            onGoToPayRates={() => setTab("settings")}
          />
        ) : null}
        {tab === "settings" ? (
          <SettingsPage
            isManager={isManager}
            demoMode={demoMode}
            restaurantSlug={restaurantSlug}
            timeZone={timeZone}
            operatingHours={operatingHours}
            shiftDefaults={shiftDefaults}
            todayIndex={todayIndex}
            onEditHours={openHours}
            onChangePasscode={openChangePasscode}
            onGoToTab={(nextTab) => setTab(nextTab)}
            onSignOut={signOut}
            onBack={() => setTab("allocation")}
          />
        ) : null}
      </main>

      {/* Feature 021: fixed 3-button dock -- only the two continuous-
          during-service actions plus "More", matching the reference's
          mobile priority. Everything else (Schedule, Team, Attendance,
          Payroll, Settings) lives in the slide-up sheet below. */}
      <nav
        className="bg-background border-border fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-1.5 border-t px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Mobile navigation"
      >
        <button
          onClick={() => goToTab("allocation")}
          aria-current={tab === "allocation" ? "page" : undefined}
          className={cn(
            "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold",
            tab === "allocation"
              ? "bg-primary text-primary-foreground"
              : "border-border bg-surface text-foreground border",
          )}
        >
          <Table2 className="size-[22px]" aria-hidden="true" />
          Allocation
        </button>
        <button
          onClick={() => goToTab("tips")}
          aria-current={tab === "tips" ? "page" : undefined}
          className={cn(
            "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold",
            tab === "tips"
              ? "bg-primary text-primary-foreground"
              : "border-border bg-surface text-foreground border",
          )}
        >
          <WalletCards className="size-[22px]" aria-hidden="true" />
          Tip Split
        </button>
        <button
          onClick={() => setShowMobileSheet(true)}
          aria-expanded={showMobileSheet}
          className="border-border bg-surface text-muted-foreground flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-semibold"
        >
          <Menu className="size-[22px]" aria-hidden="true" />
          More
        </button>
      </nav>

      {showMobileSheet ? (
        <div
          className="fixed inset-0 z-50 bg-black/55 lg:hidden"
          role="presentation"
        >
          <div
            ref={mobileSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="bg-card border-border absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <span className="bg-border mx-auto mb-3 block h-1 w-10 rounded-full" />
            <div className="space-y-0.5">
              {moreTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => goToTab(id)}
                  className="hover:bg-muted flex min-h-15 w-full items-center gap-3.5 rounded-2xl px-3 text-left"
                >
                  <span className="bg-primary/15 text-primary grid size-10 flex-none place-items-center rounded-xl">
                    <Icon className="size-[19px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block text-[15px] font-semibold">
                      {label}
                    </span>
                  </span>
                  <ChevronDown
                    className="text-muted-foreground size-4 -rotate-90"
                    aria-hidden="true"
                  />
                </button>
              ))}
              <button
                onClick={openSettingsPage}
                className="hover:bg-muted flex min-h-15 w-full items-center gap-3.5 rounded-2xl px-3 text-left"
              >
                <span className="bg-primary/15 text-primary grid size-10 flex-none place-items-center rounded-xl">
                  <Settings2 className="size-[19px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-[15px] font-semibold">
                    Settings
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Preferences, passcode, and more
                  </span>
                </span>
                <ChevronDown
                  className="text-muted-foreground size-4 -rotate-90"
                  aria-hidden="true"
                />
              </button>
              <div className="border-border/60 mt-1.5 flex items-center gap-3.5 border-t px-3 py-3.5">
                <span className="bg-primary/15 text-primary grid size-10 flex-none place-items-center rounded-xl">
                  <Settings2 className="size-[19px]" aria-hidden="true" />
                </span>
                <span className="flex-1 text-[15px] font-semibold">
                  Appearance
                </span>
                <AppearanceSwitch />
              </div>
              <button
                onClick={openChangePasscode}
                className="hover:bg-muted border-border/60 flex min-h-15 w-full items-center gap-3.5 rounded-2xl border-t px-3 text-left"
              >
                <span className="bg-primary/15 text-primary grid size-10 flex-none place-items-center rounded-xl">
                  <KeyRound className="size-[19px]" aria-hidden="true" />
                </span>
                <span className="text-foreground flex-1 text-[15px] font-semibold">
                  Change passcode
                </span>
              </button>
              <button
                onClick={signOut}
                className="hover:bg-destructive/10 border-border/60 flex min-h-15 w-full items-center gap-3.5 rounded-2xl border-t px-3 text-left"
              >
                <span className="bg-destructive/15 text-destructive grid size-10 flex-none place-items-center rounded-xl">
                  <LogOut className="size-[19px]" aria-hidden="true" />
                </span>
                <span className="text-destructive flex-1 text-[15px] font-semibold">
                  Sign out
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showHours && isManager ? (
        <HoursDialog
          hours={operatingHours}
          shiftDefaults={shiftDefaults}
          timeZone={timeZone}
          onClose={() => setShowHours(false)}
          onSave={saveScheduleConfig}
        />
      ) : null}

      {showChangePasscode ? (
        <PasscodeChangeDialog
          onClose={() => setShowChangePasscode(false)}
          onSubmit={changeMyPasscode}
        />
      ) : null}
    </div>
  );
}
