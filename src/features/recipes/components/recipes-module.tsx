"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RecipeDetailView } from "./recipe-detail";
import type { RecipeDetail, DetailVariant } from "../domain/recipe-detail";
import { TableSkeleton } from "@/features/bar-inventory/components/table-kit/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getRecipeDetailAction,
  getRecipeIndexAction,
} from "../actions/recipe-actions";
import {
  groups,
  search,
  type Recipe,
  type RecipeIndex,
} from "../domain/recipe-index";

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
        <li key={r.id}>
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
}: {
  restaurantSlug: string;
  demo: boolean;
  onSessionInvalid: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const slug = searchParams.get("recipe")?.trim() || null;
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
      const recipe = demoIndex.recipes.find((r) => r.slug === slug);
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
      const data: RecipeDetail | null = recipe
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
        : null;
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
  }, [slug, restaurantSlug, demo, attempt]);
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
      <RecipeDetailView
        key={slug}
        recipe={current.data}
        backHref={hrefFor(null)}
        onBack={(e) => navigate(e, null)}
      />
    );
  }
  const results = state.data && query.trim() ? search(state.data, query) : null;
  return (
    <section className="flex flex-col gap-6 pb-24">
      <h1 className="text-2xl font-semibold">Bar Recipes</h1>
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
      ) : state.data ? (
        <>
          <div>
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
          {results ? (
            <section>
              <h2 className="text-lg font-semibold">
                Results ({results.length})
              </h2>
              {results.length ? (
                <Rows recipes={results} href={hrefFor} open={navigate} />
              ) : (
                <div>
                  <p>No recipes match {query}.</p>
                  <Button variant="outline" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                </div>
              )}
            </section>
          ) : (
            groups(state.data).map((group) => (
              <section key={group.category.id}>
                <h2 className="text-lg font-semibold">
                  {group.category.name}{" "}
                  <span className="text-muted-foreground">
                    ({group.recipes.length})
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
