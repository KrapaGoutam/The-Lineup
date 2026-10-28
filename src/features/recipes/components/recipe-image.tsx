"use client";
import { Martini } from "lucide-react";
import { useRecipeImages } from "../hooks/use-recipe-images";
import type { ImageUrls } from "../domain/image-rules";
export function RecipeImage(props: {
  recipeId: string;
  name: string;
  restaurantSlug?: string;
  initial?: ImageUrls;
  hasImage?: boolean;
  preview?: string;
  thumbnail?: boolean;
}) {
  const { urls, failed, onError, revision } = useRecipeImages({
    restaurantSlug: props.restaurantSlug ?? "",
    recipeId: props.recipeId,
    initial: props.initial,
    enabled: !!props.restaurantSlug && !!props.hasImage,
  });
  const source =
    !failed && (props.preview || (props.thumbnail ? urls?.thumb : urls?.hero));
  return (
    <div
      data-testid="recipe-image"
      className={`bg-muted mx-auto flex w-full items-center justify-center overflow-hidden rounded-lg border ${props.thumbnail ? "aspect-[4/5]" : "aspect-[16/10] max-w-[520px]"}`}
    >
      {source ? (
        // Private, expiring URLs intentionally bypass the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={revision}
          src={source}
          alt={props.name}
          loading={props.thumbnail ? "lazy" : "eager"}
          decoding="async"
          className="size-full object-cover"
          onError={onError}
        />
      ) : (
        <Martini aria-hidden="true" className="text-muted-foreground size-16" />
      )}
    </div>
  );
}
