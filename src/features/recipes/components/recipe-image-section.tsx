"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  uploadRecipeImageAction,
  removeRecipeImageAction,
} from "../actions/recipe-image-actions";
import { prepareRecipeImage } from "../domain/image-pipeline";
import type { ImageMetadata, ImageUrls } from "../domain/image-rules";
import { RecipeImage } from "./recipe-image";
export function RecipeImageSection({
  recipeId,
  name,
  version,
  restaurantSlug,
  demo = false,
  disabled = false,
  metadata,
  initial,
  preview,
  onChanged,
  onBusy,
  onStale,
  onSessionInvalid,
}: {
  recipeId?: string;
  name: string;
  version: number | null;
  restaurantSlug?: string;
  demo?: boolean;
  disabled?: boolean;
  metadata?: ImageMetadata;
  initial?: ImageUrls;
  preview?: string;
  onChanged: (
    version: number,
    metadata: ImageMetadata,
    preview?: string,
  ) => void;
  onBusy: (busy: boolean) => void;
  onStale: (message: string) => void;
  onSessionInvalid: () => void;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const hasImage = !!(metadata?.image_path || preview);
  async function mutate(file?: File) {
    if (lock.current || !recipeId || !version || disabled) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      let prepared;
      if (file) {
        setStatus("Preparing image…");
        prepared = await prepareRecipeImage(file);
      }
      if (demo) {
        // Data URLs are session-memory only and need no object-URL lifecycle.
        const local = prepared
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(prepared.hero);
            })
          : undefined;
        onChanged(
          version + 1,
          { image_path: null, image_thumb_path: null },
          local,
        );
      } else {
        if (!restaurantSlug) throw new Error("Sign in to manage photos.");
        setStatus(file ? "Uploading photo and saving…" : "Removing photo…");
        const scope = { restaurantSlug, recipeId, expectedVersion: version };
        const form = new FormData();
        Object.entries(scope).forEach(([key, value]) =>
          form.set(key, String(value)),
        );
        if (prepared) {
          form.set("hero", prepared.hero);
          form.set("thumb", prepared.thumb);
        }
        const result = prepared
          ? await uploadRecipeImageAction(form)
          : await removeRecipeImageAction(scope);
        if (!result.ok) {
          if (result.sessionInvalid) onSessionInvalid();
          if (result.kind === "stale") onStale(result.error);
          throw new Error(result.error);
        }
        onChanged(result.data.version, result.data);
      }
      setStatus(file ? "Photo saved." : "Photo removed.");
    } catch (e) {
      setStatus("");
      setError(
        e instanceof Error ? e.message : "Photo could not be saved. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section
      className="border-border flex flex-col gap-4 rounded-xl border p-4"
      aria-busy={busy}
    >
      <h2 className="text-lg font-semibold">Image</h2>
      {!recipeId ? (
        <p className="text-muted-foreground">
          Save the recipe first, then add a photo.
        </p>
      ) : (
        <>
          <RecipeImage
            key={`${metadata?.image_path ?? preview ?? "empty"}`}
            recipeId={recipeId}
            name={name}
            restaurantSlug={demo ? undefined : restaurantSlug}
            hasImage={hasImage}
            initial={initial}
            preview={preview}
          />
          {!disabled && (
            <div className="flex flex-wrap gap-3">
              <input
                ref={picker}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Recipe photo"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void mutate(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => picker.current?.click()}
              >
                {hasImage ? "Replace photo" : "Add photo"}
              </Button>
              {hasImage && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirm(true)}
                >
                  Remove photo
                </Button>
              )}
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            JPEG, PNG or WebP, up to 8 MB. Minimum short side: 200 pixels.
          </p>
        </>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove this recipe photo?"
        description="The recipe will show a placeholder."
      >
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirm(false)}
          >
            Keep photo
          </Button>
          <Button
            type="button"
            onClick={() => {
              setConfirm(false);
              void mutate();
            }}
          >
            Remove photo
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
