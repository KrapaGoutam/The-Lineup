"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RecipeDetailView } from "./recipe-detail";
import { RecipeEditorScreen } from "./recipe-editor-screen";
import { demoRecipeFromState } from "../domain/demo-recipes";
import type { EditorRecipe } from "../domain/recipe-editor-state";
import type { SaveResult } from "../domain/recipe-validation";
import type { RecipeDetail, DetailVariant } from "../domain/recipe-detail";
import { TableSkeleton } from "@/features/bar-inventory/components/table-kit/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RecipeArchiveControl } from "./recipe-archive-control";
import { RecipeCategoryDialog } from "./recipe-category-dialog";
import type { ManagementCategory } from "../domain/recipe-management";
import {
  getRecipeDetailAction,
  getRecipeIndexAction,
} from "../actions/recipe-actions";
import { type Recipe, type RecipeIndex } from "../domain/recipe-index";
import { useViewPreference } from "../hooks/use-view-preference";
import {
  deriveBrowsingData,
  type RecipeFilterMode,
  type RecipeSortMode,
} from "../domain/recipe-filters";
import { RecipePictureBook } from "./recipe-picture-book";

const demoIndex: RecipeIndex = {
  categories: [
    {
      id: "c1",
      name: "R1 Test Cocktails",
      display_order: 1,
      is_fallback: false,
    },
    { id: "c2", name: "Others", display_order: 0, is_fallback: true },
  ],
  recipes: [
    {
      id: "r1",
      category_id: "c1",
      recipe_number: 1,
      name: "R1 Test Citrus",
      slug: "r1-test-citrus",
      alternate_name: null,
      base_spirit: "Gin",
      is_popular: true,
      is_menu_item: true,
      is_alcoholic: true,
    },
    {
      id: "r2",
      category_id: "c2",
      recipe_number: 23,
      name: "R1 Test Highball",
      slug: "r1-test-highball",
      alternate_name: null,
      base_spirit: null,
      is_popular: false,
      is_menu_item: true,
      is_alcoholic: false,
    },
    {
      id: "r3",
      category_id: "c1",
      recipe_number: 15,
      name: "R1 Test Archived",
      slug: "r1-test-archived",
      alternate_name: null,
      base_spirit: null,
      is_popular: false,
      is_menu_item: false,
      is_alcoholic: true,
      is_active: false,
    },
  ],
};
function Rows({
  recipes,
  href,
  open,
}: {
  recipes: Recipe[];
  href: (slug: string) => string;
  open: (event: React.MouseEvent<HTMLAnchorElement>, slug: string) => void;
}) {
  return (
    <ul className="grid gap-1 lg:grid-cols-2">
      {recipes.map((r) => (
        <li key={r.id} className={cn(r.is_active === false && "opacity-60")}>
          <a
            href={href(r.slug)}
            onClick={(event) => open(event, r.slug)}
            data-recipe-link={r.slug}
            className="flex min-h-12 items-center gap-4 border-b px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
              {String(r.recipe_number).padStart(2, "0")}
            </span>
            <span>{r.name}</span>
            {r.is_active === false ? (
              <span className="border-border rounded border px-2 text-xs">
                Archived
              </span>
            ) : null}
            {r.is_popular ? <span aria-label="Popular">&#9733;</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
export function RecipesModule({
  restaurantSlug,
  demo,
  onSessionInvalid,
  isManagement = false,
}: {
  restaurantSlug: string;
  demo: boolean;
  onSessionInvalid: () => void;
  isManagement?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSlug = searchParams.get("recipe")?.trim() || null;
  const requestedMode = searchParams.get("mode");
  const [editorLock, setEditorLock] = useState<{
    mode: string | null;
    slug: string | null;
    href: string;
  } | null>(null);
  // Keep the mounted editor (and all input) until an in-module exit is confirmed.
  const slug = editorLock ? editorLock.slug : requestedSlug;
  const mode = editorLock ? editorLock.mode : requestedMode;
  const editing =
    isManagement && (mode === "new" || (mode === "edit" && !!slug));
  const [demoRecords, setDemoRecords] = useState<Record<string, EditorRecipe>>(
    {},
  );
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState<{
    slug: string;
    data?: RecipeDetail | null;
    error?: string;
  } | null>(null);
  const lastOpened = useRef<string | null>(null);
  const [state, setState] = useState<{ data?: RecipeIndex; error?: string }>(
    demo ? { data: demoIndex } : {},
  );
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useViewPreference();
  const [filterMode, setFilterMode] = useState<RecipeFilterMode>("all");
  const [sortMode, setSortMode] = useState<RecipeSortMode>("book");
  const browsing = useMemo(() => {
    if (!state.data) return null;
    return deriveBrowsingData({
      index: state.data,
      isManagement,
      showArchived,
      filterMode,
      sortMode,
      query,
    });
  }, [state.data, isManagement, showArchived, filterMode, sortMode, query]);
  const [demoCategories, setDemoCategories] = useState<ManagementCategory[]>(
    () =>
      demoIndex.categories.map((c) => ({ ...c, is_active: true, version: 1 })),
  );
  const [attempt, setAttempt] = useState(0);
  const invalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    invalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);
  useEffect(() => {
    if (demo || slug) return;
    let live = true;
    getRecipeIndexAction({ restaurantSlug })
      .then((result) => {
        if (!live) return;
        if (result.ok) setState({ data: result.data });
        else if (result.sessionInvalid) invalidRef.current();
        else setState({ error: result.error });
      })
      .catch(() => {
        if (live) setState({ error: "Recipes could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [restaurantSlug, demo, attempt, slug]);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    if (demo) {
      const recipe = state.data?.recipes.find((r) => r.slug === slug);
      const variant = (kind: string): DetailVariant => ({
        id: kind,
        variant: kind,
        method: "R1 synthetic method",
        rim_type: "R1 rim",
        rim_notes: null,
        glass: "R1 glass",
        glass_notes: null,
        presentation_notes: null,
        tips: "R1 synthetic notes",
        batch_notes: null,
        ingredients: [
          {
            id: kind + "i",
            amount: kind === "house" ? "Top" : "2",
            unit: kind === "house" ? null : "oz",
            ingredient_name: "R1 synthetic ingredient",
            preparation: null,
            sort_order: 1,
          },
        ],
        steps: [
          { id: kind + "s", instruction: "R1 synthetic step", sort_order: 1 },
        ],
        garnishes: [
          {
            id: kind + "g",
            name: "R1 synthetic garnish",
            notes: null,
            sort_order: 1,
          },
        ],
      });
      const data: RecipeDetail | null =
        demoRecords[slug] ??
        (recipe
          ? {
              ...recipe,
              category:
                demoIndex.categories.find((c) => c.id === recipe.category_id)
                  ?.name ?? "",
              description: null,
              is_menu_item: false,
              variants:
                recipe.id === "r1"
                  ? [variant("perfect"), variant("house")]
                  : [variant("perfect")],
            }
          : null);
      Promise.resolve().then(() => {
        if (live) setDetail({ slug, data });
      });
    } else {
      getRecipeDetailAction({ restaurantSlug, slug })
        .then((result) => {
          if (!live) return;
          if (result.ok) setDetail({ slug, data: result.data });
          else if (result.sessionInvalid) invalidRef.current();
          else setDetail({ slug, error: result.error });
        })
        .catch(() => {
          if (live) setDetail({ slug, error: "Recipes could not be loaded." });
        });
    }
    return () => {
      live = false;
    };
  }, [slug, restaurantSlug, demo, attempt, demoRecords, state.data]);
  useEffect(() => {
    if (slug || !state.data || !lastOpened.current) return;
    const last = lastOpened.current;
    const frame = requestAnimationFrame(() => {
      try {
        const value = sessionStorage.getItem(
          `recipes-scroll-${restaurantSlug}`,
        );
        if (value !== null) window.scrollTo(0, Number(value) || 0);
      } catch {
        /* Storage can be unavailable. */
      }
      document
        .querySelector<HTMLElement>(`[data-recipe-link="${last}"]`)
        ?.focus({ preventScroll: true });
      lastOpened.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [slug, state.data, restaurantSlug]);
  function hrefFor(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "recipes");
    if (next) params.set("recipe", next);
    else params.delete("recipe");
    params.delete("mode");
    return pathname + "?" + params.toString();
  }
  function navigate(
    event: React.MouseEvent<HTMLAnchorElement>,
    next: string | null,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (next) {
      lastOpened.current = next;
      try {
        sessionStorage.setItem(
          `recipes-scroll-${restaurantSlug}`,
          String(window.scrollY),
        );
      } catch {
        /* Storage can be unavailable. */
      }
    }
    window.history.pushState(null, "", hrefFor(next));
  }
  function openEditor(next: "new" | "edit") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "recipes");
    params.set("mode", next);
    if (next === "new") params.delete("recipe");
    setSaved(false);
    window.history.pushState(null, "", pathname + "?" + params.toString());
  }
  function categoriesChanged(categories: ManagementCategory[]) {
    if (demo) {
      setDemoCategories(categories);
      setState((previous) =>
        previous.data ? { data: { ...previous.data, categories } } : previous,
      );
      setDemoRecords((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([key, recipe]) => [
            key,
            {
              ...recipe,
              category:
                categories.find((c) => c.id === recipe.category_id)?.name ??
                recipe.category,
            },
          ]),
        ),
      );
    } else setAttempt((a) => a + 1);
  }
  function archiveChanged(
    active: boolean,
    version: number,
    categoryId?: string,
  ) {
    if (demo && slug && detail?.data) {
      const recipe = demoRecords[slug] ?? {
        ...detail.data,
        category_id:
          detail.data.category_id ??
          state.data?.recipes.find((r) => r.slug === slug)?.category_id ??
          "c2",
        alternate_name: null,
        is_alcoholic: true,
        version: detail.data.version ?? 1,
      };
      const next = {
        ...recipe,
        is_active: active,
        version,
        category_id: categoryId ?? recipe.category_id,
        category:
          demoCategories.find(
            (c) => c.id === (categoryId ?? recipe.category_id),
          )?.name ?? recipe.category,
      };
      setDemoRecords((records) => ({ ...records, [slug]: next }));
      setState((previous) =>
        previous.data
          ? {
              data: {
                ...previous.data,
                recipes: previous.data.recipes.map((r) =>
                  r.id === recipe.id
                    ? { ...r, is_active: active, category_id: next.category_id }
                    : r,
                ),
              },
            }
          : previous,
      );
    } else {
      setDetail(null);
      setAttempt((a) => a + 1);
    }
  }
  if (editing) {
    const index = state.data ?? demoIndex;
    const existing =
      slug && mode === "edit"
        ? (demoRecords[slug] ??
          (detail?.slug === slug && detail.data
            ? {
                ...detail.data,
                category_id:
                  index.recipes.find((r) => r.slug === slug)?.category_id ??
                  "c2",
                alternate_name:
                  index.recipes.find((r) => r.slug === slug)?.alternate_name ??
                  null,
                is_alcoholic: true,
                version: 1,
              }
            : null))
        : null;
    if (demo && mode === "edit" && !existing) {
      if (detail?.slug === slug && detail.data === null)
        return <p>Recipe not found</p>;
      return <TableSkeleton />;
    }
    return (
      <>
        {saved && <p role="status">Recipe saved</p>}
        <RecipeEditorScreen
          key={`${mode}-${slug}`}
          restaurantSlug={restaurantSlug}
          slug={mode === "edit" ? slug : null}
          demo={demo}
          demoCategories={demoCategories}
          onCategoriesChanged={categoriesChanged}
          onArchived={archiveChanged}
          occupiedCategoryIds={index.recipes
            .filter((r) => r.is_active !== false)
            .map((r) => r.category_id)}
          demoLoad={{
            categories: demoCategories.filter(
              (c) => c.is_active || c.id === existing?.category_id,
            ),
            nextNumber:
              Math.max(0, ...index.recipes.map((r) => r.recipe_number)) + 1,
            recipe: existing,
          }}
          demoSave={async (payload, id, version): Promise<SaveResult> => {
            const duplicate = index.recipes.find(
              (r) => r.recipe_number === payload.recipe_number && r.id !== id,
            );
            if (duplicate)
              return {
                ok: false,
                kind: "duplicate",
                field: "recipe_number",
                error: `This recipe number is already used by ${duplicate.recipe_number} ${duplicate.name}.`,
              };
            const recipeId = id ?? crypto.randomUUID();
            let nextSlug =
              existing?.slug ??
              (payload.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") ||
                `recipe-${payload.recipe_number}`);
            if (!id) {
              const base =
                nextSlug === "new" || nextSlug === "edit"
                  ? `recipe-${payload.recipe_number}`
                  : nextSlug;
              nextSlug = base;
              for (
                let suffix = 2;
                index.recipes.some((r) => r.slug === nextSlug);
                suffix++
              )
                nextSlug = `${base}-${suffix}`;
            }
            return {
              ok: true,
              data: {
                id: recipeId,
                slug: nextSlug,
                version: (version ?? 0) + 1,
                recipe_number: payload.recipe_number,
              },
            };
          }}
          onExit={() => {
            setEditorLock(null);
            window.history.pushState(
              null,
              "",
              hrefFor(mode === "edit" ? slug : null),
            );
          }}
          onDirtyChange={(dirty) =>
            setEditorLock((previous) =>
              dirty
                ? (previous ?? { mode, slug, href: window.location.href })
                : null,
            )
          }
          navigationTarget={
            editorLock &&
            (requestedMode !== editorLock.mode ||
              requestedSlug !== editorLock.slug)
              ? pathname + "?" + searchParams.toString()
              : null
          }
          onKeepNavigation={() => {
            if (editorLock) window.history.pushState(null, "", editorLock.href);
          }}
          onLeaveNavigation={(target) => {
            setEditorLock(null);
            window.history.replaceState(null, "", target);
          }}
          onSaved={(result, editorState) => {
            setEditorLock(null);
            if (demo) {
              const recipe = demoRecipeFromState(
                editorState,
                result.id,
                result.slug,
                result.version,
                index.categories.find((c) => c.id === editorState.category_id)
                  ?.name ?? "",
              );
              setDemoRecords((records) => ({
                ...records,
                [result.slug]: {
                  ...recipe,
                  imagePreview: demoRecords[result.slug]?.imagePreview,
                },
              }));
              setState({
                data: {
                  ...index,
                  recipes: [
                    ...index.recipes.filter((r) => r.id !== result.id),
                    { ...recipe, category_id: editorState.category_id },
                  ],
                },
              });
            }
            setSaved(true);
            setDetail(null);
            setAttempt((a) => a + 1);
            window.history.pushState(
              null,
              "",
              hrefFor(result.slug) + (mode === "new" ? "&mode=edit" : ""),
            );
          }}
          onImageChanged={(id, version, metadata, preview) => {
            if (!demo) {
              setDetail(null);
              setAttempt((a) => a + 1);
            }
            if (demo && slug)
              setDemoRecords((records) => {
                const currentRecipe = records[slug] ?? existing;
                return currentRecipe
                  ? {
                      ...records,
                      [slug]: {
                        ...currentRecipe,
                        ...metadata,
                        version,
                        imagePreview: preview,
                      },
                    }
                  : records;
              });
          }}
          onSessionInvalid={onSessionInvalid}
        />
      </>
    );
  }
  if (slug) {
    const current = detail?.slug === slug ? detail : null;
    if (!current)
      return (
        <section aria-busy="true">
          <TableSkeleton />
        </section>
      );
    if (current.error)
      return (
        <section role="alert">
          <p>{current.error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setDetail(null);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        </section>
      );
    if (!current.data)
      return (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Recipe not found</h1>
          <p>It may have been removed.</p>
          <a
            className="inline-flex min-h-11 items-center underline"
            href={hrefFor(null)}
            onClick={(e) => navigate(e, null)}
          >
            Back to Bar Recipes
          </a>
        </section>
      );
    return (
      <div className="flex flex-col gap-4">
        {saved ? <p role="status">Recipe saved</p> : null}
        {isManagement && current.data.is_active !== false ? (
          <Button
            variant="outline"
            className="self-end"
            onClick={() => openEditor("edit")}
          >
            Edit Recipe
          </Button>
        ) : null}
        {isManagement ? (
          <>
            {current.data.is_active === false ? (
              <p role="status">Archived — hidden from staff</p>
            ) : null}
            <RecipeArchiveControl
              recipe={current.data}
              restaurantSlug={restaurantSlug}
              demo={demo}
              demoCategories={demoCategories}
              onSessionInvalid={onSessionInvalid}
              onChanged={archiveChanged}
              onReload={() => {
                setDetail(null);
                setAttempt((a) => a + 1);
              }}
            />
          </>
        ) : null}
        <RecipeDetailView
          restaurantSlug={demo ? undefined : restaurantSlug}
          key={slug}
          recipe={current.data}
          backHref={hrefFor(null)}
          onBack={(e) => navigate(e, null)}
        />
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-6 pb-24">
      <h1 className="text-2xl font-semibold">Bar Recipes</h1>
      {isManagement ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button className="self-start" onClick={() => openEditor("new")}>
            Add Recipe
          </Button>
          <RecipeCategoryDialog
            restaurantSlug={restaurantSlug}
            demo={demo}
            demoCategories={demoCategories}
            occupiedCategoryIds={state.data?.recipes
              .filter((r) => r.is_active !== false)
              .map((r) => r.category_id)}
            onSessionInvalid={onSessionInvalid}
            onChanged={categoriesChanged}
          />
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
      ) : null}
      {!state.data && !state.error ? (
        <TableSkeleton />
      ) : state.error ? (
        <div role="alert">
          <p>{state.error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setState({});
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : state.data && state.data.recipes.length === 0 ? (
        <p>No recipes have been added yet.</p>
      ) : state.data && browsing ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <label htmlFor="recipe-search" className="sr-only">
                Search recipes
              </label>
              <Input
                id="recipe-search"
                placeholder="Search recipes, spirits, numbers..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div
              role="group"
              aria-label="View mode"
              className="border-border bg-muted inline-flex shrink-0 rounded-lg border p-1"
            >
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition",
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("picture")}
                aria-pressed={viewMode === "picture"}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition",
                  viewMode === "picture"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Picture Book
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Filter recipes"
              className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 text-sm"
            >
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                aria-pressed={filterMode === "all"}
                className={cn(
                  "flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition",
                  filterMode === "all"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("popular")}
                aria-pressed={filterMode === "popular"}
                className={cn(
                  "flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition",
                  filterMode === "popular"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span aria-hidden="true">&#9733;</span> Popular
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("on_menu")}
                aria-pressed={filterMode === "on_menu"}
                className={cn(
                  "flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition",
                  filterMode === "on_menu"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                On menu
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("non_alcoholic")}
                aria-pressed={filterMode === "non_alcoholic"}
                className={cn(
                  "flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition",
                  filterMode === "non_alcoholic"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                Non-alcoholic
              </button>
            </div>

            <div
              role="group"
              aria-label="Sort order"
              className="border-border bg-muted/60 inline-flex shrink-0 items-center gap-1 rounded-lg border p-1 text-xs"
            >
              <button
                type="button"
                onClick={() => setSortMode("book")}
                aria-pressed={sortMode === "book"}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 font-medium transition",
                  sortMode === "book"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Book order
              </button>
              <button
                type="button"
                onClick={() => setSortMode("az")}
                aria-pressed={sortMode === "az"}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 font-medium transition",
                  sortMode === "az"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                A–Z
              </button>
            </div>
          </div>

          {viewMode === "picture" ? (
            <RecipePictureBook
              groups={browsing.groups}
              searchResults={browsing.searchResults}
              categories={state.data.categories}
              query={query}
              restaurantSlug={demo ? undefined : restaurantSlug}
              href={hrefFor}
              onNavigate={navigate}
              onClearSearch={() => setQuery("")}
              onClearFilter={() => setFilterMode("all")}
            />
          ) : browsing.searchResults !== null ? (
            <section>
              <h2 className="text-lg font-semibold">
                Results ({browsing.searchResults.length})
              </h2>
              {browsing.searchResults.length ? (
                <Rows
                  recipes={browsing.searchResults}
                  href={hrefFor}
                  open={navigate}
                />
              ) : (
                <div className="flex flex-col items-start gap-3 py-4">
                  <p>No recipes match {query}.</p>
                  <Button variant="outline" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                </div>
              )}
            </section>
          ) : browsing.groups.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="text-muted-foreground">
                No recipes match this filter.
              </p>
              <Button variant="outline" onClick={() => setFilterMode("all")}>
                Clear filters
              </Button>
            </div>
          ) : (
            browsing.groups.map((group) => (
              <section key={group.category.id}>
                <h2 className="text-lg font-semibold">
                  {group.category.name}{" "}
                  <span className="text-muted-foreground">
                    ({group.activeCount})
                  </span>
                </h2>
                <Rows recipes={group.recipes} href={hrefFor} open={navigate} />
              </section>
            ))
          )}
        </>
      ) : null}
    </section>
  );
}
