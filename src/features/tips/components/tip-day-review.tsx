"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Lock,
  Pencil,
  RefreshCw,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  describeRemainder,
  splitTenders,
} from "@/features/tips/domain/tender-split";
import {
  liveIntervals,
  reconcileDay,
  type TipsDay,
  type TipsInterval,
} from "@/features/tips/domain/tips-range-model";
import { formatDateTime, money } from "@/features/tips/domain/tips-format";
import {
  REVISION_TITLES,
  summarizeRevision,
} from "@/features/tips/domain/tips-revision-summary";
import type { TeamMember } from "@/lib/demo-data";

type Outcome = { ok: true } | { ok: false; error: string };

export function TipDayReview({
  day,
  team,
  nameOf,
  timeZone,
  onEdit,
  editingId,
  onVoid,
  onRecalculate,
  onReopenLegacy,
}: {
  day: TipsDay | null;
  team: TeamMember[];
  nameOf: (profileId: string) => string;
  timeZone: string;
  onEdit: (interval: TipsInterval) => void;
  editingId: string | null;
  onVoid: (interval: TipsInterval, reason: string) => Promise<Outcome>;
  onRecalculate: () => Promise<Outcome & { message?: string }>;
  onReopenLegacy: (reason: string) => Promise<Outcome>;
}) {
  const locked = day?.status === "finalized";
  const live = useMemo(() => (day ? liveIntervals(day) : []), [day]);
  const voided = useMemo(
    () => (day ? day.intervals.filter((interval) => interval.voided) : []),
    [day],
  );
  const reconciliation = useMemo(() => (day ? reconcileDay(day) : null), [day]);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState("");
  const [recalcNote, setRecalcNote] = useState("");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctError, setCorrectError] = useState("");

  if (!day || day.intervals.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-sm" role="status">
            Nothing saved for this day yet. Save a distribution above to start.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function submitVoid(
    event: FormEvent<HTMLFormElement>,
    interval: TipsInterval,
  ) {
    event.preventDefault();
    setVoidError("");
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 3) {
      setVoidError("Enter a short reason (at least 3 characters).");
      return;
    }
    const result = await onVoid(interval, reason);
    if (!result.ok) setVoidError(result.error);
    else setVoidingId(null);
  }

  async function recalc() {
    setRecalcNote("");
    setRecalcBusy(true);
    try {
      const result = await onRecalculate();
      setRecalcNote(
        result.ok
          ? (result.message ?? "Allocations are up to date.")
          : result.error,
      );
    } finally {
      setRecalcBusy(false);
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCorrectError("");
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 3) {
      setCorrectError("Enter a short reason (at least 3 characters).");
      return;
    }
    const result = await onReopenLegacy(reason);
    if (!result.ok) setCorrectError(result.error);
    else setCorrecting(false);
  }

  return (
    <div className="space-y-4">
      {locked ? (
        <Card className="border-warn/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <Lock className="text-warn mt-0.5 size-5" aria-hidden="true" />
              <p className="text-sm">
                <strong>Locked legacy record.</strong> This day was finalized by
                the earlier workflow, so it cannot be edited. A reasoned,
                audited correction unlocks it.
              </p>
            </div>
            {correcting ? (
              <form
                onSubmit={submitCorrection}
                className="flex flex-wrap items-center gap-2"
              >
                <Input
                  name="reason"
                  aria-label="Reason for correcting this locked record"
                  placeholder="Reason for the correction"
                  className="h-9 w-56"
                  required
                  minLength={3}
                />
                <Button type="submit" size="sm">
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCorrecting(false)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCorrecting(true)}
              >
                Correct locked record
              </Button>
            )}
            {correctError ? (
              <p className="text-destructive w-full text-xs" role="alert">
                {correctError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Intervals</h2>
          </CardHeader>
          <CardContent className="divide-border divide-y p-0 pt-4">
            {live.map((interval) => {
              const split =
                interval.tenderRecorded && interval.participantIds.length > 0
                  ? safeSplit(interval)
                  : null;
              const note = split ? describeRemainder(split, nameOf) : null;
              return (
                <div
                  key={interval.id}
                  className="px-5 py-4"
                  data-testid="tip-interval-row"
                >
                  <div className="grid gap-3 sm:grid-cols-[150px_1fr] sm:items-start">
                    <div>
                      <p className="flex items-center gap-2 font-mono text-sm">
                        <Clock3
                          className="text-muted-foreground size-4"
                          aria-hidden="true"
                        />
                        {interval.start}–{interval.end}
                        {interval.endsNextDay ? (
                          <Badge tone="neutral">+1 day</Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono font-semibold">
                        {money(interval.amountCents ?? 0)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {interval.tenderRecorded
                          ? `${money(interval.cashCents)} cash · ${money(interval.cardCents)} card`
                          : "Cash/card not recorded"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {interval.participantIds.map((id) => (
                          <Badge key={id} tone="neutral">
                            {team.find((member) => member.id === id)
                              ?.shortName ?? nameOf(id)}
                          </Badge>
                        ))}
                      </div>
                      {note ? (
                        <p className="text-muted-foreground text-xs">{note}</p>
                      ) : null}
                      {!locked ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEdit(interval)}
                            aria-pressed={editingId === interval.id}
                            aria-label={`Edit ${interval.start} to ${interval.end}`}
                          >
                            <Pencil aria-hidden="true" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setVoidError("");
                              setVoidingId(
                                voidingId === interval.id ? null : interval.id,
                              );
                            }}
                            aria-label={`Void ${interval.start} to ${interval.end}`}
                          >
                            <Ban aria-hidden="true" /> Void
                          </Button>
                        </div>
                      ) : null}
                      {voidingId === interval.id ? (
                        <form
                          onSubmit={(event) => submitVoid(event, interval)}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <Input
                            name="reason"
                            aria-label="Reason for voiding"
                            placeholder="Why is this entry wrong?"
                            className="h-9 w-64"
                            required
                            minLength={3}
                            maxLength={500}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/40"
                          >
                            Void entry
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setVoidingId(null)}
                          >
                            Cancel
                          </Button>
                          {voidError ? (
                            <p
                              className="text-destructive w-full text-xs"
                              role="alert"
                            >
                              {voidError}
                            </p>
                          ) : null}
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {live.length === 0 ? (
              <p className="text-muted-foreground px-5 py-4 text-sm">
                Every interval on this day has been voided.
              </p>
            ) : null}
            {voided.map((interval) => (
              <div
                key={interval.id}
                className="text-muted-foreground px-5 py-3 text-xs"
              >
                <span className="line-through">
                  {interval.start}–{interval.end} ·{" "}
                  {money(interval.amountCents ?? 0)}
                </span>{" "}
                <Badge tone="neutral">Voided</Badge> {interval.voidReason}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="text-primary size-5" aria-hidden="true" />
                <h2 className="font-semibold">Distribution</h2>
              </div>
              {!locked ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={recalc}
                  disabled={recalcBusy}
                  title="Re-derive the allocations from the saved intervals and people"
                >
                  <RefreshCw aria-hidden="true" />{" "}
                  {recalcBusy ? "Recalculating…" : "Recalculate"}
                </Button>
              ) : null}
            </div>
            {recalcNote ? (
              <p
                className="text-muted-foreground mt-1 text-xs"
                role="status"
                aria-live="polite"
              >
                {recalcNote}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {day.allocations.map((a) => {
              const member = team.find(({ id }) => id === a.profileId);
              return (
                <div
                  key={a.profileId}
                  className="border-border bg-background/60 flex min-h-14 items-center gap-3 rounded-xl border px-3"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: member?.color }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{nameOf(a.profileId)}</p>
                    <p className="text-muted-foreground text-xs">
                      {money(a.cashCents)} cash · {money(a.cardCents)} card
                      {a.unclassifiedCents > 0
                        ? ` · ${money(a.unclassifiedCents)} not split`
                        : ""}
                    </p>
                  </div>
                  <p className="font-mono font-semibold">
                    {money(a.amountCents)}
                  </p>
                </div>
              );
            })}
            <div className="border-primary/20 bg-primary/10 mt-3 flex items-center justify-between rounded-xl border px-3 py-4">
              <p className="font-semibold">Reconciled total</p>
              <p className="text-primary font-mono text-lg font-bold">
                {money(reconciliation?.allocated.totalCents ?? 0)}
              </p>
            </div>
            {reconciliation ? (
              <p
                className={
                  reconciliation.ok
                    ? "text-muted-foreground flex items-center gap-1.5 text-xs"
                    : "text-destructive flex items-center gap-1.5 text-xs"
                }
                role={reconciliation.ok ? "status" : "alert"}
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {reconciliation.ok
                  ? `Cash ${money(reconciliation.entered.cashCents)} + card ${money(reconciliation.entered.cardCents)}${reconciliation.entered.unclassifiedCents ? ` + ${money(reconciliation.entered.unclassifiedCents)} not split` : ""} matches the allocations.`
                  : "The allocations do not match the entered tips. Press Recalculate."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {day.revisions.length > 0 ? (
        <details
          className="border-border rounded-xl border p-4"
          data-testid="tip-change-history"
        >
          <summary className="cursor-pointer text-sm font-semibold">
            Change history ({day.revisions.length})
          </summary>
          <ol className="mt-3 space-y-3">
            {[...day.revisions].reverse().map((revision) => (
              <li key={revision.id} className="text-sm">
                <p>
                  <Badge
                    tone={revision.source === "direct" ? "warning" : "neutral"}
                  >
                    {REVISION_TITLES[revision.action] ?? revision.action}
                  </Badge>{" "}
                  <span className="text-muted-foreground text-xs">
                    {revision.editorProfileId
                      ? nameOf(revision.editorProfileId)
                      : "Unknown"}{" "}
                    · {formatDateTime(revision.at, timeZone)}
                  </span>
                </p>
                <p className="mt-1">
                  {summarizeRevision(revision, timeZone, nameOf)}
                </p>
                {revision.reason ? (
                  <p className="text-muted-foreground text-xs">
                    Reason: {revision.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function safeSplit(interval: TipsInterval) {
  try {
    return splitTenders({
      cashCents: interval.cashCents,
      cardCents: interval.cardCents,
      participantIds: interval.participantIds,
    });
  } catch {
    return null;
  }
}
