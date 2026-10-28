"use client";
import { useEffect, useRef, useState } from "react";
import { TableSkeleton } from "@/features/bar-inventory/components/table-kit/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getRecipeIndexAction } from "../actions/recipe-actions";
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
function Rows({ recipes }: { recipes: Recipe[] }) {
  return (
    <ul className="grid gap-1 lg:grid-cols-2">
      {recipes.map((r) => (
        <li
          key={r.id}
          className="flex min-h-12 items-center gap-4 border-b px-2"
        >
          <span className="text-muted-foreground w-10 shrink-0 tabular-nums">
            {String(r.recipe_number).padStart(2, "0")}
          </span>
          <span>{r.name}</span>
          {r.is_popular ? <span aria-label="Popular">&#9733;</span> : null}
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
    if (demo) return;
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
  }, [restaurantSlug, demo, attempt]);
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
                <Rows recipes={results} />
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
                <Rows recipes={group.recipes} />
              </section>
            ))
          )}
        </>
      ) : null}
    </section>
  );
}
