"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  correctAttendanceSessionAction,
  getAttendanceSessionDetailAction,
  type SessionDetailView,
} from "@/features/attendance/actions/native-report-actions";
import {
  buildCorrectionPreview,
  CORRECTION_REASON_MAX,
  CORRECTION_REASON_MIN,
  type CorrectionSessionState,
} from "@/features/attendance/domain/attendance-correction";
import { formatWorkedDuration } from "@/features/attendance/domain/attendance-session";
import {
  formToProposal,
  hasProposalChanges,
  initialFormValue,
  toCorrectionBreakStates,
  type CorrectionFormValue,
} from "@/features/attendance/domain/correction-form";
import {
  describePayable,
  formatInstantInZone,
  NATIVE_REPORT_SOURCE_LABEL,
  type NativeReportRow,
} from "@/features/attendance/domain/native-report";

const CLASS_LABELS = {
  unclassified: "Not yet decided",
  paid: "Paid break",
  unpaid: "Unpaid break",
} as const;

type Step = "edit" | "review" | "done";

/**
 * V2-006.004. Inspect a native attendance record, correct it with a mandatory reason, review
 * the exact changes and projected totals, then confirm. Original events are never edited:
 * the history below always shows them next to every correction. The database function is the
 * authority for every rule; the preview only explains problems early.
 */
export function AttendanceCorrectionDialog({
  row,
  restaurantSlug,
  timeZone,
  canManage,
  onClose,
  onCorrected,
}: {
  row: NativeReportRow;
  restaurantSlug: string;
  timeZone: string;
  canManage: boolean;
  onClose: () => void;
  onCorrected: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetailView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState<Step>("edit");
  const [form, setForm] = useState<CorrectionFormValue | null>(null);
  const [reason, setReason] = useState("");
  const [voidMode, setVoidMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [savedSeq, setSavedSeq] = useState<number | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const editable = canManage && row.status !== "voided";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await getAttendanceSessionDetailAction({
        restaurantSlug,
        sessionId: row.sessionId,
      });
      if (cancelled) return;
      if (!result.ok) {
        setDetailError(result.error);
        return;
      }
      setDetailError(null);
      setDetail(result.data);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, row.sessionId, reloadKey]);

  const session: CorrectionSessionState | null = useMemo(
    () =>
      detail
        ? {
            status: row.status,
            clockInAt: row.clockInAt,
            clockOutAt: row.clockOutAt,
            breaks: toCorrectionBreakStates(detail.breaks),
          }
        : null,
    [detail, row.status, row.clockInAt, row.clockOutAt],
  );

  const initial = useMemo(
    () => (session ? initialFormValue(session, timeZone) : null),
    [session, timeZone],
  );
  const current = form ?? initial;

  const proposalResult = useMemo(
    () =>
      initial && current && !voidMode
        ? formToProposal(initial, current, timeZone)
        : null,
    [initial, current, voidMode, timeZone],
  );
  const proposal = useMemo(
    () =>
      voidMode
        ? { void: true as const }
        : proposalResult?.ok
          ? proposalResult.proposal
          : null,
    [voidMode, proposalResult],
  );

  const preview = useMemo(
    () =>
      session && proposal ? buildCorrectionPreview(session, proposal) : null,
    [session, proposal],
  );

  const reasonTrimmed = reason.trim();
  const reasonOk =
    reasonTrimmed.length >= CORRECTION_REASON_MIN &&
    reasonTrimmed.length <= CORRECTION_REASON_MAX;
  const hasChanges = proposal ? hasProposalChanges(proposal) : false;
  const formError =
    proposalResult && !proposalResult.ok ? proposalResult.error : null;
  const blockingErrors = [
    ...(formError ? [formError] : []),
    ...(preview?.errors ?? []),
  ];
  const canReview = hasChanges && blockingErrors.length === 0 && reasonOk;

  function updateBreak(
    id: number,
    patch: Partial<CorrectionFormValue["breaks"][number]>,
  ) {
    if (!current) return;
    setForm({
      ...current,
      breaks: current.breaks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  }

  async function confirm() {
    if (!proposal || !canReview) return;
    setSubmitting(true);
    setSubmitError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const result = await correctAttendanceSessionAction({
      restaurantSlug,
      sessionId: row.sessionId,
      expectedVersion: row.version,
      reason: reasonTrimmed,
      idempotencyKey: idempotencyKey.current,
      void: voidMode,
      ...(proposal.clockInAt ? { clockInAt: proposal.clockInAt } : {}),
      ...(proposal.clockOutAt ? { clockOutAt: proposal.clockOutAt } : {}),
      ...(proposal.breaks ? { breaks: [...proposal.breaks] } : {}),
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      setStale(result.code === "stale" || result.contextStale === true);
      return;
    }
    setSavedSeq(result.data.correctionSeq);
    setStep("done");
    onCorrected();
    setReloadKey((k) => k + 1);
  }

  const fmtDuration = formatWorkedDuration;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${row.employeeName} · ${row.serviceDate}`}
      description={`${NATIVE_REPORT_SOURCE_LABEL} · times shown in ${timeZone}`}
      className="sm:w-[min(92vw,40rem)] sm:max-w-[40rem]"
    >
      {detailError ? (
        <p role="alert" className="text-destructive text-sm">
          {detailError}
        </p>
      ) : !detail || !current || !initial ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading record…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <SessionSummary row={row} timeZone={timeZone} fmt={fmtDuration} />

          {step === "edit" && editable ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canReview) setStep("review");
              }}
            >
              <fieldset
                disabled={voidMode}
                className="flex flex-col gap-3 disabled:opacity-50"
              >
                <legend className="text-sm font-semibold">Shift times</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="corr-in">Clock-in</Label>
                    <Input
                      id="corr-in"
                      type="datetime-local"
                      step={60}
                      value={current.clockIn}
                      onChange={(e) =>
                        setForm({ ...current, clockIn: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="corr-out">
                      Clock-out{!row.clockOutAt ? " (missing)" : ""}
                    </Label>
                    <Input
                      id="corr-out"
                      type="datetime-local"
                      step={60}
                      value={current.clockOut}
                      onChange={(e) =>
                        setForm({ ...current, clockOut: e.target.value })
                      }
                    />
                  </div>
                </div>

                {current.breaks.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-semibold">Breaks</p>
                    {current.breaks.map((b, index) => (
                      <div
                        key={b.id}
                        className="border-border grid gap-3 rounded-xl border p-3 sm:grid-cols-3"
                      >
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`corr-b${b.id}-s`}>
                            Break {index + 1} start
                          </Label>
                          <Input
                            id={`corr-b${b.id}-s`}
                            type="datetime-local"
                            step={60}
                            value={b.start}
                            onChange={(e) =>
                              updateBreak(b.id, { start: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`corr-b${b.id}-e`}>
                            Break {index + 1} end
                          </Label>
                          <Input
                            id={`corr-b${b.id}-e`}
                            type="datetime-local"
                            step={60}
                            value={b.end}
                            onChange={(e) =>
                              updateBreak(b.id, { end: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`corr-b${b.id}-c`}>Pay</Label>
                          <Select
                            id={`corr-b${b.id}-c`}
                            value={b.payClassification}
                            onChange={(e) =>
                              updateBreak(b.id, {
                                payClassification: e.target
                                  .value as typeof b.payClassification,
                              })
                            }
                          >
                            {(
                              Object.keys(CLASS_LABELS) as Array<
                                keyof typeof CLASS_LABELS
                              >
                            ).map((k) => (
                              <option key={k} value={k}>
                                {CLASS_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ))}
                    <p className="text-muted-foreground text-xs">
                      A break is only treated as paid or unpaid once someone
                      decides. Until then it is shown as “Not yet decided” and
                      payable time stays pending.
                    </p>
                  </div>
                ) : null}
              </fieldset>

              <div className="border-border flex flex-col gap-2 rounded-xl border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={voidMode}
                    onChange={(e) => setVoidMode(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">Void this session</span>
                    <span className="text-muted-foreground block text-xs">
                      For a record entered by mistake. It leaves all totals; the
                      original events stay in the history. A voided session
                      can&apos;t be edited afterwards.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="corr-reason">Reason (required)</Label>
                <textarea
                  id="corr-reason"
                  rows={3}
                  maxLength={CORRECTION_REASON_MAX}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-describedby="corr-reason-help"
                  className="border-input bg-background/70 text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <p
                  id="corr-reason-help"
                  className="text-muted-foreground text-xs"
                >
                  Saved with your name and the time of the change.{" "}
                  {reasonTrimmed.length}/{CORRECTION_REASON_MAX}
                </p>
              </div>

              {blockingErrors.length > 0 ? (
                <ul
                  role="alert"
                  className="text-destructive list-disc pl-5 text-sm"
                >
                  {blockingErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canReview}>
                  Review changes
                </Button>
              </div>
            </form>
          ) : null}

          {step === "review" && preview ? (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold">Review your correction</h3>
              <ul className="flex flex-col gap-2">
                {preview.changes.map((c) => (
                  <li
                    key={`${c.field}-${c.breakId ?? ""}`}
                    className="border-border rounded-xl border p-3 text-sm"
                  >
                    <p className="font-semibold">{c.label}</p>
                    {c.field === "void" ? (
                      <p className="text-muted-foreground">
                        This session will be voided and removed from totals.
                      </p>
                    ) : c.field === "break" ? (
                      <p className="text-muted-foreground">
                        <span className="line-through">{c.before}</span> →{" "}
                        <span className="text-foreground">{c.after}</span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        <span className="line-through">
                          {formatInstantInZone(c.before, timeZone)}
                        </span>{" "}
                        →{" "}
                        <span className="text-foreground">
                          {formatInstantInZone(c.after, timeZone)}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {!voidMode ? (
                <dl className="bg-muted/40 grid grid-cols-3 gap-3 rounded-xl p-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Gross</dt>
                    <dd className="font-semibold">
                      {preview.projected.grossElapsedSeconds === null
                        ? "Still open"
                        : fmtDuration(preview.projected.grossElapsedSeconds)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Breaks</dt>
                    <dd className="font-semibold">
                      {fmtDuration(preview.projected.totalBreakSeconds)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Payable</dt>
                    <dd className="font-semibold">
                      {describePayable(
                        preview.projected.netPayableSeconds,
                        fmtDuration,
                      )}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                {reasonTrimmed}
              </p>
              {submitError ? (
                <div
                  role="alert"
                  className="text-destructive flex flex-col gap-2 text-sm"
                >
                  <p>{submitError}</p>
                  {stale ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onCorrected();
                        onClose();
                      }}
                    >
                      Reload the record
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => {
                    idempotencyKey.current = null;
                    setSubmitError(null);
                    setStep("edit");
                  }}
                >
                  Back
                </Button>
                <Button type="button" disabled={submitting} onClick={confirm}>
                  {submitting ? "Saving…" : "Confirm correction"}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div role="status" className="flex flex-col gap-3">
              <p className="text-ok text-sm font-semibold">
                Correction saved{savedSeq ? ` (#${savedSeq})` : ""}. It now
                appears in the history below.
              </p>
              <div className="flex justify-end">
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}

          {!editable && step === "edit" ? (
            <p className="text-muted-foreground text-sm">
              {row.status === "voided"
                ? "This session was voided and can't be changed."
                : "You can view this record. Only a manager can correct it."}
            </p>
          ) : null}

          <HistoryList detail={detail} timeZone={timeZone} />
        </div>
      )}
    </Dialog>
  );
}

function SessionSummary({
  row,
  timeZone,
  fmt,
}: {
  row: NativeReportRow;
  timeZone: string;
  fmt: (s: number | null) => string;
}) {
  return (
    <dl className="bg-muted/40 grid gap-3 rounded-xl p-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground text-xs">Clock-in</dt>
        <dd className="font-semibold">
          {formatInstantInZone(row.clockInAt, timeZone)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Clock-out</dt>
        <dd className="font-semibold">
          {row.clockOutAt ? (
            formatInstantInZone(row.clockOutAt, timeZone)
          ) : (
            <Badge tone="warning">Still open</Badge>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Gross · Breaks</dt>
        <dd className="font-semibold">
          {fmt(row.grossElapsedSeconds)} · {fmt(row.totalBreakSeconds)}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Payable</dt>
        <dd className="font-semibold">
          {describePayable(row.netPayableSeconds, (s) => fmt(s))}
        </dd>
      </div>
    </dl>
  );
}

function HistoryList({
  detail,
  timeZone,
}: {
  detail: SessionDetailView;
  timeZone: string;
}) {
  return (
    <section aria-labelledby="corr-history" className="flex flex-col gap-2">
      <h3 id="corr-history" className="text-sm font-semibold">
        History
      </h3>
      <ol className="flex flex-col gap-2">
        {detail.history.map((h) => {
          const who = detail.names[h.actorProfileId] ?? "Someone";
          return (
            <li
              key={h.id}
              className="border-border rounded-xl border p-3 text-sm"
            >
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone={h.isCorrection ? "accent" : "neutral"}>
                  {h.isCorrection
                    ? h.eventType === "void"
                      ? `Voided #${h.correctionSeq ?? ""}`
                      : `Correction #${h.correctionSeq ?? ""}`
                    : h.eventType.replace("_", " ")}
                </Badge>
                <span className="text-muted-foreground">
                  {formatInstantInZone(h.eventTime, timeZone)} · {who}
                </span>
                {h.selfCorrection ? (
                  <Badge tone="warning">Own record</Badge>
                ) : null}
              </p>
              {h.isCorrection ? (
                <>
                  {h.reason ? <p className="mt-1">“{h.reason}”</p> : null}
                  {h.changedFields.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Changed: {h.changedFields.join(", ").replaceAll("_", " ")}
                    </p>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
