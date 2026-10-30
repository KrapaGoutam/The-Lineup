import { RecipeImage } from "./recipe-image";
import type { RecipeDetail } from "../domain/recipe-detail";
import type {
  PresentationData,
  PresentationField,
  PresentationSpec,
} from "../domain/recipe-differences";

const LABEL =
  "text-muted-foreground text-[0.7rem] font-semibold tracking-[0.14em] uppercase";

const FIELDS: Array<[PresentationField, string]> = [
  ["glass", "Glass"],
  ["garnish", "Garnish"],
  ["rim", "Rim"],
];

function SpecList({
  spec,
  presentation,
  house,
}: {
  spec: PresentationSpec;
  presentation: PresentationData;
  house: boolean;
}) {
  const rows = FIELDS.filter(
    ([key]) =>
      presentation.specs.some((s) => s[key]) ||
      (presentation.mode === "split" && presentation.differing.has(key)),
  );
  return (
    <dl>
      {rows.map(([key, label]) => {
        const differs =
          presentation.mode === "split" && presentation.differing.has(key);
        const value = spec[key];
        return (
          <div
            key={key}
            className={`border-border border-b py-3 pr-2 pl-3 ${house && differs ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
          >
            <dt className={LABEL}>{label}</dt>
            <dd className="font-serif text-xl">
              {value ?? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Not specified</span>
                </>
              )}
              {house && differs ? (
                <span className="text-muted-foreground block font-serif text-xs italic">
                  House adjustment
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
      {spec.notes && (
        <div className="px-2 py-3">
          <dt className="sr-only">Presentation notes</dt>
          <dd className="text-muted-foreground font-serif text-base italic">
            {spec.notes}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Final Presentation follows the recipes. Specs come from persisted variant
 * fields. A recipe has one canonical image (no per-variant image fields), so
 * the single image is shown once in both the shared and the split state.
 */
export function FinalPresentation({
  recipe,
  presentation,
  restaurantSlug,
}: {
  recipe: RecipeDetail;
  presentation: PresentationData;
  restaurantSlug?: string;
}) {
  const split = presentation.mode === "split";
  const image = (
    <RecipeImage
      key={recipe.image_path ?? recipe.imagePreview ?? recipe.id}
      recipeId={recipe.id}
      name={recipe.name}
      restaurantSlug={restaurantSlug}
      hasImage={!!recipe.image_path}
      initial={recipe.imageUrls}
      preview={recipe.imagePreview}
    />
  );
  const hasSpecs = presentation.specs.some(
    (s) => s.glass || s.garnish || s.rim || s.notes,
  );

  return (
    <section aria-labelledby="recipe-final-presentation" className="space-y-6">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="border-border flex-1 border-t" />
        <h2
          id="recipe-final-presentation"
          className="font-serif text-3xl sm:text-4xl"
        >
          Final Presentation
        </h2>
        <span aria-hidden="true" className="border-border flex-1 border-t" />
      </div>

      {split ? (
        <>
          <div className="mx-auto w-full max-w-xl">{image}</div>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            {presentation.specs.map((spec) => (
              <div key={spec.variant}>
                <h3 className="mb-2 font-serif text-xl">
                  {spec.variant === "house"
                    ? "House Presentation"
                    : "Perfect Presentation"}
                </h3>
                <SpecList
                  spec={spec}
                  presentation={presentation}
                  house={spec.variant === "house"}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          className={
            hasSpecs
              ? "grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
              : "mx-auto w-full max-w-xl"
          }
        >
          {hasSpecs && (
            <SpecList
              spec={presentation.specs[0]}
              presentation={presentation}
              house={false}
            />
          )}
          <div className="w-full">{image}</div>
        </div>
      )}
    </section>
  );
}
