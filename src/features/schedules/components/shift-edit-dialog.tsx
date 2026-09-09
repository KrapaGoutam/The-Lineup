"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  ShiftDefaults,
  ShiftKind,
} from "@/features/schedules/domain/shift-planning";
import type { DemoShift, TeamMember } from "@/lib/demo-data";

export type ShiftEditResult = { ok: true } | { ok: false; error: string };

export type ShiftEditSubmission = {
  employeeId: string;
  shiftKind: ShiftKind;
  startLocal: string;
  endLocal: string;
  note?: string;
};

const shiftKindLabels: Record<ShiftKind, string> = {
  morning: "Morning",
  evening: "Evening",
  full_day: "Full day",
};

/**
 * Feature 027. Same lightweight dialog pattern as this app's other
 * confirm-a-choice dialogs (team's RenameMemberDialog, etc.) -- an
 * overlay, a Card, an X close button, a form. Rendered for a manager on
 * any shift, published or draft alike (Investigation #4 -- RLS already
 * allows this write regardless of status, and there's no reason to gate
 * the UI tighter than the database already does). Deliberately no field
 * to move the shift to a different calendar day -- see
 * updateShiftAction's own doc comment for why that's out of scope.
 */
export function ShiftEditDialog({
  shift,
  employeeName,
  dateLabel,
  team,
  shiftDefaults,
  onClose,
  onSave,
  onDelete,
}: {
  shift: DemoShift;
  employeeName: string;
  dateLabel: string;
  team: TeamMember[];
  shiftDefaults: ShiftDefaults;
  onClose: () => void;
  onSave: (input: ShiftEditSubmission) => Promise<ShiftEditResult>;
  onDelete: () => Promise<ShiftEditResult>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employeeId"));
    const shiftKind = String(form.get("shiftKind")) as ShiftKind;
    const startLocal = String(form.get("startLocal"));
    const endLocal = String(form.get("endLocal"));
    const note = String(form.get("note") || "").trim() || undefined;

    setSaving(true);
    const result = await onSave({
      employeeId,
      shiftKind,
      startLocal,
      endLocal,
      note,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await onDelete();
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      setConfirmingDelete(false);
      return;
    }
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
        aria-labelledby="shift-edit-title"
        className="w-full max-w-md shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="shift-edit-title" className="text-lg font-semibold">
              Edit shift
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {employeeName} · {dateLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close edit shift dialog"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shift-edit-employeeId">Person</Label>
              <Select
                id="shift-edit-employeeId"
                name="employeeId"
                defaultValue={shift.employeeId}
              >
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-edit-shiftKind">Shift</Label>
              <Select
                id="shift-edit-shiftKind"
                name="shiftKind"
                defaultValue={shift.shiftKind}
              >
                {(Object.keys(shiftKindLabels) as ShiftKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {shiftKindLabels[kind]} · {shiftDefaults[kind].start}–
                    {shiftDefaults[kind].end}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="shift-edit-startLocal">Start time</Label>
                <Input
                  id="shift-edit-startLocal"
                  name="startLocal"
                  type="time"
                  defaultValue={shift.startLocal}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shift-edit-endLocal">End time</Label>
                <Input
                  id="shift-edit-endLocal"
                  name="endLocal"
                  type="time"
                  defaultValue={shift.endLocal}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-edit-note">
                Manager note{" "}
                <span className="text-muted-foreground font-normal">
                  (private)
                </span>
              </Label>
              <Input
                id="shift-edit-note"
                name="note"
                defaultValue={shift.note ?? ""}
                placeholder="Optional setup or station note"
              />
            </div>

            {error ? (
              <p className="text-destructive text-sm" aria-live="polite">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={confirmDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Confirm delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete shift
                </Button>
              )}
              <Button type="submit" disabled={saving || confirmingDelete}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
