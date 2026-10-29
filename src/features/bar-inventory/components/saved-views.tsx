"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
  applyView,
  captureView,
  cleanViewState,
  hasExplicitInventoryState,
  readViewPayload,
  VIEW_PARTS,
  type ColumnLayout,
  type SavedView,
  type ViewPart,
} from "../domain/saved-views";
import type { ColumnSpec, TableState } from "../domain/table-filters";
import type { RunCatalogCommand } from "./catalog-dialogs";
const LABELS: Record<ViewPart, string> = {
  search: "Search",
  filters: "Filters",
  sort: "Sort",
  hidden: "Visible columns",
  order: "Column order",
  showArchived: "Show archived",
};
export type SavedViewsBinding = {
  views: SavedView[];
  run: RunCatalogCommand;
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
};
export function SavedViews({
  binding,
  state,
  layout,
  columns,
  onState,
  onLayout,
}: {
  binding: SavedViewsBinding;
  state: TableState;
  layout: ColumnLayout;
  columns: Pick<ColumnSpec<unknown>, "id" | "type">[];
  onState: (state: TableState) => void;
  onLayout: (layout: ColumnLayout) => void;
}) {
  const [current, setCurrent] = useState(() =>
    typeof window !== "undefined" &&
    !hasExplicitInventoryState(window.location.search)
      ? (binding.views.find((v) => v.isDefault)?.id ?? "")
      : "",
  );
  const [dialog, setDialog] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [owns, setOwns] = useState<ViewPart[]>([...VIEW_PARTS]);
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = binding.views.find((v) => v.id === current);
  function apply(view: SavedView) {
    const payload = readViewPayload(view.payload, columns);
    if (!payload) {
      setError(
        "This saved view uses an unsupported format. Save the current view again.",
      );
      return;
    }
    const next = applyView(
      { ...state, ...layout, showArchived: binding.showArchived },
      payload,
    );
    onState({ search: next.search, filters: next.filters, sort: next.sort });
    onLayout({ hidden: next.hidden, order: next.order });
    binding.setShowArchived(next.showArchived);
    setCurrent(view.id);
    setError(null);
  }
  function open(mode: "create" | "rename", copy = false) {
    setDialog(mode);
    setName(
      mode === "rename"
        ? (selected?.name ?? "")
        : copy
          ? `${selected?.name ?? "View"} copy`
          : "",
    );
    setOwns([...VIEW_PARTS]);
    setMakeDefault(mode === "rename" ? (selected?.isDefault ?? false) : false);
    setError(null);
  }
  async function save(
    mode: "create" | "rename" | "update" | "default",
    defaultValue?: boolean,
  ) {
    if (busy) return;
    setError(null);
    const old = mode === "create" ? undefined : selected;
    if (mode !== "create" && !old) return;
    const oldPayload = old ? readViewPayload(old.payload, columns) : null;
    const payload =
      mode === "rename" || mode === "default"
        ? oldPayload
        : captureView(
            mode === "update" ? (oldPayload?.owns ?? [...VIEW_PARTS]) : owns,
            cleanViewState(state, columns),
            layout,
            binding.showArchived,
          );
    if (!payload) {
      setError("This view cannot be read. Use Save as new to replace it.");
      return;
    }
    const nextName =
      mode === "update" || mode === "default" ? old!.name : name.trim();
    if (!nextName || nextName.length > 80) {
      setError("Enter a view name of 1–80 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await binding.run({
        type: "savedViewSave",
        id: old?.id ?? null,
        name: nextName,
        payload,
        isDefault:
          mode === "default"
            ? defaultValue!
            : mode === "update"
              ? old!.isDefault
              : makeDefault,
        expectedVersion: old?.version ?? null,
      });
      if (result.ok) {
        const saved = result.snapshot.savedViews?.find(
          (v) => v.name === nextName,
        );
        if (saved) setCurrent(saved.id);
        setDialog(null);
      } else setError(result.error);
    } catch {
      setError("Could not save your view. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await binding.run({
        type: "savedViewDelete",
        id: selected.id,
        expectedVersion: selected.version,
      });
      if (result.ok) {
        setCurrent("");
        setError(null);
      } else setError(result.error);
    } catch {
      setError("Could not delete this view. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Select
        aria-label="Saved Views"
        className="w-auto max-w-56"
        value={selected?.id ?? ""}
        onChange={(e) => {
          const v = binding.views.find((v) => v.id === e.target.value);
          if (v) apply(v);
        }}
      >
        <option value="">Saved Views</option>
        {binding.views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.isDefault ? " (default)" : ""}
          </option>
        ))}
      </Select>
      <Button variant="outline" onClick={() => open("create")}>
        Save View
      </Button>
      {selected ? (
        <details className="relative">
          <summary className="focus-visible:ring-ring min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-sm focus-visible:ring-2">
            Manage view
          </summary>
          <div className="bg-card border-border absolute right-0 z-30 flex w-56 flex-col gap-1 rounded-lg border p-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void save("update")}
            >
              Update current view
            </Button>
            <Button variant="ghost" onClick={() => open("create", true)}>
              Save as new
            </Button>
            <Button variant="ghost" onClick={() => open("rename")}>
              Rename view
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void save("default", !selected.isDefault)}
            >
              {selected.isDefault ? "Remove default" : "Make default"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete view
            </Button>
          </div>
        </details>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => {
          onState({ search: "", filters: {}, sort: [] });
          onLayout({ hidden: [], order: columns.map((c) => c.id) });
          binding.setShowArchived(false);
          setCurrent("");
          setError(null);
        }}
      >
        Reset to standard Inventory
      </Button>
      {error && !dialog ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {error}
        </p>
      ) : null}
      <Dialog
        open={!!dialog}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={dialog === "rename" ? "Rename view" : "Save View"}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(dialog ?? "create");
          }}
        >
          <label className="block text-sm">
            View name
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {dialog !== "rename" ? (
            <fieldset>
              <legend className="text-sm font-semibold">
                Save these settings
              </legend>
              {VIEW_PARTS.map((part) => (
                <label
                  className="flex min-h-11 items-center gap-2 text-sm"
                  key={part}
                >
                  <input
                    type="checkbox"
                    checked={owns.includes(part)}
                    onChange={() =>
                      setOwns((old) =>
                        old.includes(part)
                          ? old.filter((p) => p !== part)
                          : [...old, part],
                      )
                    }
                  />
                  {LABELS[part]}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
            />
            Make my default Inventory view
          </label>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
