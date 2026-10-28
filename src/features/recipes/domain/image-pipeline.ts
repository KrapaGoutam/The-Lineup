import {
  IMAGE_LIMITS,
  resizedDimensions,
  sniffImage,
  validateDimensions,
  validateOutput,
  validateSource,
  type StoredMime,
} from "./image-rules";
export type PreparedImage = {
  hero: Blob;
  thumb: Blob;
  mime: StoredMime;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
};
function encode(
  canvas: HTMLCanvasElement,
  mime: StoredMime,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}
async function output(
  image: HTMLImageElement,
  edge: number,
  target: number,
  preferred: StoredMime,
) {
  const dimensions = resizedDimensions(
    image.naturalWidth,
    image.naturalHeight,
    edge,
  );
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is unavailable in this browser.");
  const draw = (mime: StoredMime) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  let mime = preferred;
  draw(mime);
  let blob = await encode(canvas, mime, 0.86);
  if (
    !blob ||
    blob.type !== mime ||
    sniffImage(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) !== mime
  ) {
    mime = "image/jpeg";
    draw(mime);
    blob = await encode(canvas, mime, 0.86);
  }
  if (!blob) throw new Error("This browser could not prepare the image.");
  // Bound the quality search; dimensions and no-upscale remain fixed.
  for (const quality of [0.74, 0.62]) {
    if (blob.size <= target) break;
    const smaller = await encode(canvas, mime, quality);
    if (smaller && smaller.type === mime) blob = smaller;
  }
  return { blob, mime, ...dimensions };
}
export async function prepareRecipeImage(file: File): Promise<PreparedImage> {
  validateSource(file);
  if (
    sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer())) !==
    file.type
  )
    throw new Error("Unsupported or invalid image file.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(
        "This image could not be opened. Choose a valid JPEG, PNG or WebP.",
      );
    }
    validateDimensions(image.naturalWidth, image.naturalHeight);
    const hero = await output(
      image,
      IMAGE_LIMITS.heroEdge,
      400 * 1024,
      "image/webp",
    );
    const thumb = await output(
      image,
      IMAGE_LIMITS.thumbEdge,
      60 * 1024,
      hero.mime,
    );
    const mime = await validateOutput(hero.blob, "hero");
    if ((await validateOutput(thumb.blob, "thumb")) !== mime)
      throw new Error("Image formats did not match. Try another photo.");
    return {
      hero: hero.blob,
      thumb: thumb.blob,
      mime,
      width: hero.width,
      height: hero.height,
      thumbWidth: thumb.width,
      thumbHeight: thumb.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
