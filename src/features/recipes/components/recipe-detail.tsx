"use client";
import { useEffect, useRef, useState } from "react";
import { RecipeImage } from "./recipe-image";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";

function Panel({ variant }: { variant: DetailVariant }) {
  const label =
    variant.variant === "house" ? "House Recipe" : "Perfect Bartending Recipe";
  return (
    <article className="bg-card min-w-0 space-y-5 rounded-lg border p-5">
      <h2 className="text-xl font-semibold">{label}</h2>
      {variant.ingredients.length > 0 && (
        <section>
          <h3 className="font-semibold">Ingredients</h3>
          <ul className="mt-2 space-y-1">
            {variant.ingredients.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums">
                  {[i.amount, i.unit].filter(Boolean).join(" ")}
                </span>
                <span>
                  {i.ingredient_name}
                  {i.preparation && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {i.preparation}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {variant.method && (
        <section>
          <h3 className="font-semibold">Method</h3>
          <p>{variant.method}</p>
        </section>
      )}
      {variant.steps.length > 0 && (
        <section>
          <h3 className="font-semibold">Steps</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {variant.steps.map((s) => (
              <li key={s.id}>{s.instruction}</li>
            ))}
          </ol>
        </section>
      )}
      {(variant.rim_type || variant.rim_notes) && (
        <section>
          <h3 className="font-semibold">Rim</h3>
          <p>
            {[variant.rim_type, variant.rim_notes].filter(Boolean).join(" · ")}
          </p>
        </section>
      )}
      {(variant.glass || variant.glass_notes) && (
        <section>
          <h3 className="font-semibold">Glass</h3>
          <p>
            {[variant.glass, variant.glass_notes].filter(Boolean).join(" · ")}
          </p>
        </section>
      )}
      {(variant.garnishes.length > 0 || variant.presentation_notes) && (
        <section>
          <h3 className="font-semibold">Garnish</h3>
          <ul>
            {variant.garnishes.map((g) => (
              <li key={g.id}>
                {g.name}
                {g.notes && (
                  <span className="text-muted-foreground"> · {g.notes}</span>
                )}
              </li>
            ))}
          </ul>
          {variant.presentation_notes && <p>{variant.presentation_notes}</p>}
        </section>
      )}
      {variant.tips && (
        <section>
          <h3 className="font-semibold">
            {variant.variant === "house" ? "House Notes" : "Bartender Tips"}
          </h3>
          <p>{variant.tips}</p>
        </section>
      )}
      {variant.batch_notes && (
        <section>
          <h3 className="font-semibold">Batch</h3>
          <p>{variant.batch_notes}</p>
        </section>
      )}
    </article>
  );
}
export function RecipeDetailView({
  recipe,
  backHref,
  onBack,
  restaurantSlug,
}: {
  recipe: RecipeDetail;
  backHref: string;
  onBack: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  restaurantSlug?: string;
}) {
  const variants = [
    recipe.variants.find((v) => v.variant === "perfect"),
    recipe.variants.find((v) => v.variant === "house"),
  ].filter((v): v is DetailVariant => !!v);
  const [selected, setSelected] = useState(
    variants.some((v) => v.variant === "house") ? "house" : "perfect",
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="space-y-6 pb-24">
      <a
        href={backHref}
        onClick={onBack}
        className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ‹ Bar Recipes
      </a>
      <div>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
          <span className="mr-3 tabular-nums">
            {String(recipe.recipe_number).padStart(2, "0")}
          </span>
          {recipe.name}
        </h1>
        <p className="text-muted-foreground">
          {[recipe.base_spirit, recipe.description].filter(Boolean).join(" · ")}
        </p>
        <p>
          {[
            recipe.is_popular && "★ Popular",
            recipe.is_menu_item && "On menu",
            recipe.category,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <RecipeImage
        key={recipe.image_path ?? recipe.imagePreview ?? recipe.id}
        recipeId={recipe.id}
        name={recipe.name}
        restaurantSlug={restaurantSlug}
        hasImage={!!recipe.image_path}
        initial={recipe.imageUrls}
        preview={recipe.imagePreview}
      />
      {variants.length === 0 ? (
        <p>No recipe details are available yet.</p>
      ) : variants.length === 1 ? (
        <Panel variant={variants[0]} />
      ) : (
        <>
          <div className="md:hidden">
            <div
              role="tablist"
              aria-label="Recipe variants"
              className="flex gap-2"
            >
              {variants.map((v, index) => (
                <button
                  key={v.id}
                  id={`recipe-tab-${v.variant}`}
                  role="tab"
                  aria-selected={selected === v.variant}
                  aria-controls={`recipe-panel-${v.variant}`}
                  tabIndex={selected === v.variant ? 0 : -1}
                  className="aria-selected:bg-primary aria-selected:text-primary-foreground min-h-11 flex-1 rounded border px-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={() => setSelected(v.variant)}
                  onKeyDown={(e) => {
                    let next = index;
                    if (e.key === "ArrowRight")
                      next = (index + 1) % variants.length;
                    else if (e.key === "ArrowLeft")
                      next = (index + variants.length - 1) % variants.length;
                    else if (e.key === "Home") next = 0;
                    else if (e.key === "End") next = variants.length - 1;
                    else return;
                    e.preventDefault();
                    setSelected(variants[next].variant);
                    document
                      .getElementById(`recipe-tab-${variants[next].variant}`)
                      ?.focus();
                  }}
                >
                  {v.variant === "house" ? "House" : "Perfect"}
                </button>
              ))}
            </div>
            {variants.map((v) => (
              <div
                key={v.id}
                role="tabpanel"
                id={`recipe-panel-${v.variant}`}
                aria-labelledby={`recipe-tab-${v.variant}`}
                hidden={selected !== v.variant}
                className="mt-4"
              >
                <Panel variant={v} />
              </div>
            ))}
          </div>
          <div className="hidden gap-4 md:grid md:grid-cols-2">
            {variants.map((v) => (
              <Panel key={v.id} variant={v} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
