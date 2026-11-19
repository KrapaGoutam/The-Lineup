"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Plus, WalletCards, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipDayReview } from "@/features/tips/components/tip-day-review";
import {
  TipIntervalEditor,
  type EditorSubmit,
} from "@/features/tips/components/tip-interval-editor";
import { TipsHistory } from "@/features/tips/components/tips-history";
import type { TipsApi, TipsApiResult } from "@/features/tips/domain/tips-api";
import {
  reconcileDay,
  sumShares,
  type TipsDay,
  type TipsInterval,
  type TipsRange,
} from "@/features/tips/domain/tips-range-model";
import { money, nameResolver } from "@/features/tips/domain/tips-format";
import { formatReportDate } from "@/lib/report-period";
import type { TeamMember } from "@/lib/demo-data";

type Outcome = { ok: true } | { ok: false; error: string };

export function TipsModule({
  team: initialTeam,
  selectableIds: initialSelectable,
  unavailableMessage,
  initialRange,
  today,
  timeZone,
  branchName,
  isManager,
  api,
  onSessionInvalid,
  onLegacyReopened,
}: {
  /** Name directory (current workforce + historical people). */
  team: TeamMember[];
  /** Who may be newly added. Undefined = everyone (demo). */
  selectableIds?: string[];
  /** Set when the location-authorized Tips read failed closed. */
  unavailableMessage?: string;
  initialRange: TipsRange | null;
  /** The location's business date. */
  today: string;
  timeZone: string;
  branchName: string;
  isManager: boolean;
  api: TipsApi;
  onSessionInvalid?: () => void;
  /** A legacy locked day was reopened (the allocation-board lock lifts). */
  onLegacyReopened?: (tipPoolId: number) => void;
}) {
  const [team, setTeam] = useState(initialTeam);
  const [selectable, setSelectable] = useState(initialSelectable);
  const [range, setRange] = useState<TipsRange | null>(initialRange);
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState<"day" | "history">("day");
  const [editing, setEditing] = useState<TipsInterval | null>(null);
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorEpoch, setEditorEpoch] = useState(0);

  const nameOf = useMemo(() => nameResolver(team), [team]);
  const day: TipsDay | null =
    range?.days.find((d) => d.serviceDate === selectedDate) ?? null;

  const guard = useCallback(
    <T,>(
      result: TipsApiResult<T>,
    ): result is Extract<TipsApiResult<T>, { ok: false }> => {
      if (result.ok) return false;
      if (result.sessionInvalid) onSessionInvalid?.();
      return true;
    },
    [onSessionInvalid],
  );

  // Only the newest load may update the screen: rapid date changes must not let an older
  // response land last.
  const loadSeq = useRef(0);
  const reload = useCallback(
    async (date: string): Promise<TipsRange | null> => {
      const mine = ++loadSeq.current;
      const result = await api.loadRange({
        from: date,
        to: date,
        includeRevisions: isManager,
      });
      if (mine !== loadSeq.current) return null;
      if (guard(result)) {
        setNotice({ tone: "error", text: result.error });
        return null;
      }
      setRange(result.data.range);
      if (result.data.team) setTeam(result.data.team);
      if (result.data.selectableIds) setSelectable(result.data.selectableIds);
      setRefreshKey((k) => k + 1);
      return result.data.range;
    },
    [api, guard, isManager],
  );

  // Entering the tab always shows what is saved NOW: the server-rendered snapshot can be
  // stale after earlier saves or another user's edit, and a remount would otherwise lose
  // everything saved in this session.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshing from the backend is the effect's purpose
    void reload(today);
    // Only on mount: later reloads are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDay(date: string) {
    setNotice(null);
    const loaded = await reload(date);
    // A failed load leaves the current day on screen (with the error notice) instead of
    // showing a misleading empty day.
    if (!loaded) return;
    setEditing(null);
    setSelectedDate(date);
    setView("day");
  }

  async function save(values: EditorSubmit): Promise<Outcome> {
    const result = await api.saveInterval({
      serviceDate: selectedDate,
      intervalId: editing?.id,
      expectedRevision: editing?.revision,
      ...values,
    });
    if (guard(result)) {
      if (result.conflict) {
        // The editor remounts with the latest saved values, so the message must live
        // OUTSIDE it (the page notice); the user's unsaved edits are replaced.
        const fresh = await reload(selectedDate);
        const latest =
          editing && fresh
            ? (fresh.days
                .find((d) => d.serviceDate === selectedDate)
                ?.intervals.find((i) => i.id === editing.id && !i.voided) ??
              null)
            : null;
        setEditing(latest);
        const text = `${result.error} Your edits were not saved; the latest saved version is shown.`;
        setNotice({ tone: "error", text });
        return { ok: false, error: text };
      }
      return { ok: false, error: result.error };
    }
    const wasEdit = editing !== null;
    await reload(selectedDate);
    setEditing(null);
    setEditorEpoch((n) => n + 1);
    setNotice({
      tone: "ok",
      text: wasEdit
        ? "Updated. The previous values are in the change history."
        : "Saved.",
    });
    return { ok: true };
  }

  async function voidInterval(
    interval: TipsInterval,
    reason: string,
  ): Promise<Outcome> {
    const result = await api.voidInterval({
      intervalId: interval.id,
      expectedRevision: interval.revision,
      reason,
    });
    if (guard(result)) {
      if (result.conflict) await reload(selectedDate);
      return { ok: false, error: result.error };
    }
    await reload(selectedDate);
    if (editing?.id === interval.id) setEditing(null);
    setNotice({
      tone: "ok",
      text: "Entry voided. It is kept in the change history.",
    });
    return { ok: true };
  }

  async function recalculate(): Promise<Outcome & { message?: string }> {
    if (!day) return { ok: false, error: "Nothing to recalculate." };
    const result = await api.recalculate(day.poolId);
    if (guard(result)) return { ok: false, error: result.error };
    await reload(selectedDate);
    return {
      ok: true,
      message: result.data.changed
        ? "Allocations were rebuilt from the saved intervals."
        : "Allocations are already up to date.",
    };
  }

  async function reopenLegacy(reason: string): Promise<Outcome> {
    if (!day) return { ok: false, error: "Nothing to correct." };
    const result = await api.reopenLegacy(day.poolId, reason);
    if (guard(result)) return { ok: false, error: result.error };
    await reload(selectedDate);
    onLegacyReopened?.(day.poolId);
    setNotice({
      tone: "ok",
      text: "Unlocked for correction. The reason is recorded.",
    });
    return { ok: true };
  }

  async function pull() {
    const result = await api.pullClockedIn();
    if (guard(result)) return { ok: false as const, error: result.error };
    return { ok: true as const, data: result.data };
  }

  if (unavailableMessage) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">Tip split</h1>
        <Card>
          <CardContent className="p-6">
            <p role="status" className="text-muted-foreground text-sm">
              {unavailableMessage}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Staff: own estimate and own history only -----------------------------------------
  if (!isManager) {
    const ownDay = range?.days.find((d) => d.serviceDate === today) ?? null;
    const ownTotal = ownDay ? sumShares(ownDay.allocations) : null;
    return (
      <div className="space-y-4">
        <div className="print:hidden">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Tips</Badge>
            <Badge tone="warning">Estimate</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            My tip estimate
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Only your own amounts are shown. Your manager enters and can correct
            the distribution; corrections update your figures.
          </p>
        </div>
        <Card className="border-primary/20 overflow-hidden bg-[linear-gradient(135deg,rgba(242,166,90,0.16),rgba(242,166,90,0.03))] print:hidden">
          <CardContent className="p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-primary text-xs font-bold tracking-[0.16em] uppercase">
                  Estimated today
                </p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.05em]">
                  {money(ownTotal?.totalCents ?? 0)}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  Across {ownDay?.intervals.length ?? 0} confirmed work
                  intervals
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {money(ownTotal?.cashCents ?? 0)} cash ·{" "}
                  {money(ownTotal?.cardCents ?? 0)} card
                  {ownTotal?.unclassifiedCents
                    ? ` · ${money(ownTotal.unclassifiedCents)} not split`
                    : ""}
                </p>
              </div>
              <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-2xl">
                <WalletCards className="size-6" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>
        {ownDay && ownDay.intervals.length > 0 ? (
          <Card className="print:hidden">
            <CardHeader>
              <h2 className="font-semibold">
                How your estimate was calculated
              </h2>
            </CardHeader>
            <CardContent className="divide-border divide-y p-0 pt-4">
              {ownDay.intervals.map((interval) => {
                const mine = sumShares(interval.shares);
                return (
                  <div
                    key={interval.id}
                    className="flex items-center gap-3 px-5 py-4"
                  >
                    <span className="bg-secondary grid size-10 place-items-center rounded-xl">
                      <Clock3
                        className="text-muted-foreground size-4"
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm">
                        {interval.start}–{interval.end}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Shared among {interval.participantCount} people ·{" "}
                        {money(mine.cashCents)} cash · {money(mine.cardCents)}{" "}
                        card
                      </p>
                    </div>
                    <p className="font-mono font-semibold">
                      {money(mine.totalCents)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
        <section aria-label="My tips history" className="space-y-3">
          <h2 className="text-xl font-semibold print:hidden">
            My tips history
          </h2>
          <TipsHistory
            api={api}
            today={today}
            timeZone={timeZone}
            branchName={branchName}
            isManager={false}
            nameOf={nameOf}
            refreshKey={0}
          />
        </section>
      </div>
    );
  }

  // ---- Manager ------------------------------------------------------------------------------
  const locked = day?.status === "finalized";
  const totals = day ? sumShares(day.allocations) : null;
  const reconciliation = day ? reconcileDay(day) : null;
  const peopleCount = day?.allocations.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Tips</Badge>
            <Badge tone={locked ? "warning" : "success"}>
              {locked ? "Locked (legacy)" : day ? "Saved" : "Not started"}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            Tip split
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Save cash and card tips for each interval and confirm who worked it.
            Saved distributions stay editable: Update with a reason and every
            change is kept in the change history. Attendance only suggests
            people; you approve the list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setView("day");
              setEditing(null);
              setEditorEpoch((n) => n + 1);
            }}
          >
            <Plus aria-hidden="true" /> New distribution
          </Button>
          <Button
            variant="outline"
            aria-pressed={view === "history"}
            onClick={() => setView(view === "history" ? "day" : "history")}
          >
            <History aria-hidden="true" />{" "}
            {view === "history" ? "Back to day" : "View history"}
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`text-sm print:hidden ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {notice.text}
        </p>
      ) : null}

      {view === "history" ? (
        <TipsHistory
          api={api}
          today={today}
          timeZone={timeZone}
          branchName={branchName}
          isManager
          nameOf={nameOf}
          onOpenDay={openDay}
          refreshKey={refreshKey}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <div className="space-y-1">
              <Label htmlFor="tips-service-date">Service date</Label>
              <Input
                id="tips-service-date"
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && openDay(e.target.value)}
              />
            </div>
            {selectedDate !== today ? (
              <Button variant="ghost" size="sm" onClick={() => openDay(today)}>
                Back to today
              </Button>
            ) : null}
            <p className="text-muted-foreground pb-2 text-sm">
              {formatReportDate(selectedDate)}
            </p>
          </div>

          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden"
            aria-label="Tip summary"
          >
            <SummaryCard
              label="Cash tips"
              value={money(totals?.cashCents ?? 0)}
            />
            <SummaryCard
              label="Card tips"
              value={money(totals?.cardCents ?? 0)}
            />
            <SummaryCard
              label="Combined"
              value={money(totals?.totalCents ?? 0)}
              note={
                reconciliation
                  ? reconciliation.ok
                    ? "Reconciled"
                    : "Needs recalculation"
                  : undefined
              }
            />
            <SummaryCard label="People included" value={String(peopleCount)} />
          </section>

          <div className="print:hidden">
            <TipIntervalEditor
              key={`${editing?.id ?? "new"}-${editing?.revision ?? 0}-${selectedDate}-${editorEpoch}`}
              mode={editing ? "edit" : "create"}
              interval={editing ?? undefined}
              team={team}
              selectableIds={selectable}
              nameOf={nameOf}
              onSubmit={save}
              onCancel={() => setEditing(null)}
              onPullClockedIn={pull}
              locked={Boolean(locked)}
            />
          </div>

          <div className="print:hidden">
            <TipDayReview
              day={day}
              team={team}
              nameOf={nameOf}
              timeZone={timeZone}
              editingId={editing?.id ?? null}
              onEdit={(interval) => {
                setNotice(null);
                setEditing(interval);
              }}
              onVoid={voidInterval}
              onRecalculate={recalculate}
              onReopenLegacy={reopenLegacy}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold">{value}</p>
        {note ? (
          <p className="text-muted-foreground mt-1 text-xs">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
