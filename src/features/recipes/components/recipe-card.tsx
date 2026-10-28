"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import type { Recipe } from "../domain/recipe-index";
import { RecipeImage } from "./recipe-image";

export function RecipeCard({
  recipe,
  categoryName,
  restaurantSlug,
  href,
  onNavigate,
}: {
  recipe: Recipe;
  categoryName?: string;
  restaurantSlug?: string;
  href: (slug: string) => string;
  onNavigate: (
    event: React.MouseEvent<HTMLAnchorElement>,
    slug: string,
  ) => void;
}) {
  const isArchived = recipe.is_active === false;

  return (
    <li className={cn("list-none", isArchived && "opacity-60")}>
      <a
        href={href(recipe.slug)}
        onClick={(event) => onNavigate(event, recipe.slug)}
        data-recipe-card={recipe.slug}
        data-recipe-link={recipe.slug}
        className="group border-border bg-card text-card-foreground hover:border-foreground/30 relative flex flex-col gap-2 rounded-xl border p-2 shadow-xs transition focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="relative w-full">
          <RecipeImage
            recipeId={recipe.id}
            name={recipe.name}
            restaurantSlug={restaurantSlug}
            hasImage={!!recipe.image_thumb_path}
            thumbnail={true}
          />
          {recipe.is_popular ? (
            <span
              className="bg-background/85 text-foreground absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-xs font-semibold shadow-xs backdrop-blur-xs"
              aria-label="Popular"
            >
              <span aria-hidden="true">&#9733;</span>
              <span className="sr-only">Popular</span>
            </span>
          ) : null}
          {isArchived ? (
            <span className="border-border bg-background/85 text-muted-foreground absolute top-2 left-2 rounded-md border px-1.5 py-0.5 text-xs font-medium shadow-xs backdrop-blur-xs">
              Archived
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {categoryName ? (
            <span className="text-muted-foreground truncate text-xs font-medium">
              {categoryName}
            </span>
          ) : null}
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
              {String(recipe.recipe_number).padStart(2, "0")}
            </span>
            <span className="line-clamp-2 text-sm leading-snug font-medium">
              {recipe.name}
            </span>
          </div>
        </div>
      </a>
    </li>
  );
}
