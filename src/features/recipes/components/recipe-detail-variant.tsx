import type { DetailVariant } from "../domain/recipe-detail";
import type { VariantDifferences } from "../domain/recipe-differences";
import { deriveOzRatio, deriveQuickMeasure } from "../domain/recipe-glance";

const LABEL =
  "text-muted-foreground text-[0.7rem] font-semibold tracking-[0.14em] uppercase";
const SECTION_RULE = "border-border mt-2 border-t";

/**
 * Non-colour marker: a thin accent edge and tint (shape + tint), plus a text
 * note on the House side and a screen-reader note on the Perfect side.
 * Intentionally not destructive/warning styling.
 */
const DIFF_ROW = "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]";

export function VariantArticle({
  variant,
  differences,
  aligned,
  className = "",
}: {
  variant: DetailVariant;
  differences: VariantDifferences;
  /** Dual desktop spread: sections sit on shared grid rows. */
  aligned: boolean;
  className?: string;
}) {
  const isHouse = variant.variant === "house";
  const label = isHouse ? "House Recipe" : "Perfect Bartending Recipe";
  const quickMeasures = deriveQuickMeasure(variant.ingredients).filter(
    (qm) => qm.measure,
  );
  const ratio = deriveOzRatio(variant.ingredients);
  const tips = variant.tips?.trim();
  const batch = variant.batch_notes?.trim();
  const rowLabel = (differs: boolean) =>
    differs ? (
      isHouse ? (
        <span className="text-muted-foreground block font-serif text-xs italic">
          House adjustment
        </span>
      ) : (
        <span className="sr-only"> (differs in House recipe)</span>
      )
    ) : null;

  return (
    <article
      id={`recipe-variant-${variant.variant}`}
      aria-labelledby={`recipe-variant-${variant.variant}-heading`}
      className={`min-w-0 ${aligned ? "lg:row-span-6 lg:grid lg:grid-rows-subgrid" : ""} ${className}`}
    >
      <h2
        id={`recipe-variant-${variant.variant}-heading`}
        tabIndex={-1}
        className="scroll-mt-4 font-serif text-2xl focus:outline-2 focus:outline-offset-2 lg:row-start-1"
      >
        {label}
      </h2>

      {variant.ingredients.length > 0 && (
        <section className="mt-8 lg:row-start-2">
          <h3 className={LABEL}>Ingredients</h3>
          <ul className={SECTION_RULE}>
            {variant.ingredients.map((i) => {
              const differs = differences.ingredientIds.has(i.id);
              return (
                <li
                  key={i.id}
                  className={`flex items-baseline gap-3 py-2 pr-2 pl-3 ${differs ? DIFF_ROW : ""}`}
                >
                  <span className="min-w-0 font-serif text-lg leading-snug">
                    {i.ingredient_name}
                    {i.preparation && (
                      <span className="text-muted-foreground text-sm italic">
                        {" "}
                        · {i.preparation}
                      </span>
                    )}
                    {rowLabel(differs)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="border-border/80 min-w-4 flex-1 translate-y-[-0.2em] border-b border-dotted"
                  />
                  <span
                    className={`shrink-0 text-right text-sm tabular-nums ${differs && isHouse ? "font-semibold" : ""}`}
                  >
                    {[i.amount, i.unit].filter(Boolean).join(" ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {quickMeasures.length > 0 && (
        <section aria-label="Quick measure" className="mt-4 lg:row-start-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3 className={LABEL}>Quick Measure</h3>
            <ul className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm font-semibold tabular-nums">
              {quickMeasures.map((qm, index) => (
                <li key={qm.id}>
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground mr-2"
                    >
                      ·
                    </span>
                  )}
                  {qm.measure}
                  <span className="sr-only"> {qm.name}</span>
                </li>
              ))}
            </ul>
            {ratio && (
              <span
                data-testid="oz-ratio"
                className="text-muted-foreground font-mono text-xs"
              >
                Oz Ratio {ratio.ratio}
              </span>
            )}
          </div>
          {ratio && ratio.excludedSummary && (
            <p className="text-muted-foreground mt-1 text-xs">
              {ratio.excludedSummary}
            </p>
          )}
        </section>
      )}

      {variant.method && (
        <section className="mt-8 lg:row-start-4">
          <h3 className={LABEL}>Method</h3>
          <p className={`${SECTION_RULE} pt-2 font-serif text-3xl break-words`}>
            {variant.method}
          </p>
        </section>
      )}

      {variant.steps.length > 0 && (
        <section className="mt-8 lg:row-start-5">
          <h3 className={LABEL}>Steps</h3>
          <ol
            className={`${SECTION_RULE} marker:text-muted-foreground list-decimal pt-2 pl-8 marker:font-serif marker:text-lg marker:italic`}
          >
            {variant.steps.map((s) => {
              const differs = differences.stepIds.has(s.id);
              return (
                <li
                  key={s.id}
                  className={`py-2 pr-2 pl-3 font-serif text-lg leading-snug ${differs ? DIFF_ROW : ""}`}
                >
                  {s.instruction}
                  {rowLabel(differs)}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {(tips || batch) && (
        <div className="border-border mt-8 space-y-3 border-l pl-4 lg:row-start-6">
          {tips && (
            <section>
              <h3 className={LABEL}>
                {isHouse ? "House Notes" : "Bartender Tips"}
              </h3>
              <p className="mt-1 font-serif text-base whitespace-pre-wrap italic">
                {tips}
              </p>
            </section>
          )}
          {batch && (
            <section>
              <h3 className={LABEL}>Batch</h3>
              <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                {batch}
              </p>
            </section>
          )}
        </div>
      )}
    </article>
  );
}
