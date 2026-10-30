export const IMAGE_LIMITS = {
  source: 8 * 1024 * 1024,
  hero: 2 * 1024 * 1024,
  thumb: 300 * 1024,
  heroEdge: 1600,
  thumbEdge: 480,
  minSide: 200,
} as const;
export const IMAGE_TTL = 3600;
export const IMAGE_REFRESH_WINDOW = 5 * 60 * 1000;
export type StoredMime = "image/webp" | "image/jpeg";
export type ImageUrls = {
  hero: string | null;
  thumb: string | null;
  expiresAt: number;
};
export type ImageMetadata = {
  image_path: string | null;
  image_thumb_path: string | null;
};
export function sniffImage(bytes: Uint8Array): StoredMime | "image/png" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
    return "image/png";
  const ascii = (start: number, value: string) =>
    [...value].every((c, i) => bytes[start + i] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}
export function validateSource(file: Pick<Blob, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Unsupported image type. Choose JPEG, PNG or WebP.");
  if (!file.size || file.size > IMAGE_LIMITS.source)
    throw new Error("Image must be no larger than 8 MB.");
}
export function resizedDimensions(width: number, height: number, edge: number) {
  if (![width, height, edge].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Image dimensions are invalid.");
  const scale = Math.min(1, edge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function validateDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    Math.min(width, height) < IMAGE_LIMITS.minSide
  )
    throw new Error(
      "Image is too small. The short side must be at least 200 pixels.",
    );
}
export function storedExtension(mime: StoredMime) {
  return mime === "image/webp" ? "webp" : "jpg";
}
export async function validateOutput(
  blob: Blob,
  kind: "hero" | "thumb",
): Promise<StoredMime> {
  if (!blob.size || blob.size > IMAGE_LIMITS[kind])
    throw new Error("Processed image exceeds upload limit.");
  const mime = sniffImage(
    new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
  );
  if ((mime !== "image/webp" && mime !== "image/jpeg") || blob.type !== mime)
    throw new Error("Processed image format is invalid.");
  return mime;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function imagePaths(
  org: string,
  recipe: string,
  mime: StoredMime,
  freshId = crypto.randomUUID(),
) {
  if (![org, recipe, freshId].every((id) => uuid.test(id)))
    throw new Error("Invalid image scope.");
  const base = `${org}/${recipe}/${freshId}`;
  const ext = storedExtension(mime);
  return {
    image_path: `${base}.${ext}`,
    image_thumb_path: `${base}-thumb.${ext}`,
  };
}
export function isScopedImagePath(path: string, org: string, recipe: string) {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === org &&
    parts[1] === recipe &&
    /^[0-9a-f-]{36}(-thumb)?\.(webp|jpg)$/i.test(parts[2]) &&
    uuid.test(parts[2].replace(/(-thumb)?\.(webp|jpg)$/i, ""))
  );
}
