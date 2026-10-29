"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getRecipeCategoriesAction,
  manageRecipeCategoryAction,
} from "../actions/recipe-management-actions";
import type {
  CategoryCommand,
  ManagementCategory,
} from "../domain/recipe-management";

export function RecipeCategoryDialog({
  restaurantSlug,
  demo,
  demoCategories = [],
  onChanged,
  onSessionInvalid,
  occupiedCategoryIds = [],
}: {
  restaurantSlug: string;
  demo: boolean;
  demoCategories?: ManagementCategory[];
  onChanged: (categories: ManagementCategory[]) => void;
  onSessionInvalid: () => void;
  occupiedCategoryIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ManagementCategory[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [discard, setDiscard] = useState(false);
  const running = useRef(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const dirty =
    !!name.trim() ||
    rows.some((c) => names[c.id] !== undefined && names[c.id] !== c.name);
  function close() {
    if (busy) return;
    if (dirty) {
      setDiscard(true);
      return;
    }
    setOpen(false);
    requestAnimationFrame(() =>
      trigger.current?.querySelector("button")?.focus(),
    );
  }
  async function load() {
    setBusy(true);
    setReady(false);
    setError("");
    try {
      const result = demo
        ? { ok: true as const, data: demoCategories }
        : await getRecipeCategoriesAction({ restaurantSlug });
      if (result.ok) {
        setRows(result.data);
        setNames({});
        setName("");
        setStale(false);
        setReady(true);
        onChanged(result.data);
      } else {
        setError(result.error);
        if (result.sessionInvalid) onSessionInvalid();
      }
    } catch {
      setError("Categories could not be loaded.");
    } finally {
      setBusy(false);
    }
  }
  async function mutate(command: CategoryCommand) {
    if (running.current || stale) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        if (
          command.operation === "active" &&
          !command.active &&
          occupiedCategoryIds.includes(command.id)
        ) {
          setError(
            "Move or archive active recipes before deactivating their category.",
          );
          return;
        }
        let next = rows.map((c) => ({ ...c }));
        if (command.operation === "save") {
          if (
            next.some(
              (c) =>
                c.id !== command.id &&
                c.name.toLowerCase() === command.name.toLowerCase(),
            )
          ) {
            setError("A category with that name already exists.");
            return;
          }
          if (command.id)
            next = next.map((c) =>
              c.id === command.id
                ? { ...c, name: command.name.trim(), version: c.version + 1 }
                : c,
            );
          else {
            const at = next.findIndex((c) => c.is_fallback);
            next.splice(at < 0 ? next.length : at, 0, {
              id: crypto.randomUUID(),
              name: command.name.trim(),
              version: 1,
              display_order: next.length,
              is_fallback: false,
              is_active: true,
            });
          }
        } else if (command.operation === "active")
          next = next.map((c) =>
            c.id === command.id
              ? { ...c, is_active: command.active, version: c.version + 1 }
              : c,
          );
        else
          next = [
            ...command.ids.map((id, i) => ({
              ...next.find((c) => c.id === id)!,
              display_order: i,
              version: next.find((c) => c.id === id)!.version + 1,
            })),
            ...next.filter((c) => c.is_fallback),
          ];
        setRows(next);
        setNames((previous) => {
          const pending = { ...previous };
          if (command.operation === "save" && command.id)
            delete pending[command.id];
          return pending;
        });
        if (command.operation === "save" && command.id === null) setName("");
        onChanged(next);
        return;
      }
      const result = await manageRecipeCategoryAction({
        restaurantSlug,
        command,
      });
      if (!result.ok) {
        setError(result.error);
        setStale(result.kind === "stale");
        if (result.sessionInvalid) onSessionInvalid();
        return;
      }
      // Writes are canonical only after a fresh read; no optimistic permanent state.
      const latest = await getRecipeCategoriesAction({ restaurantSlug });
      if (!latest.ok) {
        setError(
          "Change saved, but categories could not be refreshed. Reload latest.",
        );
        setStale(true);
        if (latest.sessionInvalid) onSessionInvalid();
        return;
      }
      setRows(latest.data);
      setNames((previous) => {
        const next = { ...previous };
        if (command.operation === "save" && command.id) delete next[command.id];
        return next;
      });
      if (command.operation === "save" && command.id === null) setName("");
      onChanged(latest.data);
    } catch {
      setError(
        "The change could not be completed. Reload latest before trying again.",
      );
      setStale(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    void mutate({
      operation: "reorder",
      ids: next.filter((c) => !c.is_fallback).map((c) => c.id),
    });
  }
  return (
    <>
      <span ref={trigger}>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(true);
            void load();
          }}
        >
          Manage Categories
        </Button>
      </span>
      <Dialog
        open={open}
        onClose={close}
        title="Manage Categories"
        description="Add, rename, reorder or change category availability."
      >
        {error ? <p role="alert">{error}</p> : null}
        {stale || (!ready && !busy) ? (
          <Button type="button" onClick={load}>
            Reload latest
          </Button>
        ) : null}
        {busy ? <p role="status">Working…</p> : null}
        <fieldset
          disabled={busy || stale || !ready}
          className="flex min-w-0 flex-col gap-5"
        >
          {rows.map((c, i) => (
            <section
              key={c.id}
              aria-label={c.name}
              className="flex flex-col gap-2 border-b pb-4"
            >
              <label className="flex flex-col gap-2">
                Category name
                <Input
                  aria-label={`Name for ${c.name}`}
                  maxLength={80}
                  value={names[c.id] ?? c.name}
                  onChange={(e) =>
                    setNames({ ...names, [c.id]: e.target.value })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !(names[c.id] ?? c.name).trim() ||
                    names[c.id] === undefined ||
                    names[c.id] === c.name
                  }
                  onClick={() =>
                    mutate({
                      operation: "save",
                      id: c.id,
                      version: c.version,
                      name: names[c.id].trim(),
                    })
                  }
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Move ${c.name} up`}
                  disabled={dirty || c.is_fallback || i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Move ${c.name} down`}
                  disabled={
                    dirty ||
                    c.is_fallback ||
                    i >= rows.length - 1 ||
                    rows[i + 1].is_fallback
                  }
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`Active ${c.name}`}
                    checked={c.is_active}
                    disabled={dirty || c.is_fallback}
                    onChange={(e) =>
                      mutate({
                        operation: "active",
                        id: c.id,
                        version: c.version,
                        active: e.target.checked,
                      })
                    }
                  />
                  Active
                </label>
              </div>
              {c.is_fallback ? (
                <p className="text-muted-foreground text-sm">
                  Fallback: may be renamed, but cannot be moved or deactivated.
                </p>
              ) : null}
            </section>
          ))}
          <label className="flex flex-col gap-2">
            New category name
            <Input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={
              !name.trim() ||
              rows.some(
                (c) => names[c.id] !== undefined && names[c.id] !== c.name,
              )
            }
            onClick={() =>
              mutate({
                operation: "save",
                id: null,
                version: null,
                name: name.trim(),
              })
            }
          >
            Add category
          </Button>
        </fieldset>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          Close categories
        </Button>
      </Dialog>
      <Dialog
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard category changes?"
        description="Unsaved category names will be lost."
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => setDiscard(false)}
        >
          Keep editing
        </Button>
        <Button
          type="button"
          onClick={() => {
            setDiscard(false);
            setNames({});
            setName("");
            setOpen(false);
            requestAnimationFrame(() =>
              trigger.current?.querySelector("button")?.focus(),
            );
          }}
        >
          Discard changes
        </Button>
      </Dialog>
    </>
  );
}
