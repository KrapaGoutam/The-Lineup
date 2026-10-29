"use client";
import { useEffect, useRef, useState } from "react";
import { RecipeImage } from "./recipe-image";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";
import {
  deriveOzRatio,
  deriveQuickGlance,
  deriveQuickMeasure,
} from "../domain/recipe-glance";

function Panel({ variant }: { variant: DetailVariant }) {
  const label =
    variant.variant === "house" ? "House Recipe" : "Perfect Bartending Recipe";
  const quickMeasures = deriveQuickMeasure(variant.ingredients);
  const ratio = deriveOzRatio(variant.ingredients);

  return (
    <article className="bg-card min-w-0 space-y-5 rounded-lg border p-5">
      <h2 className="text-xl font-semibold">{label}</h2>

      {quickMeasures.length > 0 && (
        <section
          aria-label="Quick measure"
          className="bg-muted/40 rounded-md border p-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Quick Measure
            </h3>
            {ratio && (
              <span
                data-testid="oz-ratio"
                className="bg-background border-border rounded border px-2 py-0.5 font-mono text-xs font-medium"
              >
                Oz Ratio {ratio.ratio}
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-1 font-mono text-sm">
            {quickMeasures.map((qm) => (
              <li key={qm.id} className="flex gap-2">
                <span className="w-24 shrink-0 font-semibold tabular-nums">
                  {qm.measure}
                </span>
                <span>{qm.name}</span>
              </li>
            ))}
          </ul>
          {ratio && ratio.excludedSummary && (
            <p className="border-border/40 text-muted-foreground mt-2 border-t pt-1.5 font-sans text-xs">
              {ratio.excludedSummary}
            </p>
          )}
        </section>
      )}

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

      {variant.tips && variant.tips.trim().length > 0 && (
        <section>
          <h3 className="font-semibold">Bartender Tips</h3>
          <p className="whitespace-pre-wrap">{variant.tips.trim()}</p>
        </section>
      )}

      {variant.batch_notes && variant.batch_notes.trim().length > 0 && (
        <section>
          <h3 className="font-semibold">Batch</h3>
          <p className="whitespace-pre-wrap">{variant.batch_notes.trim()}</p>
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

  const glance = deriveQuickGlance(recipe);
  const hasGlanceContent =
    glance.variants.some((v) => v.summaryText) || Boolean(glance.commonGlass);

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

      {hasGlanceContent && (
        <section
          aria-label="Quick glance"
          className="bg-card min-w-0 space-y-3 rounded-lg border p-4 shadow-xs"
        >
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Quick Glance
          </h2>
          <div className="space-y-2">
            {glance.variants
              .filter((v) => v.summaryText)
              .map((v) => (
                <div key={v.variant} className="text-sm leading-relaxed">
                  <span className="font-semibold">{v.label}: </span>
                  <span className="text-foreground">{v.summaryText}</span>
                </div>
              ))}
          </div>
          {glance.commonGlass ? (
            <div className="border-border/60 text-muted-foreground border-t pt-2 text-sm">
              <span className="text-foreground font-medium">Glass: </span>
              {glance.commonGlass}
            </div>
          ) : (
            glance.variants.some((v) => v.glass) && (
              <div className="border-border/60 text-muted-foreground space-y-1 border-t pt-2 text-sm">
                {glance.variants
                  .filter((v) => v.glass)
                  .map((v) => (
                    <div key={v.variant}>
                      <span className="text-foreground font-medium">
                        {v.label} Glass:{" "}
                      </span>
                      {v.glass}
                    </div>
                  ))}
              </div>
            )
          )}
        </section>
      )}

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

      <div className="mx-auto w-full max-w-3xl pt-2">
        <RecipeImage
          key={recipe.image_path ?? recipe.imagePreview ?? recipe.id}
          recipeId={recipe.id}
          name={recipe.name}
          restaurantSlug={restaurantSlug}
          hasImage={!!recipe.image_path}
          initial={recipe.imageUrls}
          preview={recipe.imagePreview}
        />
      </div>
    </section>
  );
}
