"use client";
import { useEffect, useRef } from "react";
import { FinalPresentation } from "./recipe-detail-presentation";
import { VariantArticle } from "./recipe-detail-variant";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";
import { deriveGlanceFields, deriveQuickGlance } from "../domain/recipe-glance";
import {
  deriveVariantDifferences,
  derivePresentation,
} from "../domain/recipe-differences";

const EYEBROW =
  "text-muted-foreground text-[0.7rem] font-semibold tracking-[0.14em] uppercase";

/** Smooth scroll to a variant heading and move focus there (reduced-motion aware). */
function jumpTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
  target.focus({ preventScroll: true });
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
  const perfect = recipe.variants.find((v) => v.variant === "perfect");
  const house = recipe.variants.find((v) => v.variant === "house");
  const variants = [perfect, house].filter((v): v is DetailVariant => !!v);
  const dual = variants.length === 2;
  const differences = deriveVariantDifferences(perfect, house);
  const presentation = derivePresentation(variants);

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const glanceFields = deriveGlanceFields(deriveQuickGlance(recipe));
  const meta = [
    recipe.base_spirit,
    recipe.category,
    recipe.is_popular && "Popular",
    recipe.is_menu_item && "On menu",
  ].filter(Boolean);

  return (
    <section className="space-y-8 pb-24">
      <a
        href={backHref}
        onClick={onBack}
        className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ‹ Bar Recipes
      </a>

      <header className="space-y-3 text-center">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-serif text-4xl leading-tight outline-none sm:text-5xl lg:text-6xl"
        >
          <span className="text-muted-foreground block font-sans text-sm font-semibold tracking-[0.14em] tabular-nums">
            {String(recipe.recipe_number).padStart(2, "0")}
          </span>
          {recipe.name}
        </h1>
        {meta.length > 0 && <p className={EYEBROW}>{meta.join(" · ")}</p>}
        {recipe.description && (
          <p className="text-muted-foreground mx-auto max-w-prose font-serif text-lg italic">
            {recipe.description}
          </p>
        )}
      </header>

      {glanceFields.length > 0 && (
        <section aria-label="Quick glance" className="mx-auto max-w-4xl">
          <h2 className="sr-only">Quick Glance</h2>
          <div className="border-border grid grid-cols-2 border-y md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
            {glanceFields.map((field) => (
              <div
                key={field.key}
                className="border-border min-w-0 border-b px-3 py-3 text-center md:border-b-0 md:not-first:border-l [&:nth-last-child(-n+2)]:border-b-0"
              >
                <div className={EYEBROW}>{field.label}</div>
                {field.shared ? (
                  <div className="font-serif text-lg">
                    {field.values[0].text}
                  </div>
                ) : (
                  field.values.map((v) => (
                    <div key={v.variant} className="font-serif text-lg">
                      <span className="text-muted-foreground font-sans text-xs">
                        {v.label}:{" "}
                      </span>
                      {v.text ?? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Not specified</span>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {dual && (
        <nav
          aria-label="Jump to recipe"
          className="flex justify-center gap-3 lg:hidden"
        >
          {variants.map((v) => (
            <a
              key={v.id}
              href={`#recipe-variant-${v.variant}-heading`}
              onClick={(e) => jumpTo(e, `recipe-variant-${v.variant}-heading`)}
              className="border-border hover:bg-accent inline-flex min-h-11 items-center rounded-full border px-5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {v.variant === "house" ? "House" : "Perfect"}{" "}
              <span aria-hidden="true">↓</span>
            </a>
          ))}
        </nav>
      )}

      {variants.length === 0 ? (
        <p>No recipe details are available yet.</p>
      ) : (
        <div
          data-testid={dual ? "recipe-spread" : "recipe-single"}
          className={
            dual
              ? "bg-card rounded-lg border p-6 sm:p-8 lg:grid lg:grid-cols-2 lg:grid-rows-[repeat(6,auto)] lg:p-10"
              : "mx-auto w-full max-w-3xl"
          }
        >
          {variants.map((v, index) => (
            <VariantArticle
              key={v.id}
              variant={v}
              differences={
                differences[v.variant === "house" ? "house" : "perfect"]
              }
              aligned={dual}
              className={
                !dual
                  ? ""
                  : index === 0
                    ? "lg:pr-10"
                    : "border-border max-lg:mt-10 max-lg:border-t max-lg:pt-10 lg:border-l lg:pl-10"
              }
            />
          ))}
        </div>
      )}

      <FinalPresentation
        recipe={recipe}
        presentation={presentation}
        restaurantSlug={restaurantSlug}
      />
    </section>
  );
}
