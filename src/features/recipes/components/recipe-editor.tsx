"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { copyVariant, variantHasContent } from "../domain/copy-variant";
import { emptyVariant } from "../domain/recipe-editor-state";
import {
  editorStatesEqual,
  existingEditorState,
  newEditorState,
  serializeEditorState,
  type EditorLoad,
  type RecipeEditorState,
} from "../domain/recipe-editor-state";
import {
  payloadErrors,
  type RecipePayload,
  type SaveResult,
} from "../domain/recipe-validation";
import {
  EditorField,
  RecipeVariantEditor,
  suggestions,
} from "./recipe-editor-fields";

export function RecipeEditor({
  data,
  onSave,
  onReload,
  onExit,
  onSaved,
  onSessionInvalid,
  onDirtyChange,
  navigationTarget,
  onKeepNavigation,
  onLeaveNavigation,
  managementControls,
}: {
  data: EditorLoad;
  onSave: (
    payload: RecipePayload,
    recipeId: string | null,
    version: number | null,
  ) => Promise<SaveResult>;
  onReload: () => Promise<EditorLoad>;
  onExit: () => void;
  onSaved: (
    result: Extract<SaveResult, { ok: true }>["data"],
    state: RecipeEditorState,
  ) => void;
  onSessionInvalid: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  navigationTarget?: string | null;
  onKeepNavigation?: () => void;
  onLeaveNavigation?: (target: string) => void;
  managementControls?: (
    dirty: boolean,
    updateCategories: (categories: EditorLoad["categories"]) => void,
  ) => React.ReactNode;
}) {
  const initialize = (load: EditorLoad) =>
    load.recipe
      ? existingEditorState(load.recipe, () => crypto.randomUUID())
      : newEditorState(
          load.categories.find((c) => c.is_fallback)?.id ?? "",
          load.nextNumber,
        );
  const [form, setForm] = useState(() => initialize(data));
  const [baseline, setBaseline] = useState(form);
  const [version, setVersion] = useState(data.recipe?.version ?? null);
  const [categories, setCategories] = useState(data.categories);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [variantDialog, setVariantDialog] = useState<"copy" | "remove" | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [copied, setCopied] = useState(false);
  const houseRef = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = copied || !editorStatesEqual(form, baseline);
  const dirtyCallback = useRef(onDirtyChange);
  useEffect(() => {
    dirtyCallback.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    dirtyCallback.current?.(dirty);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function focusField(field?: string) {
    requestAnimationFrame(() => {
      const target = field
        ? document.getElementById(field)
        : formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.focus();
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    const payload = serializeEditorState(form);
    const invalid = payloadErrors(payload);
    setErrors(invalid);
    setMessage("");
    if (Object.keys(invalid).length) {
      setMessage("Check the highlighted fields before saving.");
      focusField();
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const result = await onSave(payload, data.recipe?.id ?? null, version);
      if (!result.ok) {
        if (result.sessionInvalid) {
          onSessionInvalid();
          return;
        }
        setMessage(result.error);
        setStale(result.kind === "stale");
        if (result.field) {
          setErrors({ [result.field]: result.error });
          focusField(result.field);
        }
        return;
      }
      setBaseline(form);
      setCopied(false);
      setVersion(result.data.version);
      setStale(false);
      setMessage("Recipe saved");
      onSaved(result.data, form);
    } catch {
      setMessage(
        "Recipe could not be saved. Your changes are still here. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const latest = await onReload();
      const next = initialize(latest);
      setForm(next);
      setBaseline(next);
      setCopied(false);
      setVersion(latest.recipe?.version ?? null);
      setCategories(latest.categories);
      setErrors({});
      setMessage("");
      setStale(false);
    } catch {
      setMessage(
        "The latest recipe could not be loaded. Your edits are still here. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const houseControls = (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="house-management-title"
    >
      <h2
        id="house-management-title"
        ref={houseRef}
        tabIndex={-1}
        className="text-lg font-semibold"
      >
        House Recipe options
      </h2>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!variantHasContent(form.variants.perfect)}
          onClick={() => {
            setAnnouncement("");
            setVariantDialog("copy");
          }}
        >
          Copy Perfect Recipe → House Recipe
        </Button>
        {!form.variants.house ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm({
                ...form,
                variants: { ...form.variants, house: emptyVariant() },
              })
            }
          >
            Add House Recipe
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (variantHasContent(form.variants.house))
                setVariantDialog("remove");
              else
                setForm({
                  ...form,
                  variants: { ...form.variants, house: null },
                });
            }}
          >
            Remove House Recipe
          </Button>
        )}
      </div>
      {!variantHasContent(form.variants.perfect) ? (
        <p className="text-muted-foreground">Add a Perfect Recipe first</p>
      ) : null}
      <p aria-live="polite">{announcement}</p>
    </section>
  );
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="flex w-full max-w-6xl flex-col gap-6 pb-48 lg:pb-8"
      aria-label={data.recipe ? "Edit Recipe" : "Add Recipe"}
    >
      <div className="bg-background flex flex-wrap items-center justify-between gap-4 lg:sticky lg:top-4 lg:z-20">
        <h1 className="text-2xl font-semibold">
          {data.recipe ? "Edit Recipe" : "Add Recipe"}
        </h1>
        <div className="bg-background border-border fixed right-3 bottom-24 left-3 z-20 flex items-center justify-end gap-3 rounded-xl border p-3 shadow-lg lg:sticky lg:top-4 lg:right-auto lg:bottom-auto lg:left-auto lg:ml-auto">
          <span className="text-muted-foreground text-sm" role="status">
            {busy ? "Saving…" : dirty ? "Unsaved changes" : "No changes"}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (dirty) {
                setDiscard(true);
              } else onExit();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {message ? (
        <div
          role={message === "Recipe saved" ? "status" : "alert"}
          className="border-border flex flex-col gap-3 rounded-lg border p-4"
        >
          <p>{message}</p>
          {Object.keys(errors).length ? (
            <ul>
              {Object.entries(errors).map(([field, error]) => (
                <li key={field}>
                  <button
                    type="button"
                    className="min-h-11 underline"
                    onClick={() => focusField(field)}
                  >
                    {field === "recipe_number"
                      ? "Recipe number"
                      : field === "name"
                        ? "Name"
                        : "Recipe field"}
                    : {error}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {stale ? (
        <div
          role="alert"
          className="border-border flex flex-wrap gap-3 rounded-lg border p-4"
        >
          <p className="w-full">Your unsaved changes have been kept.</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={reload}
          >
            Reload latest
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setStale(false);
              setMessage("");
            }}
          >
            Keep editing
          </Button>
        </div>
      ) : null}
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6">
        {managementControls?.(dirty, (next) =>
          setCategories(
            next.filter((c) => c.is_active || c.id === form.category_id),
          ),
        )}
        <section
          className="border-border flex flex-col gap-4 rounded-xl border p-4"
          aria-labelledby="basic-info-title"
        >
          <h2 id="basic-info-title" className="text-lg font-semibold">
            Basic Info
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <EditorField
              id="recipe_number"
              label="Recipe number"
              type="number"
              value={form.recipe_number}
              onChange={(value) => setForm({ ...form, recipe_number: value })}
              error={errors.recipe_number}
            />
            <EditorField
              id="name"
              label="Name"
              value={form.name}
              maxLength={120}
              onChange={(value) => setForm({ ...form, name: value })}
              error={errors.name}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="category_id">Category</Label>
              <Select
                id="category_id"
                value={form.category_id}
                aria-invalid={!!errors.category_id}
                aria-describedby={
                  errors.category_id ? "category_id-error" : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, category_id: event.target.value })
                }
              >
                <option value="">Choose a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
              {errors.category_id ? (
                <p id="category_id-error" className="text-destructive">
                  {errors.category_id}
                </p>
              ) : null}
              {!categories.length ? (
                <p className="text-muted-foreground text-sm">
                  No active recipe categories are available. A category is
                  required before saving.
                </p>
              ) : null}
            </div>
            <EditorField
              id="base_spirit"
              label="Base spirit"
              value={form.base_spirit}
              maxLength={40}
              options={suggestions.base_spirit}
              onChange={(value) => setForm({ ...form, base_spirit: value })}
              error={errors.base_spirit}
            />
            <EditorField
              id="alternate_name"
              label="Alternate name"
              value={form.alternate_name}
              maxLength={120}
              onChange={(value) => setForm({ ...form, alternate_name: value })}
              error={errors.alternate_name}
            />
            <EditorField
              id="description"
              label="Description"
              value={form.description}
              maxLength={200}
              multiline
              onChange={(value) => setForm({ ...form, description: value })}
              error={errors.description}
            />
          </div>
          <fieldset className="flex flex-wrap gap-6">
            <legend className="mb-2 text-sm font-medium">Recipe flags</legend>
            {(
              [
                ["is_alcoholic", "Contains alcohol"],
                ["is_popular", "Popular"],
                ["is_menu_item", "On menu"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-11 cursor-pointer items-center gap-3"
              >
                <input
                  type="checkbox"
                  className="size-5"
                  checked={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        </section>
        <section className="border-border rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Image</h2>
          <p className="text-muted-foreground">
            {data.recipe
              ? "Photo editing will be available in a later update."
              : "Save the recipe first, then add a photo."}
          </p>
        </section>
        {(["perfect", "house"] as const).map((kind) => (
          <Fragment key={kind}>
            {kind === "house" ? houseControls : null}
            {form.variants[kind] ? (
              <RecipeVariantEditor
                key={kind}
                kind={kind}
                value={form.variants[kind]}
                errors={errors}
                onChange={(value) =>
                  setForm({
                    ...form,
                    variants: { ...form.variants, [kind]: value },
                  })
                }
              />
            ) : (
              <section
                key={kind}
                className="border-border rounded-xl border p-4"
              >
                <h2 className="text-lg font-semibold">
                  {kind === "house"
                    ? "House Recipe"
                    : "Perfect Bartending Recipe"}
                </h2>
                <p className="text-muted-foreground">
                  No {kind === "house" ? "House" : "Perfect"} recipe.
                </p>
              </section>
            )}
          </Fragment>
        ))}
      </fieldset>
      <Dialog
        open={variantDialog !== null}
        onClose={() => setVariantDialog(null)}
        title={
          variantDialog === "remove"
            ? "Remove House Recipe?"
            : variantHasContent(form.variants.house)
              ? "Replace the House Recipe?"
              : "Copy the Perfect Recipe into the House Recipe?"
        }
        description={
          variantDialog === "remove"
            ? "The House Recipe will be removed when you press Save."
            : variantHasContent(form.variants.house)
              ? "Everything currently in the House Recipe will be replaced by a copy of the Perfect Recipe. This isn't saved until you press Save."
              : "You can then edit the differences. This isn't saved until you press Save."
        }
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVariantDialog(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const removing = variantDialog === "remove";
              if (!removing && !variantHasContent(form.variants.perfect))
                return;
              setForm({
                ...form,
                variants: {
                  ...form.variants,
                  house: removing
                    ? null
                    : copyVariant(form.variants.perfect!, () =>
                        crypto.randomUUID(),
                      ),
                },
              });
              setVariantDialog(null);
              if (!removing) setCopied(true);
              setAnnouncement(
                removing
                  ? "House Recipe removed. Save to keep this change."
                  : "House Recipe copied from Perfect",
              );
              requestAnimationFrame(() => houseRef.current?.focus());
            }}
          >
            {variantDialog === "remove"
              ? "Remove House"
              : variantHasContent(form.variants.house)
                ? "Replace House"
                : "Copy Recipe"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={discard || !!navigationTarget}
        title="Discard changes?"
        description="Your unsaved recipe changes will be lost."
        onClose={() => {
          setDiscard(false);
          if (navigationTarget) onKeepNavigation?.();
        }}
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDiscard(false);
              if (navigationTarget) onKeepNavigation?.();
            }}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            onClick={() =>
              navigationTarget
                ? onLeaveNavigation?.(navigationTarget)
                : onExit()
            }
          >
            Discard changes
          </Button>
        </div>
      </Dialog>
    </form>
  );
}
