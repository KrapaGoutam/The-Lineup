"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import type { FreshnessRule } from "../domain/freshness";
import type { CatalogSnapshot } from "../domain/inventory-types";
import type { RunCatalogCommand } from "./catalog-dialogs";
export function FreshnessRules({
  snapshot,
  run,
}: {
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
}) {
  const [editing, setEditing] = useState<FreshnessRule | "new" | null>(null);
  const [subcategory, setSubcategory] = useState("");
  const [maximum, setMaximum] = useState("");
  const [warning, setWarning] = useState("1");
  const [tracking, setTracking] = useState(true);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rules = snapshot.freshnessRules ?? [];
  const label = (id: string) => {
    const sub = snapshot.subcategories.find((s) => s.id === id);
    return `${snapshot.categories.find((c) => c.id === sub?.categoryId)?.name ?? "Category"} / ${sub?.name ?? "Subcategory"}`;
  };
  function edit(rule: FreshnessRule | "new") {
    setEditing(rule);
    setSubcategory(rule === "new" ? "" : rule.subcategoryId);
    setMaximum(rule === "new" ? "" : String(rule.maximumMonths));
    setWarning(rule === "new" ? "1" : String(rule.warningMonths));
    setTracking(rule === "new" || rule.trackingEnabled);
    setActive(rule === "new" || rule.active);
    setError(null);
  }
  async function save() {
    if (!editing || busy) return;
    setError(null);
    if (
      !subcategory ||
      !/^\d+$/.test(maximum) ||
      !/^\d+$/.test(warning) ||
      Number(maximum) < 1 ||
      Number(maximum) > 120 ||
      Number(warning) >= Number(maximum)
    ) {
      setError(
        "Choose a subcategory, maximum age of 1–120 months and warning months below the maximum.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await run({
        type: "freshnessRuleSave",
        id: editing === "new" ? null : editing.id,
        subcategoryId: subcategory,
        maximumMonths: Number(maximum),
        warningMonths: Number(warning),
        trackingEnabled: tracking,
        active,
        expectedVersion: editing === "new" ? null : editing.version,
      });
      if (result.ok) setEditing(null);
      else setError(result.error);
    } catch {
      setError("Could not save this rule. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="freshness-rules-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="freshness-rules-title" className="font-semibold">
          Freshness Rules
        </h2>
        <Button onClick={() => edit("new")}>Add freshness rule</Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Choose manufacture-age limits for each subcategory at this location.
        There is no automatic beer limit. Expiration dates use separate alerts.
      </p>
      {!rules.length ? (
        <p className="text-muted-foreground text-sm">
          No freshness rules configured. Add a subcategory under Categories
          first if needed.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              key={rule.id}
            >
              <div>
                <h3 className="font-medium">{label(rule.subcategoryId)}</h3>
                <p className="text-muted-foreground text-sm">
                  Maximum {rule.maximumMonths} months · Warn{" "}
                  {rule.warningMonths} months before ·{" "}
                  {rule.active ? "Active" : "Inactive"} · Tracking{" "}
                  {rule.trackingEnabled ? "enabled" : "disabled"}
                </p>
              </div>
              <Button
                variant="outline"
                aria-label={`Edit freshness rule ${label(rule.subcategoryId)}`}
                onClick={() => edit(rule)}
              >
                Edit rule
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title={editing === "new" ? "Add freshness rule" : "Edit freshness rule"}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block text-sm">
            Subcategory
            <Select
              aria-label="Subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              required
            >
              <option value="">Choose subcategory</option>
              {snapshot.subcategories
                .filter((s) => s.active || s.id === subcategory)
                .map((s) => (
                  <option
                    value={s.id}
                    key={s.id}
                    disabled={rules.some(
                      (r) =>
                        r.subcategoryId === s.id &&
                        (editing === "new" || r.id !== editing?.id),
                    )}
                  >
                    {label(s.id)}
                  </option>
                ))}
            </Select>
          </label>
          <label className="block text-sm">
            Maximum age (months)
            <Input
              inputMode="numeric"
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Warn before limit (months)
            <Input
              inputMode="numeric"
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
              required
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => setTracking(e.target.checked)}
            />
            Manufacture tracking enabled
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Rule active
          </label>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save freshness rule"}
            </Button>
            {editing && editing !== "new" ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  const current = rules.find((r) => r.id === editing.id);
                  if (current) edit(current);
                }}
              >
                Reload latest rule
              </Button>
            ) : null}
          </div>
        </form>
      </Dialog>
    </section>
  );
}
