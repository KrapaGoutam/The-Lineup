"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AttendanceLinkOptions } from "@/features/attendance/actions/attendance-actions";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import type { TeamMember } from "@/lib/demo-data";

export type AttendanceLinkResult = { ok: true } | { ok: false; error: string };

/**
 * Feature 019. Manager-facing, from the Team tab. Loads the same
 * disambiguated Neon name list Feature 018's report already builds
 * (`buildDisplayLabels`), plus every existing link in the organization,
 * lazily on open -- never as part of the Team tab's own initial load,
 * matching the "Neon reads are always client-triggered" rule everywhere
 * else in this feature area. A manager always picks a name, never types
 * or sees a raw Neon id.
 */
export function AttendanceLinkDialog({
  member,
  onClose,
  onLoadOptions,
  onLink,
  onUnlink,
  teamNameById,
}: {
  member: TeamMember;
  onClose: () => void;
  onLoadOptions: () => Promise<
    { ok: true; data: AttendanceLinkOptions } | { ok: false; error: string }
  >;
  onLink: (input: {
    targetProfileId: string;
    neonUserId: number;
  }) => Promise<AttendanceLinkResult>;
  onUnlink: (input: {
    targetProfileId: string;
  }) => Promise<AttendanceLinkResult>;
  teamNameById: Map<string, string>;
}) {
  const [options, setOptions] = useState<AttendanceLinkOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optionsReloadKey, setOptionsReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"linked" | "unlinked" | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.getElementById("attendance-link-close")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("attendance-link-dialog");
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError(null);
      setOptions(null);
      try {
        const result = await onLoadOptions();
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        setOptions(result.data);
        const current = result.data.links.find(
          (link) => link.profileId === member.id,
        );
        setSelectedId(current?.neonUserId ?? "");
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load attendance records right now.");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id, optionsReloadKey]);

  const currentLink = options?.links.find(
    (link) => link.profileId === member.id,
  );
  const currentLabel = currentLink
    ? buildDisplayLabels(options!.users).get(currentLink.neonUserId)
    : null;
  const claimedBy = new Map(
    (options?.links ?? [])
      .filter((link) => link.profileId !== member.id)
      .map((link) => [link.neonUserId, link.profileId]),
  );
  const displayLabels = options ? buildDisplayLabels(options.users) : null;

  async function submitLink() {
    if (selectedId === "") return;
    setError("");
    setPending(true);
    try {
      const result = await onLink({
        targetProfileId: member.id,
        neonUserId: selectedId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone("linked");
    } catch {
      setError("Unable to save this attendance link right now.");
    } finally {
      setPending(false);
    }
  }

  async function submitUnlink() {
    setError("");
    setPending(true);
    try {
      const result = await onUnlink({ targetProfileId: member.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone("unlinked");
    } catch {
      setError("Unable to remove this attendance link right now.");
    } finally {
      setPending(false);
    }
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
        id="attendance-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-link-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="attendance-link-title" className="text-lg font-semibold">
              Link {member.name}&apos;s attendance
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {done
                ? done === "linked"
                  ? "Their attendance is now linked."
                  : "Their attendance link has been removed."
                : "Choose which attendance-system record is this person, by name. Never inferred automatically -- names can collide."}
            </p>
          </div>
          <Button
            id="attendance-link-close"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close attendance link dialog"
          >
            <X aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent>
          {done ? (
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          ) : loadError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-destructive text-sm" aria-live="polite">
                {loadError}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOptionsReloadKey((key) => key + 1)}
              >
                Try again
              </Button>
            </div>
          ) : !options ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              Loading attendance records…
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitLink();
              }}
            >
              {currentLabel ? (
                <p className="text-muted-foreground text-xs">
                  Currently linked to{" "}
                  <span className="text-foreground font-medium">
                    {currentLabel}
                  </span>
                  .
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="attendance-link-select">
                  Attendance-system record
                </Label>
                <Select
                  id="attendance-link-select"
                  value={selectedId}
                  onChange={(event) =>
                    setSelectedId(
                      event.target.value ? Number(event.target.value) : "",
                    )
                  }
                >
                  <option value="">Select a person…</option>
                  {options.users.map((candidate) => {
                    const claimant = claimedBy.get(candidate.id);
                    const claimedByAnotherMember =
                      claimant && claimant !== member.id ? claimant : null;
                    const claimedNote = claimedByAnotherMember
                      ? ` (linked to ${teamNameById.get(claimedByAnotherMember) ?? "another person"})`
                      : "";
                    return (
                      <option
                        key={candidate.id}
                        value={candidate.id}
                        disabled={Boolean(claimedByAnotherMember)}
                      >
                        {displayLabels?.get(candidate.id)}
                        {claimedNote}
                      </option>
                    );
                  })}
                </Select>
              </div>
              {error ? (
                <p className="text-destructive text-sm" aria-live="polite">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                {currentLink ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={submitUnlink}
                    disabled={pending}
                  >
                    Unlink
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || selectedId === ""}>
                  {pending ? "Saving…" : "Save link"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
