"use client";

import { useState } from "react";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";
import type {
  DifferencesSummary,
  UnitSystem,
} from "../domain/recipe-book-presentation";
import {
  emphasiseVerb,
  splitQuantity,
} from "../domain/recipe-book-presentation";
import type { OzRatio, QuickMeasureItem } from "../domain/recipe-glance";
import { RecipeImage } from "./recipe-image";
import { cn } from "@/lib/utils";

export function BartenderNote({
  note,
  id,
  className,
}: {
  note: string;
  id?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside
      id={id}
      aria-labelledby={id ? `${id}-label` : undefined}
      className={cn("book-note", isOpen && "is-open", className)}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      onClick={() => setIsOpen((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }}
    >
      <p className="book-note__label" id={id ? `${id}-label` : undefined}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
        <span className="max-sm:hidden">BARTENDER NOTE</span>
        <span className="sm:hidden">{isOpen ? "NOTE −" : "NOTE +"}</span>
      </p>
      <p className="whitespace-pre-wrap">{note}</p>
    </aside>
  );
}

export function RecipeBookHeader({
  recipeNumber,
  name,
  category,
  backHref,
  onBack,
  headingRef,
  canEdit,
  onEdit,
  actions,
}: {
  recipeNumber: number;
  name: string;
  category?: string | null;
  backHref: string;
  onBack: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  canEdit?: boolean;
  onEdit?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <header className="book-head">
      <a
        className="book-back"
        href={backHref}
        onClick={onBack}
        rel="up"
        aria-label="‹ Bar Recipes — Back to Bar Recipes"
      >
        &larr; Recipes
      </a>

      <div className="book-titleblock">
        <p className="book-no">
          No. <b>{String(recipeNumber).padStart(2, "0")}</b>
        </p>
        <h1
          ref={headingRef}
          className="book-title"
          id="recipe-title"
          tabIndex={-1}
          aria-label={`${recipeNumber} ${name}`}
        >
          {name}
        </h1>
        {category ? <p className="book-chapter">{category}</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        {actions}
        {canEdit && onEdit ? (
          <button
            type="button"
            className="book-edit"
            onClick={onEdit}
            aria-label="Edit Recipe"
          >
            Edit
          </button>
        ) : (
          <span
            className="book-edit pointer-events-none opacity-0"
            aria-hidden="true"
          >
            Edit
          </span>
        )}
      </div>
    </header>
  );
}

export function RecipeBookPage({
  variant,
  label,
  subLabel,
  markerType,
  diffSummary,
  unitSystem,
  onUnitToggle,
  showUnitsToggle,
  showAllFourMeta,
  glassText,
  rimText,
  garnishText,
  batchNotes,
  presentationNotes,
  quickMeasures,
  ozRatio,
  note,
}: {
  variant: DetailVariant;
  label: "Perfect" | "House";
  subLabel: string;
  markerType: "hollow" | "filled";
  diffSummary?: DifferencesSummary;
  unitSystem: UnitSystem;
  onUnitToggle?: (system: UnitSystem) => void;
  showUnitsToggle?: boolean;
  showAllFourMeta?: boolean;
  glassText?: string;
  rimText?: string;
  garnishText?: string;
  batchNotes?: string | null;
  presentationNotes?: string | null;
  quickMeasures?: QuickMeasureItem[];
  ozRatio?: OzRatio | null;
  note?: string | null;
}) {
  const isHouse = variant.variant === "house";
  const headingId = `recipe-variant-${variant.variant}-heading`;
  const secIngId = `${variant.variant}-ing`;
  const secPrepId = `${variant.variant}-prep`;

  const hasSecondaryNotes =
    Boolean(batchNotes?.trim()) ||
    Boolean(presentationNotes?.trim()) ||
    Boolean(quickMeasures && quickMeasures.length > 0) ||
    Boolean(ozRatio);

  return (
    <article
      id={`recipe-variant-${variant.variant}`}
      aria-labelledby={headingId}
      className={cn(
        "book-page",
        isHouse ? "book-page--house" : "book-page--perfect",
      )}
    >
      {/* 1. Header */}
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
          <h2 className="book-page__title" id={headingId} tabIndex={-1}>
            {label}
          </h2>
        </div>
        <p className="book-page__sub">
          <span>{subLabel}</span>
          {isHouse && diffSummary && diffSummary.count > 0 ? (
            <span className="book-diff" tabIndex={0} title={diffSummary.title}>
              <span aria-hidden="true">{diffSummary.label}</span>
              <span className="sr-only"> ({diffSummary.title})</span>
            </span>
          ) : null}
        </p>
      </header>

      {/* 2. Ingredients */}
      <section aria-labelledby={secIngId}>
        <div className="book-sec">
          <h3 id={secIngId}>Ingredients</h3>
          {showUnitsToggle && onUnitToggle ? (
            <div
              className="book-units"
              role="group"
              aria-label="Measurement units"
            >
              <button
                type="button"
                aria-pressed={unitSystem === "oz"}
                onClick={() => onUnitToggle("oz")}
              >
                oz
              </button>
              <button
                type="button"
                aria-pressed={unitSystem === "ml"}
                onClick={() => onUnitToggle("ml")}
              >
                ml
              </button>
            </div>
          ) : null}
        </div>
        <ul className="book-ingredients">
          {variant.ingredients.map((i) => {
            const qty = splitQuantity(i.amount, i.unit, unitSystem);
            return (
              <li key={i.id} className="book-ing">
                <span className="book-ing__name">
                  {i.ingredient_name}
                  {i.preparation ? (
                    <span className="book-ing__prep"> · {i.preparation}</span>
                  ) : null}
                </span>
                <span className="book-qty">
                  <span className="book-qty__w">{qty.w}</span>
                  <span className="book-qty__f">{qty.f}</span>
                  {qty.u ? <span className="book-qty__u">{qty.u}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3. Metadata */}
      <dl className="book-meta" aria-label={`${label} build details`}>
        <div>
          <dt>Method</dt>
          <dd>{variant.method || "—"}</dd>
        </div>
        {showAllFourMeta ? (
          <>
            <div>
              <dt>Glass</dt>
              <dd>{glassText || "—"}</dd>
            </div>
            <div>
              <dt>Rim</dt>
              <dd>{rimText || "No rim"}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Garnish</dt>
          <dd>{garnishText || "—"}</dd>
        </div>
      </dl>

      {/* 4. Preparation */}
      <section aria-labelledby={secPrepId}>
        <div className="book-sec">
          <h3 id={secPrepId}>Preparation</h3>
        </div>
        <ol className="book-steps">
          {variant.steps.map((s) => {
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

      {/* 5. Bartender Note (rendered only when persisted content exists) */}
      {note?.trim() ? (
        <BartenderNote
          id={`recipe-variant-${variant.variant}-note`}
          note={note.trim()}
        />
      ) : null}

      {/* 6. Secondary features: Batch notes, presentation notes, quick measure */}
      {hasSecondaryNotes ? (
        <details className="book-disclosure">
          <summary>Details &amp; Notes</summary>
          <div className="space-y-2 pt-1 pb-1">
            {quickMeasures && quickMeasures.length > 0 ? (
              <section aria-label="Quick measure" className="space-y-1">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  Quick Measure
                </p>
                <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs tabular-nums">
                  {quickMeasures.map((qm, index) => (
                    <span key={qm.id}>
                      {index > 0 && (
                        <span className="text-muted-foreground mr-1">·</span>
                      )}
                      {qm.measure}{" "}
                      <span className="text-muted-foreground text-[11px]">
                        {qm.name}
                      </span>
                    </span>
                  ))}
                  {ozRatio ? (
                    <span
                      data-testid="oz-ratio"
                      className="text-muted-foreground ml-2 font-mono text-xs"
                    >
                      Oz Ratio {ozRatio.ratio}
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}

            {batchNotes?.trim() ? (
              <div>
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  Batch Notes
                </p>
                <p className="font-serif text-xs whitespace-pre-wrap italic">
                  {batchNotes.trim()}
                </p>
              </div>
            ) : null}

            {presentationNotes?.trim() ? (
              <div>
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  Presentation Notes
                </p>
                <p className="font-serif text-xs whitespace-pre-wrap italic">
                  {presentationNotes.trim()}
                </p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function RecipeBookSpine({
  recipe,
  restaurantSlug,
  glass,
  rim,
  sharedNote,
  showCaption = true,
}: {
  recipe: RecipeDetail;
  restaurantSlug?: string;
  glass?: string;
  rim?: string;
  sharedNote?: string | null;
  showCaption?: boolean;
}) {
  return (
    <figure className="book-spine">
      <div className="book-mat">
        <div
          className="book-photo"
          role="img"
          aria-label={`${recipe.name}, finished drink`}
        >
          <RecipeImage
            key={recipe.image_path ?? recipe.imagePreview ?? recipe.id}
            recipeId={recipe.id}
            name={recipe.name}
            restaurantSlug={restaurantSlug}
            hasImage={!!recipe.image_path}
            initial={recipe.imageUrls}
            preview={recipe.imagePreview}
            aspect="portrait"
          />
        </div>
      </div>

      {showCaption && (glass || rim) ? (
        <figcaption>
          {glass ? <span className="book-glass">{glass}</span> : null}
          {rim ? <span className="book-rim">{rim}</span> : null}
        </figcaption>
      ) : null}

      {sharedNote?.trim() ? (
        <BartenderNote id="shared-bartender-note" note={sharedNote.trim()} />
      ) : null}
    </figure>
  );
}
