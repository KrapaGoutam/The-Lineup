// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  IMAGE_LIMITS,
  imagePaths,
  isScopedImagePath,
  resizedDimensions,
  sniffImage,
  storedExtension,
  validateDimensions,
  validateOutput,
  validateSource,
} from "./image-rules";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
describe("recipe image rules", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s at 8 MiB",
    (type) =>
      expect(() =>
        validateSource({ type, size: IMAGE_LIMITS.source }),
      ).not.toThrow(),
  );
  it.each(["image/gif", "image/svg+xml", "text/plain", ""])(
    "rejects %s",
    (type) =>
      expect(() => validateSource({ type, size: 100 })).toThrow("Unsupported"),
  );
  it("rejects empty and oversized inputs", () => {
    for (const size of [0, IMAGE_LIMITS.source + 1])
      expect(() => validateSource({ type: "image/jpeg", size })).toThrow();
  });
  it("checks decoded short side", () => {
    expect(() => validateDimensions(200, 300)).not.toThrow();
    for (const dims of [
      [199, 400],
      [NaN, 300],
      [0, 0],
    ])
      expect(() => validateDimensions(...(dims as [number, number]))).toThrow();
  });
  it.each([
    [4000, 2000, 1600, 1600, 800],
    [2000, 4000, 480, 240, 480],
    [300, 200, 1600, 300, 200],
    [333, 777, 480, 206, 480],
  ])("preserves ratio without upscale %s x %s", (w, h, edge, width, height) =>
    expect(resizedDimensions(w, h, edge)).toEqual({ width, height }),
  );
  it("rejects invalid geometry", () =>
    expect(() => resizedDimensions(Infinity, 1, 480)).toThrow());
  it("sniffs contents independently of names", () => {
    expect(sniffImage(new Uint8Array([255, 216, 255]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      "image/png",
    );
    expect(sniffImage(new TextEncoder().encode("RIFF0000WEBP"))).toBe(
      "image/webp",
    );
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("maps extensions and creates immutable paired paths", () => {
    expect(storedExtension("image/jpeg")).toBe("jpg");
    const a = imagePaths(org, id, "image/webp"),
      b = imagePaths(org, id, "image/webp");
    expect(a).not.toEqual(b);
    expect(a.image_thumb_path).toBe(
      a.image_path.replace(".webp", "-thumb.webp"),
    );
    expect(isScopedImagePath(a.image_path, org, id)).toBe(true);
    expect(isScopedImagePath(a.image_path, id, org)).toBe(false);
    expect(() => imagePaths("bad", id, "image/jpeg")).toThrow();
  });
  it.each(["hero", "thumb"] as const)(
    "enforces %s byte boundary and magic/MIME",
    async (kind) => {
      const bytes = new Uint8Array(IMAGE_LIMITS[kind]);
      bytes.set([255, 216, 255]);
      await expect(
        validateOutput(new Blob([bytes], { type: "image/jpeg" }), kind),
      ).resolves.toBe("image/jpeg");
      await expect(
        validateOutput(
          new Blob([bytes, new Uint8Array(1)], { type: "image/jpeg" }),
          kind,
        ),
      ).rejects.toThrow("limit");
      await expect(
        validateOutput(new Blob([bytes], { type: "image/webp" }), kind),
      ).rejects.toThrow("format");
      await expect(
        validateOutput(new Blob([], { type: "image/jpeg" }), kind),
      ).rejects.toThrow();
    },
  );
});
