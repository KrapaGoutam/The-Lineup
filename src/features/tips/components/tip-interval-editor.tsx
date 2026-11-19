"use client";

import { FormEvent, useMemo, useState } from "react";
import { Calculator, DollarSign, Save, UserCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  describeRemainder,
  splitTenders,
} from "@/features/tips/domain/tender-split";
import type { TipsInterval } from "@/features/tips/domain/tips-range-model";
import { money, parseMoneyInput } from "@/features/tips/domain/tips-format";
import type { TeamMember } from "@/lib/demo-data";

export type EditorSubmit = {
  start: string;
  end: string;
  cashCents: number;
  cardCents: number;
  participantIds: string[];
  reason?: string;
};

const centsToInput = (cents: number) =>
  cents === 0 ? "" : (cents / 100).toFixed(2);

/**
 * One interval: Save when new, Update when editing a saved one. The preview is live and
 * explicitly "not saved"; the database does the authoritative split on save.
 */
export function TipIntervalEditor({
  mode,
  interval,
  team,
  selectableIds,
  nameOf,
  onSubmit,
  onCancel,
  onPullClockedIn,
  locked,
}: {
  mode: "create" | "edit";
  interval?: TipsInterval;
  team: TeamMember[];
  /** Undefined = everyone may be chosen (demo). */
  selectableIds?: string[];
  nameOf: (profileId: string) => string;
  onSubmit: (
    values: EditorSubmit,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  onPullClockedIn: () => Promise<
    { ok: true; data: string[] } | { ok: false; error: string }
  >;
  locked: boolean;
}) {
  const selectable = useMemo(
    () => new Set(selectableIds ?? team.map((member) => member.id)),
    [team, selectableIds],
  );
  const currentIds = useMemo(
    () => new Set(interval?.participantIds ?? []),
    [interval],
  );
  // People already on the interval stay listed (so they can be kept or removed) even if
  // they have since left; only currently eligible people can be newly added.
  const options = useMemo(
    () =>
      team.filter(
        (member) => selectable.has(member.id) || currentIds.has(member.id),
      ),
    [team, selectable, currentIds],
  );

  const [start, setStart] = useState(interval?.start ?? "11:00");
  const [end, setEnd] = useState(interval?.end ?? "13:00");
  const [cash, setCash] = useState(centsToInput(interval?.cashCents ?? 0));
  const [card, setCard] = useState(centsToInput(interval?.cardCents ?? 0));
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        interval
          ? interval.participantIds
          : team
              .filter((m) => selectable.has(m.id))
              .slice(0, 4)
              .map((m) => m.id),
      ),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState("");

  const preview = useMemo(() => {
    try {
      const cashCents = parseMoneyInput(cash);
      const cardCents = parseMoneyInput(card);
      if (cashCents + cardCents === 0 || selected.size === 0) return null;
      return splitTenders({
        cashCents,
        cardCents,
        participantIds: [...selected],
      });
    } catch {
      return null;
    }
  }, [cash, card, selected]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pull() {
    setPullError("");
    setPulling(true);
    try {
      const result = await onPullClockedIn();
      if (!result.ok) {
        setPullError(result.error);
        return;
      }
      // Only people who have a checkbox here; the manager still approves the result.
      const pullable = new Set(options.map((member) => member.id));
      setSelected(new Set(result.data.filter((id) => pullable.has(id))));
    } finally {
      setPulling(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let cashCents: number;
    let cardCents: number;
    try {
      cashCents = parseMoneyInput(cash);
      cardCents = parseMoneyInput(card);
      splitTenders({ cashCents, cardCents, participantIds: [...selected] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the amounts.");
      return;
    }
    if (mode === "edit" && reason.trim().length < 3) {
      setError("Enter a short reason for the change (at least 3 characters).");
      return;
    }
    setSaving(true);
    try {
      const result = await onSubmit({
        start,
        end,
        cashCents,
        cardCents,
        participantIds: [...selected],
        reason: mode === "edit" ? reason.trim() : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === "create") {
        setCash("");
        setCard("");
        setReason("");
      }
    } finally {
      setSaving(false);
    }
  }

  const remainder = preview ? describeRemainder(preview, nameOf) : null;

  return (
    <Card className="border-primary/15">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
            <Calculator className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">
              {mode === "edit"
                ? `Edit ${interval?.start}–${interval?.end}${interval?.endsNextDay ? " (+1 day)" : ""}`
                : "New distribution"}
            </h2>
            <p className="text-muted-foreground text-xs">
              {mode === "edit"
                ? "Change the details, give a reason, then Update. The previous values are kept in the change history."
                : "Enter cash and card tips for a period and confirm who worked it. An end time before the start runs past midnight."}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={locked || saving} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="tip-start">From</Label>
                <Input
                  id="tip-start"
                  name="start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tip-end">To</Label>
                <Input
                  id="tip-end"
                  name="end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </div>
              <MoneyField
                id="tip-cash"
                label="Cash tips"
                value={cash}
                onChange={setCash}
              />
              <MoneyField
                id="tip-card"
                label="Card tips"
                value={card}
                onChange={setCard}
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium" id="tip-participants-label">
                  Who was working?
                </p>
                {mode === "create" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={pull}
                    disabled={pulling}
                    title="Suggests the people currently clocked in. You approve the final list."
                    className="w-full sm:w-auto"
                  >
                    <UserCheck aria-hidden="true" />{" "}
                    {pulling ? "Pulling…" : "Pull clocked-in team"}
                  </Button>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Attendance is only a suggestion. Check or uncheck anyone; the
                saved list is never changed by later attendance corrections.
              </p>
              {pullError ? (
                <p className="text-destructive mt-1 text-xs" aria-live="polite">
                  {pullError}
                </p>
              ) : null}
              <div
                role="group"
                aria-labelledby="tip-participants-label"
                className="mt-3 flex flex-wrap gap-2"
              >
                {options.map((member) => (
                  <Label
                    key={member.id}
                    className="border-border bg-secondary has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 font-normal"
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={member.id}
                      checked={selected.has(member.id)}
                      onChange={() => toggle(member.id)}
                      className="accent-[var(--primary)]"
                    />
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                    {member.shortName}
                    {!selectable.has(member.id) ? (
                      <span className="text-muted-foreground text-xs">
                        (left)
                      </span>
                    ) : null}
                  </Label>
                ))}
              </div>
            </div>

            {mode === "edit" ? (
              <div className="space-y-2">
                <Label htmlFor="tip-reason">Reason for change</Label>
                <Input
                  id="tip-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Counted the card slips again"
                  maxLength={500}
                  required
                />
              </div>
            ) : null}
          </fieldset>

          <section
            aria-label="Preview, not saved"
            className="border-border bg-background/60 rounded-xl border p-3"
          >
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Preview — not saved
            </p>
            {preview ? (
              <>
                <ul className="mt-2 space-y-1 text-sm">
                  {preview.shares.map((share) => (
                    <li
                      key={share.participantId}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{nameOf(share.participantId)}</span>
                      <span className="font-mono">
                        {money(share.cashCents)} cash + {money(share.cardCents)}{" "}
                        card = <strong>{money(share.totalCents)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                {remainder ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {remainder}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
                Enter a cash or card amount and choose at least one person to
                see the split.
              </p>
            )}
          </section>

          {error ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              aria-live="polite"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={locked || saving}>
              <Save aria-hidden="true" />{" "}
              {saving ? "Saving…" : mode === "edit" ? "Update" : "Save"}
            </Button>
            {mode === "edit" ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                <X aria-hidden="true" /> Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <DollarSign
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          id={id}
          name={id}
          inputMode="decimal"
          placeholder="0.00"
          className="pl-9 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
