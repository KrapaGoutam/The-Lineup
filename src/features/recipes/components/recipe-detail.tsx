"use client";

import { useEffect, useRef, useState } from "react";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";
import { variantHasPersistedContent } from "../domain/variant-content";
import {
  deriveVariantDifferences,
  derivePresentation,
} from "../domain/recipe-differences";
import { deriveOzRatio, deriveQuickMeasure } from "../domain/recipe-glance";
import {
  countDifferences,
  emphasiseVerb,
  formatGarnishes,
  formatGlass,
  formatRim,
  isLongRecipe,
  splitQuantity,
  type UnitSystem,
} from "../domain/recipe-book-presentation";
import {
  BartenderNote,
  RecipeBookHeader,
  RecipeBookPage,
  RecipeBookSpine,
} from "./recipe-book-components";
import { cn } from "@/lib/utils";

export function RecipeDetailView({
  recipe,
  backHref,
  onBack,
  restaurantSlug,
  canEdit,
  onEdit,
  actions,
}: {
  recipe: RecipeDetail;
  backHref: string;
  onBack: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  restaurantSlug?: string;
  canEdit?: boolean;
  onEdit?: () => void;
  actions?: React.ReactNode;
}) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("oz");

  const perfect = recipe.variants.find(
    (v) => v.variant === "perfect" && variantHasPersistedContent(v),
  );
  const house = recipe.variants.find(
    (v) => v.variant === "house" && variantHasPersistedContent(v),
  );
  const variants = [perfect, house].filter((v): v is DetailVariant => !!v);
  const dual = variants.length === 2;

  const differences = deriveVariantDifferences(perfect, house);
  const presentation = derivePresentation(variants);
  const diffSummary = countDifferences(
    perfect,
    house,
    differences,
    presentation,
  );

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (variants.length === 0) {
    return (
      <main className="book p-8 text-center" aria-labelledby="recipe-title">
        <h1
          ref={headingRef}
          id="recipe-title"
          tabIndex={-1}
          className="font-serif text-3xl"
        >
          {recipe.name}
        </h1>
        <p className="text-muted-foreground mt-4">
          No recipe details are available yet.
        </p>
        <div className="mt-6">
          <a href={backHref} onClick={onBack} className="underline">
            &larr; Back to Bar Recipes
          </a>
        </div>
      </main>
    );
  }

  const isLong = isLongRecipe(variants);

  // Tip handling: if both variants share identical tip text, show once in spine
  const pTip = perfect?.tips?.trim();
  const hTip = house?.tips?.trim();
  const sharedTip =
    dual && pTip && hTip && pTip.toLowerCase() === hTip.toLowerCase()
      ? pTip
      : null;

  // Glass and rim sharing logic
  const glassDiffer =
    presentation.differing.has("glass") ||
    (perfect?.glass?.trim().toLowerCase() ?? "") !==
      (house?.glass?.trim().toLowerCase() ?? "") ||
    (perfect?.glass_notes?.trim().toLowerCase() ?? "") !==
      (house?.glass_notes?.trim().toLowerCase() ?? "");

  const rimDiffer =
    presentation.differing.has("rim") ||
    (perfect?.rim_type?.trim().toLowerCase() ?? "") !==
      (house?.rim_type?.trim().toLowerCase() ?? "") ||
    (perfect?.rim_notes?.trim().toLowerCase() ?? "") !==
      (house?.rim_notes?.trim().toLowerCase() ?? "");

  const showAllFourMeta = dual && (glassDiffer || rimDiffer);
  const showSpineCaption = !dual || !showAllFourMeta;

  const spineGlass = formatGlass(variants[0].glass, variants[0].glass_notes);
  const spineRim = formatRim(variants[0].rim_type, variants[0].rim_notes);

  // Single variant view
  if (!dual) {
    const single = variants[0];
    const isHouse = single.variant === "house";
    const label = isHouse ? "House" : "Perfect";
    const subLabel = isHouse ? "The Monk's Build" : "Reference Build";
    const markerType = isHouse ? "filled" : "hollow";
    const singleGlass = formatGlass(single.glass, single.glass_notes);
    const singleRim = formatRim(single.rim_type, single.rim_notes);
    const singleGarnish = formatGarnishes(single.garnishes);
    const quickMeasures = deriveQuickMeasure(single.ingredients).filter(
      (qm) => qm.measure,
    );
    const ozRatio = deriveOzRatio(single.ingredients);
    const singleTip = single.tips?.trim();
    const batchNotes = single.batch_notes?.trim();
    const presentationNotes = single.presentation_notes?.trim();

    return (
      <main
        className={cn("book", isLong && "book--long", "book--single")}
        aria-labelledby="recipe-title"
      >
        <RecipeBookHeader
          recipeNumber={recipe.recipe_number}
          name={recipe.name}
          category={recipe.category}
          backHref={backHref}
          onBack={onBack}
          headingRef={headingRef}
          canEdit={canEdit}
          onEdit={onEdit}
          actions={actions}
        />

        <div
          className="book-spread book-spread--single"
          data-testid="recipe-single"
        >
          <article
            id={`recipe-variant-${single.variant}`}
            aria-labelledby={`recipe-variant-${single.variant}-heading`}
            className="book-page"
          >
            <header className="book-page__head">
              <div className="book-page__titleline">
                <span
                  className={cn(
                    "book-marker",
                    markerType === "hollow"
                      ? "book-marker--hollow"
                      : "book-marker--filled",
                  )}
                  aria-hidden="true"
                />
                <h2
                  className="book-page__title"
                  id={`recipe-variant-${single.variant}-heading`}
                  tabIndex={-1}
                >
                  {label}
                </h2>
              </div>
              <p className="book-page__sub">
                <span>{subLabel}</span>
              </p>
            </header>

            <div className="book-page__cols">
              {/* Left Column: Ingredients + Meta */}
              <div className="space-y-4">
                <section aria-labelledby="single-ing">
                  <div className="book-sec">
                    <h3 id="single-ing">Ingredients</h3>
                    <div
                      className="book-units"
                      role="group"
                      aria-label="Measurement units"
                    >
                      <button
                        type="button"
                        aria-pressed={unitSystem === "oz"}
                        onClick={() => setUnitSystem("oz")}
                      >
                        oz
                      </button>
                      <button
                        type="button"
                        aria-pressed={unitSystem === "ml"}
                        onClick={() => setUnitSystem("ml")}
                      >
                        ml
                      </button>
                    </div>
                  </div>
                  <ul className="book-ingredients">
                    {single.ingredients.map((i) => {
                      const qty = splitQuantity(i.amount, i.unit, unitSystem);
                      return (
                        <li key={i.id} className="book-ing">
                          <span className="book-ing__name">
                            {i.ingredient_name}
                            {i.preparation ? (
                              <span className="book-ing__prep">
                                {" "}
                                · {i.preparation}
                              </span>
                            ) : null}
                          </span>
                          <span className="book-qty">
                            <span className="book-qty__w">{qty.w}</span>
                            <span className="book-qty__f">{qty.f}</span>
                            {qty.u ? (
                              <span className="book-qty__u">{qty.u}</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <dl className="book-meta" aria-label={`${label} build details`}>
                  <div>
                    <dt>Method</dt>
                    <dd>{single.method || "—"}</dd>
                  </div>
                  <div>
                    <dt>Glass</dt>
                    <dd>{singleGlass || "—"}</dd>
                  </div>
                  <div>
                    <dt>Rim</dt>
                    <dd>{singleRim}</dd>
                  </div>
                  <div>
                    <dt>Garnish</dt>
                    <dd>{singleGarnish || "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* Right Column: Preparation + Notes */}
              <div className="space-y-4">
                <section aria-labelledby="single-prep">
                  <div className="book-sec">
                    <h3 id="single-prep">Preparation</h3>
                  </div>
                  <ol className="book-steps">
                    {single.steps.map((s) => {
                      const { pre, verb, post } = emphasiseVerb(s.instruction);
                      return (
                        <li key={s.id} className="book-step">
                          <span>
                            {pre}
                            {verb ? <b>{verb}</b> : null}
                            {post}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                {singleTip ? (
                  <BartenderNote
                    id={`recipe-variant-${single.variant}-note`}
                    note={singleTip}
                  />
                ) : null}

                {(batchNotes ||
                  presentationNotes ||
                  quickMeasures.length > 0 ||
                  ozRatio) && (
                  <details className="book-disclosure">
                    <summary>Details &amp; Notes</summary>
                    <div className="space-y-2 pt-1 pb-1">
                      {quickMeasures.length > 0 && (
                        <section
                          aria-label="Quick measure"
                          className="space-y-1"
                        >
                          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                            Quick Measure
                          </p>
                          <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs tabular-nums">
                            {quickMeasures.map((qm, index) => (
                              <span key={qm.id}>
                                {index > 0 && (
                                  <span className="text-muted-foreground mr-1">
                                    ·
                                  </span>
                                )}
                                {qm.measure}{" "}
                                <span className="text-muted-foreground text-[11px]">
                                  {qm.name}
                                </span>
                              </span>
                            ))}
                            {ozRatio && (
                              <span
                                data-testid="oz-ratio"
                                className="text-muted-foreground ml-2 font-mono text-xs"
                              >
                                Oz Ratio {ozRatio.ratio}
                              </span>
                            )}
                          </div>
                        </section>
                      )}
                      {batchNotes && (
                        <div>
                          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                            Batch Notes
                          </p>
                          <p className="font-serif text-xs whitespace-pre-wrap italic">
                            {batchNotes}
                          </p>
                        </div>
                      )}
                      {presentationNotes && (
                        <div>
                          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                            Presentation Notes
                          </p>
                          <p className="font-serif text-xs whitespace-pre-wrap italic">
                            {presentationNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </article>

          <RecipeBookSpine
            recipe={recipe}
            restaurantSlug={restaurantSlug}
            glass={singleGlass}
            rim={singleRim}
            showCaption={true}
          />
        </div>
      </main>
    );
  }

  // Dual variant view (Perfect + House)
  if (!perfect || !house) return null;

  const perfectGlass = formatGlass(perfect.glass, perfect.glass_notes);
  const perfectRim = formatRim(perfect.rim_type, perfect.rim_notes);
  const perfectGarnish = formatGarnishes(perfect.garnishes);
  const perfectQuickMeasures = deriveQuickMeasure(perfect.ingredients).filter(
    (qm) => qm.measure,
  );
  const perfectOzRatio = deriveOzRatio(perfect.ingredients);

  const houseGlass = formatGlass(house.glass, house.glass_notes);
  const houseRim = formatRim(house.rim_type, house.rim_notes);
  const houseGarnish = formatGarnishes(house.garnishes);
  const houseQuickMeasures = deriveQuickMeasure(house.ingredients).filter(
    (qm) => qm.measure,
  );
  const houseOzRatio = deriveOzRatio(house.ingredients);

  return (
    <main
      className={cn("book", isLong && "book--long")}
      aria-labelledby="recipe-title"
    >
      <RecipeBookHeader
        recipeNumber={recipe.recipe_number}
        name={recipe.name}
        category={recipe.category}
        backHref={backHref}
        onBack={onBack}
        headingRef={headingRef}
        canEdit={canEdit}
        onEdit={onEdit}
        actions={actions}
      />

      <div className="book-spread" data-testid="recipe-spread">
        {/* Left Page: Perfect */}
        <RecipeBookPage
          variant={perfect}
          label="Perfect"
          subLabel="Reference Build"
          markerType="hollow"
          unitSystem={unitSystem}
          onUnitToggle={setUnitSystem}
          showUnitsToggle={true}
          showAllFourMeta={showAllFourMeta}
          glassText={perfectGlass}
          rimText={perfectRim}
          garnishText={perfectGarnish}
          batchNotes={perfect.batch_notes}
          presentationNotes={perfect.presentation_notes}
          quickMeasures={perfectQuickMeasures}
          ozRatio={perfectOzRatio}
          note={sharedTip ? null : pTip}
        />

        {/* Center Spine: Image and shared Glass / Rim */}
        <RecipeBookSpine
          recipe={recipe}
          restaurantSlug={restaurantSlug}
          glass={spineGlass}
          rim={spineRim}
          sharedNote={sharedTip}
          showCaption={showSpineCaption}
        />

        {/* Right Page: House */}
        <RecipeBookPage
          variant={house}
          label="House"
          subLabel="The Monk's Build"
          markerType="filled"
          diffSummary={diffSummary}
          unitSystem={unitSystem}
          showUnitsToggle={false}
          showAllFourMeta={showAllFourMeta}
          glassText={houseGlass}
          rimText={houseRim}
          garnishText={houseGarnish}
          batchNotes={house.batch_notes}
          presentationNotes={house.presentation_notes}
          quickMeasures={houseQuickMeasures}
          ozRatio={houseOzRatio}
          note={sharedTip ? null : hTip}
        />
      </div>
    </main>
  );
}
