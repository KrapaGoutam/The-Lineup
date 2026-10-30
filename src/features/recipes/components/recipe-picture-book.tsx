"use client";

import type React from "react";
import type { Category, Recipe } from "../domain/recipe-index";
import type { RecipeCategoryGroup } from "../domain/recipe-filters";
import { RecipeCard } from "./recipe-card";
import { Button } from "@/components/ui/button";

export function RecipePictureBook({
  groups,
  searchResults,
  categories,
  query,
  restaurantSlug,
  href,
  onNavigate,
  onClearSearch,
  onClearFilter,
}: {
  groups: RecipeCategoryGroup[];
  searchResults: Recipe[] | null;
  categories: Category[];
  query: string;
  restaurantSlug?: string;
  href: (slug: string) => string;
  onNavigate: (
    event: React.MouseEvent<HTMLAnchorElement>,
    slug: string,
  ) => void;
  onClearSearch: () => void;
  onClearFilter?: () => void;
}) {
  const categoryMap = new Map<string, string>(
    categories.map((c) => [c.id, c.name]),
  );

  // Search Results mode: Flat Results grid
  if (searchResults !== null) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">
          Results ({searchResults.length})
        </h2>
        {searchResults.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {searchResults.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                categoryName={categoryMap.get(recipe.category_id)}
                restaurantSlug={restaurantSlug}
                href={href}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="text-muted-foreground">
              No recipes match &ldquo;{query}&rdquo;.
            </p>
            <Button variant="outline" onClick={onClearSearch}>
              Clear search
            </Button>
          </div>
        )}
      </section>
    );
  }

  // Filter matched 0 recipes across all categories
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-muted-foreground">No recipes match this filter.</p>
        {onClearFilter ? (
          <Button variant="outline" onClick={onClearFilter}>
            Clear filters
          </Button>
        ) : null}
      </div>
    );
  }

  // Normal category-grouped Picture Book
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.category.id} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {group.category.name}{" "}
            <span className="text-muted-foreground font-normal">
              ({group.activeCount})
            </span>
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {group.recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                restaurantSlug={restaurantSlug}
                href={href}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
