// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { prepareRecipeImage } from "./image-pipeline";
const jpeg = () =>
  new File([new Uint8Array([255, 216, 255, 1])], "synthetic.jpg", {
    type: "image/jpeg",
  });
const output = (mime: string) =>
  new Blob(
    [
      mime === "image/webp"
        ? new TextEncoder().encode("RIFF0000WEBP0000")
        : new Uint8Array([255, 216, 255, 1]),
    ],
    { type: mime },
  );
let fallback = false,
  width = 3200,
  height = 2000,
  decodeFailure = false,
  oversize = false;
const sizes: number[][] = [];
const fillRect = vi.fn();
beforeEach(() => {
  fallback = false;
  width = 3200;
  height = 2000;
  decodeFailure = false;
  oversize = false;
  sizes.length = 0;
  fillRect.mockClear();
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = height;
      src = "";
      async decode() {
        if (decodeFailure) throw Error("decode");
      }
    },
  );
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: vi.fn(),
        fillRect,
        drawImage: vi.fn(),
        fillStyle: "",
      }),
      toBlob(callback: (blob: Blob) => void, mime: string) {
        const canvas = this as unknown as { width: number; height: number };
        sizes.push([canvas.width, canvas.height]);
        callback(
          oversize
            ? new Blob([output(mime), new Uint8Array(3 * 1024 * 1024)], {
                type: mime,
              })
            : output(fallback && mime === "image/webp" ? "image/jpeg" : mime),
        );
      },
    }),
  });
  vi.spyOn(URL, "revokeObjectURL");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("native image preparation orchestration", () => {
  it("derives hero and thumbnail from one decode", async () => {
    const r = await prepareRecipeImage(jpeg());
    expect(r).toMatchObject({
      width: 1600,
      height: 1000,
      thumbWidth: 480,
      thumbHeight: 300,
      mime: "image/webp",
    });
    expect(sizes).toEqual([
      [1600, 1000],
      [480, 300],
    ]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("JPEG fallback fills white before drawing", async () => {
    fallback = true;
    const r = await prepareRecipeImage(jpeg());
    expect(r.mime).toBe("image/jpeg");
    expect(r.thumb.type).toBe("image/jpeg");
    expect(fillRect).toHaveBeenCalled();
  });
  it("does not upscale smaller images", async () => {
    width = 300;
    height = 200;
    expect(await prepareRecipeImage(jpeg())).toMatchObject({
      width: 300,
      height: 200,
      thumbWidth: 300,
      thumbHeight: 200,
    });
  });
  it("cleans object URL after decode failure", async () => {
    decodeFailure = true;
    await expect(prepareRecipeImage(jpeg())).rejects.toThrow(
      "could not be opened",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("rejects decoded tiny image", async () => {
    width = 199;
    height = 500;
    await expect(prepareRecipeImage(jpeg())).rejects.toThrow("too small");
    expect(sizes).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid source bytes before decode", async () => {
    await expect(
      prepareRecipeImage(
        new File(["fake"], "fake.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("invalid");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it("rejects outputs still oversized after bounded quality search", async () => {
    oversize = true;
    await expect(prepareRecipeImage(jpeg())).rejects.toThrow("limit");
    expect(sizes).toHaveLength(6);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
