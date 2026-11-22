"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { RECURRENCE_BEHAVIOR, RESET_BEHAVIOR } from "../domain/chore-cycles";
import { boardProgress } from "../domain/chore-rules";
import {
  RECURRENCE_INTENTS,
  RECURRENCE_INTENT_LABELS,
  REQUIREMENT_MODES,
  REQUIREMENT_MODE_HELP,
  REQUIREMENT_MODE_LABELS,
  RESET_INTENTS,
  RESET_INTENT_LABELS,
  STAFF_ACCESS,
  STAFF_ACCESS_LABELS,
  type ChoreBoardView,
  type RecurrenceIntent,
  type RequirementMode,
  type ResetIntent,
  type StaffAccess,
} from "../domain/chore-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import {
  boardSaveCommand,
  ErrorLine,
  Field,
  useChoreAction,
} from "./chore-settings-parts";

type Props = { controller: ChoreController; board: ChoreBoardView };

/** Tasks → Manage → Completion Rules. */
export function ChoreRulesSection({ controller, board }: Props) {
  const [defaultMode, setDefaultMode] = useState<RequirementMode>(
    board.defaultMode,
  );
  const [recurrence, setRecurrence] = useState<RecurrenceIntent>(
    board.recurrenceIntent,
  );
  const [reset, setReset] = useState<ResetIntent>(board.resetIntent);
  const [saved, setSaved] = useState(false);
  const { busy, error, act } = useChoreAction(controller);

  const counts = REQUIREMENT_MODES.map((mode) => ({
    mode,
    n: board.rows.filter((r) => !r.archived && r.mode === mode).length,
  }));
  // No required work = a run that can never complete (it never closes or resets by itself).
  const noRequiredWork = boardProgress(board).required === 0;
  const dirty =
    defaultMode !== board.defaultMode ||
    recurrence !== board.recurrenceIntent ||
    reset !== board.resetIntent;

  return (
    <section aria-label="Completion rules" className="space-y-5">
      <div className="space-y-2">
        <h3 className="font-semibold">How chores are counted</h3>
        <p className="text-muted-foreground text-sm">
          Each chore has its own rule (set in Chores / Rows). Not-applicable
          cells are never counted, and optional chores are never part of the
          total.
        </p>
        <ul className="text-sm">
          {counts.map(({ mode, n }) => (
            <li key={mode} className="flex flex-wrap gap-x-2">
              <span className="font-medium">
                {REQUIREMENT_MODE_LABELS[mode]}:
              </span>
              <span>
                {n} {n === 1 ? "chore" : "chores"} —{" "}
                <span className="text-muted-foreground">
                  {REQUIREMENT_MODE_HELP[mode]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          void act(
            boardSaveCommand(board, {
              defaultMode,
              recurrenceIntent: recurrence,
              resetIntent: reset,
            }),
          ).then((ok) => ok && setSaved(true));
        }}
      >
        <Field
          id="rules-default-mode"
          label="Rule for new chores"
          hint="Used when you add a chore. It does not change the chores already on the board."
        >
          <Select
            id="rules-default-mode"
            value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value as RequirementMode)}
          >
            {REQUIREMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {REQUIREMENT_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset className="border-border space-y-3 rounded-2xl border p-3">
          <legend className="px-1 text-sm font-semibold">
            Repeat and reset
          </legend>
          <p className="text-muted-foreground text-xs">
            Each board runs on its own. When one board&apos;s run finishes only
            that board&apos;s run is closed and saved to History; every other
            board is left exactly as it is.
          </p>
          <Field
            id="rules-recurrence"
            label="Repeat"
            hint={RECURRENCE_BEHAVIOR[recurrence]}
          >
            <Select
              id="rules-recurrence"
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as RecurrenceIntent)
              }
            >
              {RECURRENCE_INTENTS.map((r) => (
                <option
                  key={r}
                  value={r}
                  disabled={r === "per_shift" && board.recurrenceIntent !== r}
                >
                  {RECURRENCE_INTENT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="rules-reset"
            label="When the run is complete"
            hint={RESET_BEHAVIOR[reset]}
          >
            <Select
              id="rules-reset"
              value={reset}
              onChange={(e) => setReset(e.target.value as ResetIntent)}
            >
              {RESET_INTENTS.map((r) => (
                <option key={r} value={r}>
                  {RESET_INTENT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {reset === "automatic_after_completion" &&
          (recurrence === "daily" || recurrence === "weekly") ? (
            <p className="text-muted-foreground text-xs">
              The next {recurrence === "daily" ? "day" : "week"} starts a new
              run when someone opens Tasks at this location. Days nobody opens
              Tasks are not filled in afterwards.
            </p>
          ) : null}
          {noRequiredWork ? (
            <p
              role="status"
              data-testid="no-required-work"
              className="border-warn/30 bg-warn/10 rounded-xl border px-3 py-2 text-sm"
            >
              This board has no required chores, so a run can never complete. It
              will not close or reset by itself. Add a required chore and at
              least one person.
            </p>
          ) : null}
        </fieldset>

        <ErrorLine message={error} />
        {saved && !dirty ? (
          <p role="status" className="text-ok text-sm">
            Saved.
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save rules"}
        </Button>
      </form>
    </section>
  );
}

/** Tasks → Manage → Access / Permissions. */
export function ChoreAccessSection({ controller, board }: Props) {
  const [access, setAccess] = useState<StaffAccess>(board.staffAccess);
  const [override, setOverride] = useState(board.managerOverride);
  const [saved, setSaved] = useState(false);
  const { busy, error, act } = useChoreAction(controller);
  const dirty =
    access !== board.staffAccess || override !== board.managerOverride;

  return (
    <section aria-label="Access and permissions" className="space-y-5">
      <div className="space-y-1">
        <h3 className="font-semibold">Who can set up this board</h3>
        <p className="text-muted-foreground text-sm">
          Owners, managers and assistant managers of this location can create
          and change boards, people and chores. Staff can check items off but
          cannot change the board. Access follows each person&apos;s role at
          this location; it is checked on the server, not only on this screen.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          void act(
            boardSaveCommand(board, {
              staffAccess: access,
              managerOverride: override,
            }),
          ).then((ok) => ok && setSaved(true));
        }}
      >
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Who can check items</legend>
          {STAFF_ACCESS.map((value) => (
            <label
              key={value}
              className="flex min-h-11 items-center gap-2.5 text-sm"
            >
              <input
                type="radio"
                name="staff-access"
                className="size-5"
                checked={access === value}
                onChange={() => setAccess(value)}
              />
              {STAFF_ACCESS_LABELS[value]}
            </label>
          ))}
          <p className="text-muted-foreground text-xs">
            Position columns (no assigned employee) can always be checked by
            anyone on the team. Whoever checks an item is recorded under their
            own name.
          </p>
        </fieldset>

        <label className="flex min-h-11 items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-2.5 size-5"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />
          <span className="pt-2">
            Managers can correct closed runs
            <span className="text-muted-foreground block text-xs">
              Off by default. Managers and assistant managers can always check
              or uncheck any applicable item on the current run; it is recorded
              as a manager entry under their own name. When this is on they can
              also add a correction to a run that has already closed (the
              original record is kept).
            </span>
          </span>
        </label>

        <ErrorLine message={error} />
        {saved && !dirty ? (
          <p role="status" className="text-ok text-sm">
            Saved.
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save access"}
        </Button>
      </form>
    </section>
  );
}
