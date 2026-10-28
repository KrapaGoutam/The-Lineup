"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  getRecipeCategoriesAction,
  setRecipeArchivedAction,
} from "../actions/recipe-management-actions";
import type { ManagementCategory } from "../domain/recipe-management";
import type { RecipeDetail } from "../domain/recipe-detail";

export function RecipeArchiveControl({
  recipe,
  dirty = false,
  demo,
  restaurantSlug,
  demoCategories = [],
  onChanged,
  onReload,
  onSessionInvalid,
}: {
  recipe: RecipeDetail;
  dirty?: boolean;
  demo: boolean;
  restaurantSlug: string;
  demoCategories?: ManagementCategory[];
  onChanged: (active: boolean, version: number, categoryId?: string) => void;
  onReload: () => void;
  onSessionInvalid: () => void;
}) {
  const archived = recipe.is_active === false;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<ManagementCategory[] | null>(
    null,
  );
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const running = useRef(false);
  const needsCategory =
    archived &&
    categories !== null &&
    !categories.some((c) => c.id === recipe.category_id && c.is_active);
  async function show() {
    setOpen(true);
    setError("");
    setStale(false);
    setCategories(null);
    setCategory("");
    if (!archived) return;
    setBusy(true);
    try {
      const result = demo
        ? { ok: true as const, data: demoCategories }
        : await getRecipeCategoriesAction({ restaurantSlug });
      if (result.ok) setCategories(result.data);
      else {
        setError(result.error);
        if (result.sessionInvalid) onSessionInvalid();
      }
    } catch {
      setError(
        "Categories could not be loaded. Close this dialog and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (running.current || stale) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = demo
        ? {
            ok: true as const,
            data: { id: recipe.id, version: (recipe.version ?? 1) + 1 },
          }
        : await setRecipeArchivedAction({
            restaurantSlug,
            recipeId: recipe.id,
            expectedVersion: recipe.version!,
            archived: !archived,
            ...(needsCategory ? { categoryId: category } : {}),
          });
      if (result.ok) {
        setOpen(false);
        onChanged(
          archived,
          result.data.version,
          needsCategory ? category : undefined,
        );
      } else {
        setError(result.error);
        setStale(result.kind === "stale");
        if (result.sessionInvalid) onSessionInvalid();
      }
    } catch {
      setError("The change could not be completed. Try again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={dirty || busy}
        onClick={show}
      >
        {archived ? "Restore Recipe" : "Archive Recipe"}
      </Button>
      {dirty ? (
        <p className="text-muted-foreground text-sm">
          Save or discard your changes first
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={archived ? "Restore Recipe?" : "Archive Recipe?"}
        description={
          archived
            ? "This recipe will be visible to staff again."
            : "Hidden from staff. You can restore it later."
        }
      >
        {needsCategory ? (
          <label className="flex flex-col gap-2">
            Choose an active category
            <Select
              aria-label="Restore category"
              value={category}
              disabled={busy || stale}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Choose a category</option>
              {categories
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </label>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {stale ? (
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              onReload();
            }}
          >
            Reload latest
          </Button>
        ) : (
          <Button
            type="button"
            disabled={
              busy || (archived && !categories) || (needsCategory && !category)
            }
            onClick={confirm}
          >
            {busy ? "Working…" : archived ? "Restore Recipe" : "Archive Recipe"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </Dialog>
    </div>
  );
}
