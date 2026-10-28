"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/features/bar-inventory/components/table-kit/empty-state";
import {
  getRecipeEditorAction,
  saveRecipeAction,
} from "../actions/recipe-write-actions";
import type {
  EditorLoad,
  RecipeEditorState,
} from "../domain/recipe-editor-state";
import type { RecipePayload, SaveResult } from "../domain/recipe-validation";
import { RecipeEditor } from "./recipe-editor";
import { RecipeArchiveControl } from "./recipe-archive-control";
import { RecipeCategoryDialog } from "./recipe-category-dialog";
import { RecipeDetailView } from "./recipe-detail";
import type { ManagementCategory } from "../domain/recipe-management";
export function RecipeEditorScreen({
  restaurantSlug,
  slug,
  demo,
  demoLoad,
  demoSave,
  onExit,
  onSaved,
  onSessionInvalid,
  onDirtyChange,
  navigationTarget,
  onKeepNavigation,
  onLeaveNavigation,
  onArchived,
  demoCategories,
  onCategoriesChanged,
  occupiedCategoryIds,
}: {
  restaurantSlug: string;
  slug: string | null;
  demo: boolean;
  demoLoad: EditorLoad;
  demoSave: (
    payload: RecipePayload,
    id: string | null,
    version: number | null,
  ) => Promise<SaveResult>;
  onExit: () => void;
  onSaved: (
    data: Extract<SaveResult, { ok: true }>["data"],
    state: RecipeEditorState,
  ) => void;
  onSessionInvalid: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  navigationTarget?: string | null;
  onKeepNavigation?: () => void;
  onLeaveNavigation?: (target: string) => void;
  onArchived?: (active: boolean, version: number, categoryId?: string) => void;
  demoCategories?: ManagementCategory[];
  onCategoriesChanged?: (categories: ManagementCategory[]) => void;
  occupiedCategoryIds?: string[];
}) {
  const [result, setResult] = useState<{ data?: EditorLoad; error?: string }>(
    demo ? { data: demoLoad } : {},
  );
  const [attempt, setAttempt] = useState(0);
  const invalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    invalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);
  useEffect(() => {
    if (demo) return;
    let active = true;
    getRecipeEditorAction({ restaurantSlug, slug })
      .then((r) => {
        if (!active) return;
        if (r.ok) setResult({ data: r.data });
        else if (r.sessionInvalid) invalidRef.current();
        else setResult({ error: r.error });
      })
      .catch(() => {
        if (active) setResult({ error: "Recipe editor could not be loaded." });
      });
    return () => {
      active = false;
    };
  }, [demo, restaurantSlug, slug, attempt]);
  if (result.error)
    return (
      <section role="alert" className="flex flex-col gap-4">
        <p>{result.error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setResult({});
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </Button>
        <Button variant="outline" onClick={onExit}>
          Back to Bar Recipes
        </Button>
      </section>
    );
  if (!result.data) return <TableSkeleton />;
  const archive = (dirty: boolean) =>
    result.data?.recipe ? (
      <RecipeArchiveControl
        recipe={result.data.recipe}
        dirty={dirty}
        demo={demo}
        restaurantSlug={restaurantSlug}
        demoCategories={demoCategories}
        onSessionInvalid={onSessionInvalid}
        onReload={() => {
          setResult({});
          setAttempt((a) => a + 1);
        }}
        onChanged={(active, version, categoryId) => {
          onArchived?.(active, version, categoryId);
          onExit();
        }}
      />
    ) : null;
  if (result.data.recipe?.is_active === false)
    return (
      <div className="flex flex-col gap-4">
        <p role="status">Archived — hidden from staff</p>
        {archive(false)}
        <RecipeDetailView
          recipe={result.data.recipe}
          backHref="?tab=recipes"
          onBack={(e) => {
            e.preventDefault();
            onExit();
          }}
        />
      </div>
    );
  return (
    <RecipeEditor
      data={result.data}
      managementControls={(dirty, updateCategories) => (
        <div className="flex flex-wrap items-start gap-3">
          {archive(dirty)}
          <RecipeCategoryDialog
            restaurantSlug={restaurantSlug}
            demo={demo}
            demoCategories={demoCategories}
            occupiedCategoryIds={occupiedCategoryIds}
            onSessionInvalid={onSessionInvalid}
            onChanged={(categories) => {
              updateCategories(categories);
              onCategoriesChanged?.(categories);
            }}
          />
        </div>
      )}
      onSave={(payload, recipeId, expectedVersion) =>
        demo
          ? demoSave(payload, recipeId, expectedVersion)
          : saveRecipeAction({
              restaurantSlug,
              payload,
              recipeId,
              expectedVersion,
            })
      }
      onReload={async () => {
        if (demo) return demoLoad;
        const r = await getRecipeEditorAction({ restaurantSlug, slug });
        if (!r.ok) {
          if (r.sessionInvalid) onSessionInvalid();
          throw new Error("Recipe unavailable");
        }
        return r.data;
      }}
      onExit={onExit}
      onSaved={onSaved}
      onSessionInvalid={onSessionInvalid}
      onDirtyChange={onDirtyChange}
      navigationTarget={navigationTarget}
      onKeepNavigation={onKeepNavigation}
      onLeaveNavigation={onLeaveNavigation}
    />
  );
}
